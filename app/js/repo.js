// Datenzugriff der App (über IndexedDB) mit kleinem Speicher-Cache.

import * as db from './db.js';
import { BUILTIN_EXERCISES } from './lib/exercises-data.js';
import { planBackupImport } from './lib/backup.js';
import { setBodyweight } from './lib/calc.js';
import { latestMeasure, annotateBodyweight } from './lib/body.js';
import { uid } from './lib/uid.js';

export const DEFAULT_SETTINGS = {
  restSeconds: 120,   // Pausentimer in Sekunden (Standard)
  restAuto: true,     // Timer nach abgehaktem Satz automatisch starten
  restSound: true,    // Ton am Ende der Pause
  theme: 'dark',      // 'dark' | 'light' | 'system'
  weeklyGoal: 3,      // Ziel: Trainings pro Woche
  keepAwake: true,    // Bildschirm während des Trainings anlassen
  weightSteps: {},    // eigener Gewichtsschritt je Übung für +/− (sonst aus dem Verlauf)
  repRanges: {},      // Wiederholungsbereich je Übung, z. B. { id: [8, 12] }
  restByExercise: {}, // eigene Pausenzeit je Übung in Sekunden
  bodyweight: null,   // veraltet (vor Körpermaßen) – wird beim Start übernommen
};

export const BUILTIN_IDS = new Set(BUILTIN_EXERCISES.map((e) => e.id));
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

let exCache = null;   // Map id -> Übung
let woCache = null;   // Array, absteigend nach Datum
let tpCache = null;   // Array, nach Reihenfolge
let msCache = null;   // Körpermaße, absteigend nach Datum
let settingsCache = null;

export async function init() {
  await db.openDB();
  // Eingebaute Übungen immer aktuell halten (Upsert).
  await db.putMany('exercises', BUILTIN_EXERCISES);
  exCache = null;
  await Promise.all([loadExercises(), workouts(), templates(), settings(), measurements()]);
  await migrateBodyweight();
  refreshBodyweight();
}

// Früher gab es nur einen Körpergewicht-Wert in den Einstellungen -> als Messung übernehmen.
async function migrateBodyweight() {
  const s = await settings();
  if (!s.bodyweight) return;
  if (!latestMeasure(await measurements(), 'bodyweight')) {
    await db.put('measurements', { id: uid(), date: Date.now(), bodyweight: s.bodyweight });
    msCache = null;
    await measurements();
    await syncBodyweight();
  }
  await setSetting('bodyweight', null);
}

/** Aktuelles Körpergewicht (letzte Messung) für die Rechnungen im laufenden Training. */
function refreshBodyweight() {
  setBodyweight(latestMeasure(msCache || [], 'bodyweight')?.bodyweight ?? null);
}

export function currentBodyweight() {
  return latestMeasure(msCache || [], 'bodyweight')?.bodyweight ?? null;
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

/**
 * Übung `fromId` in `toId` aufgehen lassen: Verlauf + Vorlagen umschreiben, dann
 * löschen (eingebaute Übungen bleiben bestehen, nur ihr Verlauf zieht um).
 * negate: positive Gewichte werden zu Unterstützung (30 kg -> −30 kg).
 */
export async function mergeExercise(fromId, toId, { negate = false } = {}) {
  const ws = (await workouts()).filter((w) => w.exercises.some((e) => e.exerciseId === fromId));
  const ts = (await templates()).filter((t) => t.exercises.some((e) => e.exerciseId === fromId));
  const flip = (sets) => (negate ? sets.map((st) => (st.weight > 0 ? { ...st, weight: -st.weight } : st)) : sets);
  const swap = (list) => list.map((e) => (e.exerciseId === fromId ? { ...e, exerciseId: toId, ...(e.sets ? { sets: flip(e.sets) } : {}) } : e));
  const newWs = ws.map((w) => ({ ...w, exercises: swap(w.exercises) }));
  const newTs = ts.map((t) => ({ ...t, exercises: swap(t.exercises) }));
  await db.tx(['workouts', 'templates', 'exercises'], 'readwrite', (s) => {
    for (const w of newWs) s.workouts.put(w);
    for (const t of newTs) s.templates.put(t);
    if (!BUILTIN_IDS.has(fromId)) s.exercises.delete(fromId);
  });
  woCache = null; tpCache = null; exCache = null;
  await Promise.all([workouts(), templates(), loadExercises()]);
  if (negate) await syncBodyweight();
  return { workouts: newWs.length, templates: newTs.length };
}

/**
 * Vorzeichen der Gewichte einer Übung umstellen, wenn sie zur unterstützten
 * Übung wird (30 -> −30) oder es nicht mehr ist (−30 -> 30). Rückgabe: Anzahl Sätze.
 */
export async function convertAssisted(exerciseId, toAssisted) {
  let changed = 0;
  const fix = (st) => {
    if (toAssisted ? st.weight > 0 : st.weight < 0) { changed++; return { ...st, weight: -st.weight }; }
    return st;
  };
  const ws = (await workouts())
    .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId))
    .map((w) => ({ ...w, exercises: w.exercises.map((e) => (e.exerciseId === exerciseId ? { ...e, sets: e.sets.map(fix) } : e)) }));
  if (changed) {
    await db.putMany('workouts', ws);
    woCache = null;
    await workouts();
    await syncBodyweight();
  }
  return changed;
}

/** Wie viele Sätze einer Übung haben positive bzw. negative Gewichte? */
export async function weightSigns(exerciseId) {
  let positive = 0, negative = 0;
  for (const w of await workouts()) {
    for (const e of w.exercises) {
      if (e.exerciseId !== exerciseId) continue;
      for (const st of e.sets) { if (st.weight > 0) positive++; else if (st.weight < 0) negative++; }
    }
  }
  return { positive, negative };
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
  // Körpergewicht zum Trainingszeitpunkt an unterstützten Sätzen hinterlegen
  const [annotated] = annotateBodyweight([w], await measurements());
  if (annotated) w = annotated;
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

/** Gelöschtes Training wiederherstellen (Rückgängig). */
export async function restoreWorkout(w) {
  return saveWorkout(w);
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

// --- Körpermaße ----------------------------------------------------------------

export async function measurements() {
  if (!msCache) msCache = (await db.getAll('measurements')).sort((a, b) => b.date - a.date);
  return msCache;
}

export async function saveMeasurement(m) {
  const item = { ...m };
  if (!item.id) item.id = uid();
  await db.put('measurements', item);
  msCache = null;
  await measurements();
  await syncBodyweight();
  return item;
}

export async function deleteMeasurement(id) {
  await db.del('measurements', id);
  msCache = null;
  await measurements();
  await syncBodyweight();
}

/**
 * Nach Änderungen am Körpergewicht: aktuelles Gewicht setzen und bei allen
 * unterstützten Sätzen das Körpergewicht zum Trainingszeitpunkt aktualisieren.
 */
async function syncBodyweight() {
  refreshBodyweight();
  const changed = annotateBodyweight(await workouts(), await measurements());
  if (!changed.length) return;
  await db.putMany('workouts', changed);
  woCache = null;
  await workouts();
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

/** Einstellung je Übung setzen (z. B. 'repRanges', 'restByExercise'); null entfernt sie. */
export async function setExerciseSetting(key, exerciseId, value) {
  const map = { ...((await settings())[key] || {}) };
  if (value == null) delete map[exerciseId]; else map[exerciseId] = value;
  return setSetting(key, map);
}

// --- Import / Export ---------------------------------------------------------

export async function exportAll() {
  return {
    exercises: await exercises(),
    templates: await templates(),
    workouts: await workouts(),
    settings: await settings(),
    measurements: await measurements(),
  };
}

/** Backup einspielen. mode: 'merge' | 'replace' */
export async function importBackup(incoming, mode) {
  const current = await exportAll();
  const next = planBackupImport(current, incoming, mode, BUILTIN_IDS);
  await db.tx(['exercises', 'templates', 'workouts', 'meta', 'measurements'], 'readwrite', (s) => {
    s.exercises.clear();
    s.templates.clear();
    s.workouts.clear();
    s.measurements.clear();
    for (const e of BUILTIN_EXERCISES) s.exercises.put(e);
    for (const e of next.exercises) s.exercises.put(e);
    for (const t of next.templates) s.templates.put(t);
    for (const w of next.workouts) s.workouts.put(w);
    for (const m of next.measurements || []) s.measurements.put(m);
    s.meta.put({ key: 'settings', value: next.settings });
  });
  exCache = woCache = tpCache = msCache = settingsCache = null;
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
  await syncBodyweight();
}

export async function clearAll() {
  await db.tx(['exercises', 'templates', 'workouts', 'meta', 'measurements'], 'readwrite', (s) => {
    s.exercises.clear();
    s.templates.clear();
    s.workouts.clear();
    s.meta.clear();
    s.measurements.clear();
  });
  exCache = woCache = tpCache = msCache = settingsCache = null;
  await init();
}
