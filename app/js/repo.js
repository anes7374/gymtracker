// Datenzugriff der App (über IndexedDB) mit kleinem Speicher-Cache.

import * as db from './db.js';
import { BUILTIN_EXERCISES } from './lib/exercises-data.js';
import { planBackupImport } from './lib/backup.js';
import { uid } from './lib/uid.js';

export const DEFAULT_SETTINGS = {
  restSeconds: 120,   // Pausentimer in Sekunden
  restAuto: true,     // Timer nach abgehaktem Satz automatisch starten
  restSound: true,    // Ton am Ende der Pause
  theme: 'dark',      // 'dark' | 'light' | 'system'
};

export const BUILTIN_IDS = new Set(BUILTIN_EXERCISES.map((e) => e.id));
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

let exCache = null;   // Map id -> Übung
let woCache = null;   // Array, absteigend nach Datum
let tpCache = null;   // Array, nach Reihenfolge
let settingsCache = null;

export async function init() {
  await db.openDB();
  // Eingebaute Übungen immer aktuell halten (Upsert).
  await db.putMany('exercises', BUILTIN_EXERCISES);
  exCache = null;
  await Promise.all([loadExercises(), workouts(), templates(), settings()]);
}

// --- Übungen -----------------------------------------------------------------

async function loadExercises() {
  if (!exCache) exCache = new Map((await db.getAll('exercises')).map((e) => [e.id, e]));
  return exCache;
}

export async function exercises() {
  const map = await loadExercises();
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name));
}

/** Synchroner Zugriff (nach init()). */
export function exercise(id) {
  return exCache?.get(id) || null;
}

export function exerciseName(id) {
  return exCache?.get(id)?.name || 'Unbekannte Übung';
}

export async function saveExercise(ex) {
  const item = { category: 'Sonstige', bodyweight: false, custom: true, createdAt: Date.now(), ...ex };
  if (!item.id) item.id = uid();
  await db.put('exercises', item);
  (await loadExercises()).set(item.id, item);
  return item;
}

export async function deleteExercise(id) {
  await db.del('exercises', id);
  exCache?.delete(id);
}

/** Anzahl Trainings bzw. Vorlagen, die eine Übung verwenden. */
export async function exerciseUsage(id) {
  const ws = await workouts();
  const ts = await templates();
  return {
    workouts: ws.filter((w) => w.exercises.some((e) => e.exerciseId === id)).length,
    templates: ts.filter((t) => t.exercises.some((e) => e.exerciseId === id)).length,
  };
}

/** Übung `fromId` in `toId` aufgehen lassen (Verlauf + Vorlagen umschreiben, dann löschen). */
export async function mergeExercise(fromId, toId) {
  const ws = (await workouts()).filter((w) => w.exercises.some((e) => e.exerciseId === fromId));
  const ts = (await templates()).filter((t) => t.exercises.some((e) => e.exerciseId === fromId));
  const swap = (list) => list.map((e) => (e.exerciseId === fromId ? { ...e, exerciseId: toId } : e));
  const newWs = ws.map((w) => ({ ...w, exercises: swap(w.exercises) }));
  const newTs = ts.map((t) => ({ ...t, exercises: swap(t.exercises) }));
  await db.tx(['workouts', 'templates', 'exercises'], 'readwrite', (s) => {
    for (const w of newWs) s.workouts.put(w);
    for (const t of newTs) s.templates.put(t);
    s.exercises.delete(fromId);
  });
  woCache = null; tpCache = null; exCache = null;
  await Promise.all([workouts(), templates(), loadExercises()]);
  return { workouts: newWs.length, templates: newTs.length };
}

// --- Trainings ---------------------------------------------------------------

export async function workouts() {
  if (!woCache) woCache = (await db.getAll('workouts')).sort((a, b) => b.startedAt - a.startedAt);
  return woCache;
}

export async function getWorkout(id) {
  return (await workouts()).find((w) => w.id === id) || null;
}

export async function saveWorkout(w) {
  await db.put('workouts', w);
  const list = (await workouts()).filter((x) => x.id !== w.id);
  list.push(w);
  woCache = list.sort((a, b) => b.startedAt - a.startedAt);
  return w;
}

export async function deleteWorkout(id) {
  await db.del('workouts', id);
  woCache = (await workouts()).filter((w) => w.id !== id);
}

// --- Vorlagen ----------------------------------------------------------------

export async function templates() {
  if (!tpCache) {
    tpCache = (await db.getAll('templates'))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }
  return tpCache;
}

export async function getTemplate(id) {
  return (await templates()).find((t) => t.id === id) || null;
}

export async function saveTemplate(t) {
  const now = Date.now();
  const list = await templates();
  const item = { createdAt: now, ...t, updatedAt: now };
  if (!item.id) item.id = uid();
  if (item.order == null) item.order = list.length ? Math.max(...list.map((x) => x.order ?? 0)) + 1 : 0;
  await db.put('templates', item);
  tpCache = null;
  await templates();
  return item;
}

export async function deleteTemplate(id) {
  await db.del('templates', id);
  tpCache = null;
}

/** Vorlage in der Liste nach oben (-1) oder unten (+1) verschieben. */
export async function moveTemplate(id, dir) {
  const list = [...(await templates())];
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  const updated = list.map((t, idx) => ({ ...t, order: idx }));
  await db.putMany('templates', updated);
  tpCache = null;
}

// --- Meta & Einstellungen ----------------------------------------------------

export async function getMeta(key, fallback = null) {
  const row = await db.get('meta', key);
  return row ? row.value : fallback;
}

export function setMeta(key, value) {
  return db.put('meta', { key, value });
}

export async function settings() {
  if (!settingsCache) settingsCache = { ...DEFAULT_SETTINGS, ...(await getMeta('settings', {})) };
  return settingsCache;
}

/** Synchroner Zugriff (nach init()). */
export function settingsSync() {
  return settingsCache || { ...DEFAULT_SETTINGS };
}

export async function setSetting(key, value) {
  const s = { ...(await settings()), [key]: value };
  settingsCache = s;
  await setMeta('settings', s);
  return s;
}

// --- Import / Export ---------------------------------------------------------

export async function exportAll() {
  return {
    exercises: await exercises(),
    templates: await templates(),
    workouts: await workouts(),
    settings: await settings(),
  };
}

/** Backup einspielen. mode: 'merge' | 'replace' */
export async function importBackup(incoming, mode) {
  const current = await exportAll();
  const next = planBackupImport(current, incoming, mode, BUILTIN_IDS);
  await db.tx(['exercises', 'templates', 'workouts', 'meta'], 'readwrite', (s) => {
    s.exercises.clear();
    s.templates.clear();
    s.workouts.clear();
    for (const e of BUILTIN_EXERCISES) s.exercises.put(e);
    for (const e of next.exercises) s.exercises.put(e);
    for (const t of next.templates) s.templates.put(t);
    for (const w of next.workouts) s.workouts.put(w);
    s.meta.put({ key: 'settings', value: next.settings });
  });
  exCache = woCache = tpCache = settingsCache = null;
  await init();
  return next;
}

/** Ergebnis von planStrongImport speichern. */
export async function importStrong(plan) {
  await db.tx(['exercises', 'workouts'], 'readwrite', (s) => {
    for (const e of plan.newExercises) s.exercises.put(e);
    for (const w of plan.workouts) s.workouts.put(w);
  });
  exCache = woCache = null;
  await Promise.all([loadExercises(), workouts()]);
}

export async function clearAll() {
  await db.tx(['exercises', 'templates', 'workouts', 'meta'], 'readwrite', (s) => {
    s.exercises.clear();
    s.templates.clear();
    s.workouts.clear();
    s.meta.clear();
  });
  exCache = woCache = tpCache = settingsCache = null;
  await init();
}
