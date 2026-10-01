// Kennzahlen: geschätztes 1RM, Volumen, persönliche Rekorde (PRs), Verlaufsreihen.
// Rein, ohne DOM – auch in Node testbar.

const EPS = 1e-9;

/**
 * Geschätztes 1RM nach Epley: Gewicht × (1 + Wdh/30).
 * Bei genau 1 Wiederholung ist das 1RM das Gewicht selbst.
 * Ohne Gewicht (Körpergewicht) oder ohne Wiederholungen gibt es kein 1RM.
 */
export function epley1RM(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

/**
 * Ein Satz zählt für Statistik und Rekorde, wenn er erledigt ist
 * (gespeicherte Trainings enthalten nur erledigte Sätze), kein Aufwärmsatz
 * ist und Wiederholungen hat.
 */
export function isCountable(set) {
  return !!set && set.done !== false && set.type !== 'warmup' && set.reps > 0;
}

/** Kennzahlen eines einzelnen Satzes. */
export function setMetrics(set) {
  const w = set.weight > 0 ? set.weight : 0;
  const r = set.reps > 0 ? set.reps : 0;
  return {
    weight: w,
    e1rm: epley1RM(w, r) ?? 0,
    volume: w * r,
    // Wiederholungs-Rekord nur bei Sätzen ohne Zusatzgewicht (z. B. Klimmzüge)
    reps: w === 0 ? r : 0,
  };
}

/** Zusammenfassung aller Sätze einer Übung in einem Training. */
export function sessionStats(sets) {
  let maxWeight = 0, best1RM = 0, volume = 0, bestSetVolume = 0, maxReps = 0, count = 0;
  let heaviestSet = null;
  for (const s of sets || []) {
    if (!isCountable(s)) continue;
    const m = setMetrics(s);
    count++;
    if (!heaviestSet || m.weight > maxWeight || (m.weight === maxWeight && s.reps > heaviestSet.reps)) {
      maxWeight = m.weight;
      heaviestSet = s;
    }
    best1RM = Math.max(best1RM, m.e1rm);
    bestSetVolume = Math.max(bestSetVolume, m.volume);
    maxReps = Math.max(maxReps, m.reps);
    volume += m.volume;
  }
  return { count, maxWeight, best1RM, volume, bestSetVolume, maxReps, heaviestSet };
}

/** Gesamtvolumen (kg) eines Trainings. */
export function workoutVolume(workout) {
  let v = 0;
  for (const ex of workout.exercises || []) v += sessionStats(ex.sets).volume;
  return v;
}

/** Anzahl gezählter Sätze eines Trainings. */
export function workoutSetCount(workout) {
  let n = 0;
  for (const ex of workout.exercises || []) n += (ex.sets || []).filter(isCountable).length;
  return n;
}

// ---------------------------------------------------------------------------
// Rekorde

export const PR_TYPES = ['e1rm', 'weight', 'volume', 'reps'];
export const PR_LABELS = {
  e1rm: 'Geschätztes 1RM',
  weight: 'Schwerster Satz',
  volume: 'Satzvolumen',
  reps: 'Meiste Wiederholungen',
};

export function emptyBests() {
  return { has: false, e1rm: 0, weight: 0, volume: 0, reps: 0 };
}

/** Bestwerte um die Sätze eines Trainings erweitern (gibt neues Objekt zurück). */
export function updateBests(bests, sets) {
  const b = { ...bests };
  for (const s of sets || []) {
    if (!isCountable(s)) continue;
    const m = setMetrics(s);
    b.has = true;
    for (const t of PR_TYPES) if (m[t] > b[t]) b[t] = m[t];
  }
  return b;
}

/**
 * Markiert PR-Sätze innerhalb eines Trainings im Vergleich zu früheren Bestwerten.
 * Pro Rekordart wird nur der beste Satz dieses Trainings markiert (bei Gleichstand
 * der erste) – und nur, wenn er den bisherigen Bestwert übertrifft.
 * Ohne Vorgeschichte (Übung zum ersten Mal) gibt es keine PRs.
 * Rückgabe: Array parallel zu `sets`, je Eintrag ein Array von Rekordarten.
 */
export function detectSetPRs(sets, bests) {
  const result = (sets || []).map(() => []);
  if (!bests || !bests.has) return result;
  for (const t of PR_TYPES) {
    let bestIdx = -1, bestVal = 0;
    (sets || []).forEach((s, i) => {
      if (!isCountable(s)) return;
      const v = setMetrics(s)[t];
      if (v > bestVal + EPS) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx !== -1 && bestVal > bests[t] + EPS) result[bestIdx].push(t);
  }
  return result;
}

/** Trainings chronologisch aufsteigend (ohne das Original zu verändern). */
export function sortAsc(workouts) {
  return [...(workouts || [])].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Bestwerte einer Übung aus allen Trainings vor `beforeTs` (exklusive),
 * optional ohne ein bestimmtes Training (z. B. das gerade bearbeitete).
 */
export function bestsForExercise(workouts, exerciseId, { beforeTs = Infinity, excludeId = null } = {}) {
  let b = emptyBests();
  for (const w of workouts || []) {
    if (w.id === excludeId || !(w.startedAt < beforeTs)) continue;
    for (const ex of w.exercises || []) {
      if (ex.exerciseId === exerciseId) b = updateBests(b, ex.sets);
    }
  }
  return b;
}

/**
 * PRs für alle Trainings in einem chronologischen Durchlauf.
 * Rückgabe: Map workoutId -> { count, byExercise: Array(je Übungseintrag) von Arrays (je Satz) von Rekordarten }
 */
export function computeAllPRs(workouts) {
  const bestsByExercise = new Map();
  const out = new Map();
  for (const w of sortAsc(workouts)) {
    let count = 0;
    const byExercise = (w.exercises || []).map((ex) => {
      const bests = bestsByExercise.get(ex.exerciseId) || emptyBests();
      const prs = detectSetPRs(ex.sets, bests);
      for (const p of prs) if (p.length) count++;
      bestsByExercise.set(ex.exerciseId, updateBests(bests, ex.sets));
      return prs;
    });
    out.set(w.id, { count, byExercise });
  }
  return out;
}

/** Letztes Training (vor `beforeTs`) mit dieser Übung: { workout, entry } oder null. */
export function lastPerformance(workouts, exerciseId, { beforeTs = Infinity, excludeId = null } = {}) {
  let best = null;
  for (const w of workouts || []) {
    if (w.id === excludeId || !(w.startedAt < beforeTs)) continue;
    if (best && w.startedAt <= best.workout.startedAt) continue;
    const entry = (w.exercises || []).find((ex) => ex.exerciseId === exerciseId && (ex.sets || []).length);
    if (entry) best = { workout: w, entry };
  }
  return best;
}

/**
 * Verlauf einer Übung: ein Eintrag pro Training (aufsteigend nach Datum).
 * Kommt die Übung in einem Training mehrfach vor, werden die Sätze zusammengefasst.
 */
export function exerciseHistory(workouts, exerciseId) {
  const rows = [];
  for (const w of sortAsc(workouts)) {
    const sets = [];
    for (const ex of w.exercises || []) if (ex.exerciseId === exerciseId) sets.push(...(ex.sets || []));
    if (!sets.length) continue;
    rows.push({ workoutId: w.id, workoutName: w.name, date: w.startedAt, sets, stats: sessionStats(sets) });
  }
  return rows;
}

export const SERIES = {
  e1rm: { label: 'Geschätztes 1RM', key: 'best1RM', unit: 'kg' },
  weight: { label: 'Schwerster Satz', key: 'maxWeight', unit: 'kg' },
  volume: { label: 'Volumen pro Training', key: 'volume', unit: 'kg' },
  reps: { label: 'Meiste Wiederholungen', key: 'maxReps', unit: 'Wdh.' },
};

/** Datenpunkte {x: Zeitstempel, y: Wert} für ein Diagramm; Trainings ohne Wert entfallen. */
export function progressSeries(history, metric, { since = -Infinity } = {}) {
  const key = SERIES[metric].key;
  return history
    .filter((h) => h.date >= since && h.stats[key] > 0)
    .map((h) => ({ x: h.date, y: h.stats[key], workoutId: h.workoutId }));
}

/**
 * Persönliche Rekorde einer Übung inkl. Datum.
 * Rückgabe: { e1rm, weight, volume, sessionVolume, reps } jeweils { value, date, workoutId, set } oder null.
 */
export function personalRecords(workouts, exerciseId) {
  const rec = { e1rm: null, weight: null, volume: null, sessionVolume: null, reps: null };
  for (const h of exerciseHistory(workouts, exerciseId)) {
    for (const s of h.sets) {
      if (!isCountable(s)) continue;
      const m = setMetrics(s);
      for (const t of PR_TYPES) {
        if (m[t] > 0 && (!rec[t] || m[t] > rec[t].value + EPS)) {
          rec[t] = { value: m[t], date: h.date, workoutId: h.workoutId, set: s };
        }
      }
    }
    if (h.stats.volume > 0 && (!rec.sessionVolume || h.stats.volume > rec.sessionVolume.value + EPS)) {
      rec.sessionVolume = { value: h.stats.volume, date: h.date, workoutId: h.workoutId, set: null };
    }
  }
  return rec;
}

/** Wochenstatistik (Mo–So) für die Startseite. */
export function weekSummary(workouts, now = Date.now()) {
  const d = new Date(now);
  const day = (d.getDay() + 6) % 7; // Montag = 0
  d.setHours(0, 0, 0, 0);
  const start = d.getTime() - day * 86400000;
  const inWeek = (workouts || []).filter((w) => w.startedAt >= start && w.startedAt <= now);
  return {
    count: inWeek.length,
    volume: inWeek.reduce((sum, w) => sum + workoutVolume(w), 0),
  };
}
