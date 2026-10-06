// Zusammenfassung nach dem Training inkl. Vergleich mit dem letzten Training
// gleichen Namens. Rein, ohne DOM – auch in Node testbar.

import { workoutVolume, workoutSetCount, sessionStats, compareToPrevious } from './calc.js';
import { fmtNum } from './format.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Letztes Training mit gleichem Namen vor diesem (oder null). */
export function previousSameWorkout(workouts, w) {
  let best = null;
  for (const x of workouts) {
    if (x.id === w.id || x.startedAt >= w.startedAt || norm(x.name) !== norm(w.name)) continue;
    if (!best || x.startedAt > best.startedAt) best = x;
  }
  return best;
}

/**
 * Kennzahlen eines Trainings und Vergleich mit dem letzten gleichen Training.
 * prInfo = Ergebnis von computeAllPRs (für die Anzahl neuer Rekorde).
 */
export function workoutSummary(w, workouts, prInfo = null, { ranges = {} } = {}) {
  const stats = (x) => ({
    duration: x.endedAt > x.startedAt ? x.endedAt - x.startedAt : null,
    sets: workoutSetCount(x),
    volume: workoutVolume(x),
    exercises: x.exercises.length,
  });
  const cur = { ...stats(w), prs: prInfo?.get(w.id)?.count || 0 };
  const prevW = previousSameWorkout(workouts, w);
  const prev = prevW ? stats(prevW) : null;
  const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

  // Je Übung: bestes geschätztes 1RM heute vs. letztes Mal
  const exercises = w.exercises.map((e) => {
    const now = sessionStats(e.sets);
    const before = prevW?.exercises.find((p) => p.exerciseId === e.exerciseId);
    const then = before ? sessionStats(before.sets) : null;
    // Wie beim Satz-Vergleich: mehr Gewicht im Zielbereich = besser (Progression),
    // gleiches Gewicht = Wiederholungen entscheiden
    let compare = null;
    if (now.heaviestSet && then?.heaviestSet) {
      const a = now.heaviestSet, b = then.heaviestSet;
      const dir = compareToPrevious(a, b, ranges[e.exerciseId]);
      const dw = (a.weight ?? 0) - (b.weight ?? 0);
      const text = Math.abs(dw) > 1e-9
        ? `${dw > 0 ? '+' : '−'}${fmtNum(Math.abs(dw))} kg`
        : a.reps !== b.reps ? `${a.reps > b.reps ? '+' : '−'}${Math.abs(a.reps - b.reps)} Wdh.` : 'wie letztes Mal';
      compare = { dir, text };
    }
    return {
      exerciseId: e.exerciseId,
      best: now.heaviestSet,
      compare,
      change: then && then.best1RMReliable > 0 && now.best1RMReliable > 0 ? pct(now.best1RMReliable, then.best1RMReliable) : null,
    };
  });

  return {
    current: cur,
    previous: prev ? { ...prev, date: prevW.startedAt, id: prevW.id } : null,
    delta: prev ? {
      volumePct: pct(cur.volume, prev.volume),
      sets: cur.sets - prev.sets,
      duration: cur.duration != null && prev.duration != null ? cur.duration - prev.duration : null,
    } : null,
    exercises,
  };
}
