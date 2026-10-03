// Backup als JSON: erzeugen, prüfen (validieren + bereinigen), zusammenführen.
// Rein, ohne DOM – auch in Node testbar.

import { parseNumber } from './format.js';

export const BACKUP_FORMAT = 'gymtracker-backup';
export const BACKUP_VERSION = 1;

/** Erzeugt das Backup-Objekt aus allen Daten. */
export function createBackup({ exercises = [], templates = [], workouts = [], settings = {} }, now = Date.now()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    data: { exercises, templates, workouts, settings },
  };
}

export function serializeBackup(backup) {
  return JSON.stringify(backup);
}

export function backupFileName(now = Date.now()) {
  const d = new Date(now);
  const pad = (x) => String(x).padStart(2, '0');
  return `gymtracker-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

// --- Bereinigung einzelner Einträge -----------------------------------------

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const id = (v) => (typeof v === 'string' && v.trim() ? v : null);
function num(v) {
  if (v == null || v === '') return null;
  return typeof v === 'number' ? (Number.isFinite(v) ? v : null) : parseNumber(v);
}
const SET_TYPES = new Set(['warmup', 'drop', 'failure']);

function cleanSet(s) {
  if (!s || typeof s !== 'object') return null;
  const out = { weight: num(s.weight), reps: num(s.reps) };
  if (SET_TYPES.has(s.type)) out.type = s.type;
  for (const k of ['distance', 'seconds', 'rpe']) {
    const v = num(s[k]);
    if (v != null) out[k] = v;
  }
  return out;
}

function cleanExercise(e) {
  if (!e || typeof e !== 'object' || !id(e.id) || !str(e.name).trim()) return null;
  const out = {
    id: e.id,
    name: e.name.trim(),
    category: str(e.category, 'Sonstige') || 'Sonstige',
    bodyweight: !!e.bodyweight,
    custom: e.custom !== false,
  };
  if (e.assisted) out.assisted = true;
  if (num(e.createdAt) != null) out.createdAt = num(e.createdAt);
  return out;
}

function cleanTemplate(t) {
  if (!t || typeof t !== 'object' || !id(t.id)) return null;
  const out = {
    id: t.id,
    name: str(t.name, 'Vorlage') || 'Vorlage',
    order: num(t.order) ?? 0,
    exercises: (Array.isArray(t.exercises) ? t.exercises : [])
      .filter((x) => x && id(x.exerciseId))
      .map((x) => ({ exerciseId: x.exerciseId, sets: Math.min(20, Math.max(1, Math.round(num(x.sets) ?? 3))) })),
  };
  for (const k of ['createdAt', 'updatedAt']) if (num(t[k]) != null) out[k] = num(t[k]);
  return out;
}

function cleanWorkout(w) {
  if (!w || typeof w !== 'object' || !id(w.id)) return null;
  const startedAt = num(w.startedAt);
  if (startedAt == null) return null;
  const out = {
    id: w.id,
    name: str(w.name, 'Training') || 'Training',
    templateId: id(w.templateId),
    startedAt,
    endedAt: num(w.endedAt),
    notes: str(w.notes),
    exercises: (Array.isArray(w.exercises) ? w.exercises : [])
      .filter((x) => x && id(x.exerciseId))
      .map((x) => ({
        exerciseId: x.exerciseId,
        notes: str(x.notes),
        sets: (Array.isArray(x.sets) ? x.sets : []).map(cleanSet).filter(Boolean),
      })),
  };
  if (typeof w.source === 'string') out.source = w.source;
  return out;
}

function cleanList(list, fn) {
  const items = Array.isArray(list) ? list : [];
  const ok = [];
  let invalid = 0;
  for (const x of items) {
    const c = fn(x);
    if (c) ok.push(c); else invalid++;
  }
  return { ok, invalid };
}

/**
 * Liest und prüft eine Backup-Datei. Wirft einen Error mit deutscher Meldung,
 * wenn die Datei kein gültiges Backup ist. Ungültige Einzeleinträge werden
 * übersprungen und in `invalid` gezählt.
 */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(String(text).replace(/^﻿/, ''));
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (!obj || typeof obj !== 'object' || obj.format !== BACKUP_FORMAT || !obj.data) {
    throw new Error('Die Datei ist kein GymTracker-Backup.');
  }
  if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
    throw new Error('Dieses Backup stammt von einer neueren App-Version. Bitte die App aktualisieren.');
  }
  const ex = cleanList(obj.data.exercises, cleanExercise);
  const tp = cleanList(obj.data.templates, cleanTemplate);
  const wo = cleanList(obj.data.workouts, cleanWorkout);
  const settings = obj.data.settings && typeof obj.data.settings === 'object' && !Array.isArray(obj.data.settings)
    ? { ...obj.data.settings } : {};
  return {
    exportedAt: Date.parse(obj.exportedAt) || null,
    exercises: ex.ok,
    templates: tp.ok,
    workouts: wo.ok,
    settings,
    invalid: ex.invalid + tp.invalid + wo.invalid,
  };
}

function mergeById(current, incoming) {
  const map = new Map(current.map((x) => [x.id, x]));
  for (const x of incoming) map.set(x.id, x);
  return [...map.values()];
}

/**
 * Berechnet den neuen Datenbestand nach dem Import.
 * mode "merge": vorhandene Daten bleiben, Einträge mit gleicher ID werden überschrieben.
 * mode "replace": nur noch die Daten aus dem Backup.
 * Eingebaute Übungen (builtinIds) werden nie aus dem Backup übernommen – sie kommen aus der App.
 */
export function planBackupImport(current, incoming, mode, builtinIds = new Set()) {
  const customOnly = (list) => list.filter((e) => !builtinIds.has(e.id));
  if (mode === 'replace') {
    return {
      exercises: customOnly(incoming.exercises),
      templates: incoming.templates,
      workouts: incoming.workouts,
      settings: { ...current.settings, ...incoming.settings },
    };
  }
  return {
    exercises: mergeById(customOnly(current.exercises), customOnly(incoming.exercises)),
    templates: mergeById(current.templates, incoming.templates),
    workouts: mergeById(current.workouts, incoming.workouts),
    settings: current.settings,
  };
}
