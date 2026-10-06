// Kennzahlen: geschätztes 1RM, Volumen, persönliche Rekorde (PRs), Verlaufsreihen.
// Rein, ohne DOM – auch in Node testbar.

const EPS = 1e-9;

// Körpergewicht für unterstützte Übungen (Klimmzug-/Dip-Maschine, Band).
// Unterstützung wird als negatives Gewicht gespeichert (30 kg Hilfe = −30).
// Mit Körpergewicht: effektive Last = Körpergewicht − Unterstützung.
export const calcConfig = { bodyweight: null };
export function setBodyweight(kg) {
  calcConfig.bodyweight = kg > 0 ? kg : null;
}

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

/** Tatsächlich bewegte Last: Gewicht bzw. Körpergewicht − Unterstützung (sonst 0). */
export function effectiveLoad(set) {
  const w = set.weight;
  if (w > 0) return w;
  if (w < 0 && calcConfig.bodyweight) return Math.max(0, calcConfig.bodyweight + w);
  return 0;
}

/**
 * Kennzahlen eines einzelnen Satzes; null = für diesen Satz nicht sinnvoll.
 * weight: das eingetragene Gewicht – bei Unterstützung negativ, sodass weniger
 *         Hilfe ein höherer Wert ist (−20 > −30).
 * e1rm/volume: aus der effektiven Last (Unterstützung nur mit Körpergewicht).
 * reps: nur bei Sätzen ganz ohne Gewicht (z. B. Klimmzüge ohne Zusatz/Hilfe).
 */
export function setMetrics(set) {
  const raw = set.weight ?? 0;
  const r = set.reps > 0 ? set.reps : 0;
  const load = effectiveLoad(set);
  return {
    weight: raw !== 0 ? raw : null,
    e1rm: load > 0 ? epley1RM(load, r) : null,
    volume: load > 0 && r > 0 ? load * r : null,
    reps: raw === 0 && r > 0 ? r : null,
  };
}

/** Zusammenfassung aller Sätze einer Übung in einem Training. */
export function sessionStats(sets) {
  let maxWeight = 0, best1RM = 0, volume = 0, bestSetVolume = 0, maxReps = 0, count = 0;
  let heaviestSet = null, hasWeight = false;
  for (const s of sets || []) {
    if (!isCountable(s)) continue;
    const m = setMetrics(s);
    const w = m.weight ?? 0; // ohne Gewicht = 0, Unterstützung < 0
    count++;
    if (m.weight != null) hasWeight = true;
    if (!heaviestSet || w > maxWeight || (w === maxWeight && s.reps > heaviestSet.reps)) {
      maxWeight = w;
      heaviestSet = s;
    }
    if (m.e1rm != null) best1RM = Math.max(best1RM, m.e1rm);
    if (m.volume != null) { bestSetVolume = Math.max(bestSetVolume, m.volume); volume += m.volume; }
    if (m.reps != null) maxReps = Math.max(maxReps, m.reps);
  }
  return { count, maxWeight, best1RM, volume, bestSetVolume, maxReps, heaviestSet, hasWeight };
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
  return { has: false, e1rm: null, weight: null, volume: null, reps: null };
}

/** Rekord-Bezeichnung; bei unterstützten Übungen heißt „Schwerster Satz“ anders. */
export function prLabel(type, exercise) {
  return type === 'weight' && exercise?.assisted ? 'Weniger Unterstützung' : PR_LABELS[type];
}

/** Bestwerte um die Sätze eines Trainings erweitern (gibt neues Objekt zurück). */
export function updateBests(bests, sets) {
  const b = { ...bests };
  for (const s of sets || []) {
    if (!isCountable(s)) continue;
    const m = setMetrics(s);
    b.has = true;
    for (const t of PR_TYPES) if (m[t] != null && (b[t] == null || m[t] > b[t])) b[t] = m[t];
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
    let bestIdx = -1, bestVal = null;
    (sets || []).forEach((s, i) => {
      if (!isCountable(s)) return;
      const v = setMetrics(s)[t];
      if (v != null && (bestVal == null || v > bestVal + EPS)) { bestVal = v; bestIdx = i; }
    });
    // Nur ein PR, wenn es für diese Art schon einen Vergleichswert gibt.
    if (bestIdx !== -1 && bests[t] != null && bestVal > bests[t] + EPS) result[bestIdx].push(t);
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

/**
 * Datenpunkte {x: Zeitstempel, y: Wert} für ein Diagramm; Trainings ohne Wert entfallen.
 * assisted: Gewicht ist Unterstützung (≤ 0) – dann zählen auch Werte ≤ 0 (0 = ohne Hilfe).
 */
export function progressSeries(history, metric, { since = -Infinity, assisted = false } = {}) {
  const key = SERIES[metric].key;
  const keep = metric === 'weight' && assisted ? (h) => h.stats.count > 0 && h.stats[key] <= 0 : (h) => h.stats[key] > 0;
  return history
    .filter((h) => h.date >= since && keep(h))
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
        if (m[t] != null && (!rec[t] || m[t] > rec[t].value + EPS)) {
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

// --- Gewichtsschritt für die +/−-Knöpfe ----------------------------------------

export const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5];

/**
 * Leitet den üblichen Gewichtsschritt einer Übung aus dem Verlauf ab:
 * Abstände zwischen verschiedenen Gewichten in einem Training und Sprünge des
 * schwersten Satzes von Training zu Training. Häufigster typischer Schritt
 * gewinnt (bei Gleichstand der größere). Mindestens 2 Belege, sonst `fallback`.
 */
export function inferWeightStep(workouts, exerciseId, fallback = 2.5) {
  const counts = new Map();
  const add = (d) => {
    d = Math.round(d * 100) / 100;
    if (WEIGHT_STEPS.includes(d)) counts.set(d, (counts.get(d) || 0) + 1);
  };
  let prevTop = 0;
  for (const h of exerciseHistory(workouts, exerciseId)) {
    // Beträge, damit es auch für Unterstützung (negativ) funktioniert
    const ws = [...new Set(h.sets.filter(isCountable).map((s) => Math.abs(s.weight || 0)).filter((w) => w > 0))].sort((a, b) => a - b);
    for (let i = 1; i < ws.length; i++) add(ws[i] - ws[i - 1]);
    const top = Math.abs(h.stats.maxWeight || 0);
    if (top > 0 && prevTop > 0 && top !== prevTop) add(Math.abs(top - prevTop));
    if (top > 0) prevTop = top;
  }
  let best = null, bestN = 0;
  for (const [d, n] of counts) if (n > bestN || (n === bestN && d > best)) { best = d; bestN = n; }
  return bestN >= 2 ? best : fallback;
}

// --- Vorwerte beim Loggen -------------------------------------------------------

/**
 * Ordnet jedem Satz den passenden Satz vom letzten Mal zu: Aufwärmsatz zu
 * Aufwärmsatz, Arbeitssatz zu Arbeitssatz (jeweils in Reihenfolge).
 */
export function matchPrevious(sets, prevSets = []) {
  const warm = prevSets.filter((s) => s.type === 'warmup');
  const work = prevSets.filter((s) => s.type !== 'warmup');
  let w = 0, n = 0;
  return sets.map((s) => (s.type === 'warmup' ? warm[w++] : work[n++]) || null);
}

/**
 * Vorschläge (graue Platzhalter) für Gewicht und Wiederholungen:
 * zuerst die Werte des passenden Satzes vom letzten Mal; gibt es den nicht
 * (mehr Sätze als letztes Mal oder neue Übung), der vorherige Satz dieses
 * Trainings (bzw. dessen Vorschlag).
 */
export function setSuggestions(sets, prevSets = []) {
  const prev = matchPrevious(sets, prevSets);
  const res = [];
  sets.forEach((s, i) => {
    const isWarm = s.type === 'warmup';
    let j = i - 1;
    while (j >= 0 && (sets[j].type === 'warmup') !== isWarm) j--;
    const out = {};
    for (const k of ['weight', 'reps']) {
      out[k] = prev[i]?.[k] ?? (j >= 0 ? sets[j][k] ?? res[j][k] : null) ?? null;
    }
    res.push(out);
  });
  return res;
}
