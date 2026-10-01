// Das laufende Training. Liegt im Speicher und wird bei jeder Änderung
// (leicht verzögert) in IndexedDB gesichert – übersteht also App-Neustarts.

import * as repo from './repo.js';
import { uid } from './lib/uid.js';

const KEY = 'activeWorkout';
let current = null;
let saveTimer = null;
const listeners = new Set();

export async function load() {
  current = await repo.getMeta(KEY, null);
  return current;
}

export function get() {
  return current;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(current);
}

/** Neues Training aus einer Vorlage (oder leer) anlegen. */
export async function start(template = null) {
  current = {
    id: uid(),
    name: template ? template.name : 'Training',
    templateId: template ? template.id : null,
    startedAt: Date.now(),
    endedAt: null,
    notes: '',
    exercises: template
      ? template.exercises.map((e) => newEntry(e.exerciseId, e.sets))
      : [],
  };
  await flush();
  emit();
  return current;
}

/** Neuer Übungseintrag mit `sets` leeren Sätzen. */
export function newEntry(exerciseId, sets = 3) {
  return {
    uid: uid(),
    exerciseId,
    notes: '',
    sets: Array.from({ length: Math.max(1, sets) }, () => newSet()),
  };
}

export function newSet(type) {
  const s = { weight: null, reps: null, done: false };
  if (type && type !== 'normal') s.type = type;
  return s;
}

/** Nach jeder Änderung aufrufen – speichert verzögert. */
export function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

export async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await repo.setMeta(KEY, current);
}

export async function clear() {
  current = null;
  await flush();
  emit();
}

/**
 * Wandelt ein (laufendes oder bearbeitetes) Training in die Speicherform um:
 * nur erledigte Sätze, ohne UI-Felder, Übungen ohne Sätze entfallen.
 */
export function toStored(w) {
  return {
    id: w.id,
    name: (w.name || '').trim() || 'Training',
    templateId: w.templateId || null,
    startedAt: w.startedAt,
    endedAt: w.endedAt ?? null,
    notes: w.notes || '',
    ...(w.source ? { source: w.source } : {}),
    exercises: w.exercises
      .map((e) => ({
        exerciseId: e.exerciseId,
        notes: e.notes || '',
        sets: e.sets
          .filter((s) => s.done)
          .map(({ done, ...s }) => {
            const out = { weight: s.weight ?? null, reps: s.reps ?? null };
            if (s.type && s.type !== 'normal') out.type = s.type;
            for (const k of ['distance', 'seconds', 'rpe']) if (s[k] != null) out[k] = s[k];
            return out;
          }),
      }))
      .filter((e) => e.sets.length),
  };
}

/** Gespeichertes Training in die Bearbeitungsform (alle Sätze erledigt). */
export function toEditable(w) {
  return {
    ...structuredClone(w),
    exercises: w.exercises.map((e) => ({
      uid: uid(),
      exerciseId: e.exerciseId,
      notes: e.notes || '',
      sets: e.sets.map((s) => ({ ...s, done: true })),
    })),
  };
}

// Beim Verlassen/Verstecken der App sofort sichern.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) flush();
  });
  addEventListener('pagehide', () => { if (saveTimer) flush(); });
}
