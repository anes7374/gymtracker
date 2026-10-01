// Auswertungen über viele Trainings: Wochen, Serien, Kraftindex, Trends,
// Muskelgruppen, Kalender. Rein, ohne DOM – auch in Node testbar.

import { sessionStats, isCountable, workoutVolume, workoutSetCount, sortAsc } from './calc.js';

export const DAY = 86400000;

// --- Datum (lokale Zeit; Wochen beginnen am Montag) --------------------------

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** Tage addieren über das Kalenderdatum (robust bei Sommer-/Winterzeit). */
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function addMonths(ts, n) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

/** "2026-10-01" (lokal) */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Kalenderwoche nach ISO 8601. */
export function isoWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); // Donnerstag derselben Woche
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** Wochen eines Monats für die Kalenderansicht: Array von Wochen à 7 Tagesanfängen (Mo–So). */
export function monthGrid(year, month) {
  const lastDay = new Date(year, month + 1, 0).getTime();
  const weeks = [];
  for (let ws = startOfWeek(new Date(year, month, 1).getTime()); ws <= lastDay; ws = addDays(ws, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(ws, i)));
  }
  return weeks;
}

/** Map dayKey -> Trainings dieses Tages. */
export function workoutsByDay(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const k = dayKey(w.startedAt);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(w);
  }
  return map;
}

/** Map Wochenanfang -> Anzahl Trainings. */
export function countsByWeek(workouts) {
  const map = new Map();
  for (const w of workouts) {
    const k = startOfWeek(w.startedAt);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
}

// --- Zeiträume ----------------------------------------------------------------

/** Kennzahlen für [from, to). prInfo = Ergebnis von computeAllPRs (optional). */
export function periodSummary(workouts, from, to, prInfo = null) {
  let count = 0, volume = 0, sets = 0, duration = 0, prs = 0;
  for (const w of workouts) {
    if (w.startedAt < from || w.startedAt >= to) continue;
    count++;
    volume += workoutVolume(w);
    sets += workoutSetCount(w);
    if (w.endedAt > w.startedAt) duration += w.endedAt - w.startedAt;
    if (prInfo) prs += prInfo.get(w.id)?.count || 0;
  }
  const weeks = Math.max(1, (to - from) / (7 * DAY));
  return { count, volume, sets, duration, prs, perWeek: count / weeks };
}

/** Ein Eintrag pro Woche (auch Wochen ohne Training) von der Woche von `from` bis `to`. */
export function weeklySeries(workouts, from, to) {
  const map = new Map();
  for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
    map.set(ws, { weekStart: ws, count: 0, volume: 0, sets: 0 });
  }
  for (const w of workouts) {
    const e = map.get(startOfWeek(w.startedAt));
    if (!e || w.startedAt > to) continue;
    e.count++;
    e.volume += workoutVolume(w);
    e.sets += workoutSetCount(w);
  }
  return [...map.values()];
}

/**
 * Wochen-Serie: wie viele Wochen in Folge das Wochenziel erreicht wurde.
 * Die laufende Woche zählt mit, sobald das Ziel erreicht ist – sie bricht die
 * Serie aber nicht, solange sie noch läuft.
 */
export function weekStreak(workouts, goal, now = Date.now()) {
  const counts = countsByWeek(workouts);
  const thisWeek = startOfWeek(now);
  const met = (ws) => (counts.get(ws) || 0) >= goal;

  let current = met(thisWeek) ? 1 : 0;
  for (let ws = addDays(thisWeek, -7); met(ws); ws = addDays(ws, -7)) current++;

  let best = 0, run = 0;
  if (counts.size) {
    for (let ws = Math.min(...counts.keys()); ws <= thisWeek; ws = addDays(ws, 7)) {
      run = met(ws) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { current, best: Math.max(best, current), thisWeek: counts.get(thisWeek) || 0 };
}

// --- Kraft ----------------------------------------------------------------------

/**
 * Kraftindex über alle Übungen (Start = 100), eine Messung pro Woche.
 *
 * Jede Woche ändert sich der Index um die mittlere (logarithmische)
 * Veränderung aller *aktiven* Übungen – also aller, die in den letzten
 * `activeWeeks` Wochen trainiert wurden. Übungen ohne Training in dieser Woche
 * zählen mit „unverändert“. Dadurch gilt:
 *  - Push/Pull-Wechsel wird nicht doppelt gezählt,
 *  - Steigerungen in Stufen (jede Übung in einer anderen Woche) werden voll erfasst,
 *  - ein einzelner Ausreißer (leichter Tag) hebt sich wieder auf, sobald der Wert zurückkommt,
 *  - neue Übungen fließen erst ab ihrem zweiten Training ein (keine Verzerrung),
 *  - nach längerer Pause (> activeWeeks) zählt eine Übung neu ab dem Wiedereinstieg.
 * Für eine einzelne Übung ergibt sich exakt letzter / erster Wert.
 */
export function strengthIndex(workouts, { activeWeeks = 6 } = {}) {
  const weekly = new Map(); // Wochenanfang -> Map(exerciseId -> bestes 1RM)
  for (const w of workouts) {
    const ws = startOfWeek(w.startedAt);
    for (const e of w.exercises || []) {
      const v = sessionStats(e.sets).best1RM;
      if (!(v > 0)) continue;
      if (!weekly.has(ws)) weekly.set(ws, new Map());
      const m = weekly.get(ws);
      m.set(e.exerciseId, Math.max(m.get(e.exerciseId) || 0, v));
    }
  }
  const level = new Map(); // exerciseId -> { v: letzter Wert, seen: Woche }
  const window = activeWeeks * 7 * DAY;
  const points = [];
  let index = 100;
  for (const ws of [...weekly.keys()].sort((a, b) => a - b)) {
    const cur = weekly.get(ws);
    let logSum = 0, n = 0;
    for (const [ex, prev] of level) {
      if (ws - prev.seen > window) continue; // zu lange pausiert -> zählt nicht
      n++;
      if (cur.has(ex)) logSum += Math.log(cur.get(ex) / prev.v);
    }
    if (n) index *= Math.exp(logSum / n);
    for (const [ex, v] of cur) level.set(ex, { v, seen: ws });
    points.push({ x: ws, y: index, n });
  }
  return points;
}

/** Index-Punkte ab `from`, umgerechnet in Prozent Veränderung seit dem ersten Punkt. */
export function indexChangeSince(points, from) {
  const pts = points.filter((p) => p.x >= startOfWeek(from));
  if (!pts.length) return [];
  const base = pts[0].y;
  return pts.map((p) => ({ x: p.x, y: (p.y / base - 1) * 100 }));
}

/**
 * Trend je Übung im Zeitraum: Verlauf des besten 1RM pro Training (bei
 * Körpergewichtsübungen: Wiederholungen) und Veränderung zwischen den ersten
 * und letzten Trainings (Mittel aus bis zu 3, gegen Ausreißer).
 * status: 'up' (≥ +2 %), 'down' (≤ −2 %), sonst 'flat'.
 */
export function exerciseTrends(workouts, from, to, { minSessions = 3, threshold = 0.02 } = {}) {
  const sessions = new Map(); // exerciseId -> [{ x, e1rm, reps }]
  for (const w of sortAsc(workouts)) {
    if (w.startedAt < from || w.startedAt >= to) continue;
    const perEx = new Map();
    for (const e of w.exercises || []) {
      if (!perEx.has(e.exerciseId)) perEx.set(e.exerciseId, []);
      perEx.get(e.exerciseId).push(...(e.sets || []));
    }
    for (const [ex, sets] of perEx) {
      const st = sessionStats(sets);
      if (!st.count) continue;
      if (!sessions.has(ex)) sessions.set(ex, []);
      sessions.get(ex).push({ x: w.startedAt, e1rm: st.best1RM, reps: st.maxReps, workoutId: w.id });
    }
  }
  const avg = (arr) => arr.reduce((s, p) => s + p.y, 0) / arr.length;
  const out = [];
  for (const [exerciseId, list] of sessions) {
    const metric = list.some((s) => s.e1rm > 0) ? 'e1rm' : 'reps';
    const points = list.map((s) => ({ x: s.x, y: s[metric] })).filter((p) => p.y > 0);
    if (points.length < minSessions) continue;
    const k = Math.min(3, Math.floor(points.length / 2));
    const first = avg(points.slice(0, k));
    const lastAvg = avg(points.slice(-k));
    const change = first ? (lastAvg - first) / first : 0;
    const status = change >= threshold ? 'up' : change <= -threshold ? 'down' : 'flat';
    out.push({ exerciseId, metric, points, sessions: points.length, first, last: lastAvg, change, status });
  }
  return out.sort((a, b) => b.sessions - a.sessions || b.change - a.change);
}

/** Ø Arbeitssätze pro Woche je Muskelgruppe im Zeitraum. categoryOf(exerciseId) -> Name. */
export function muscleGroupSets(workouts, categoryOf, from, to) {
  const map = new Map();
  for (const w of workouts) {
    if (w.startedAt < from || w.startedAt >= to) continue;
    for (const e of w.exercises || []) {
      const n = (e.sets || []).filter(isCountable).length;
      if (!n) continue;
      const cat = categoryOf(e.exerciseId) || 'Sonstige';
      map.set(cat, (map.get(cat) || 0) + n);
    }
  }
  const weeks = Math.max(1, (to - from) / (7 * DAY));
  return [...map]
    .map(([category, sets]) => ({ category, sets, perWeek: sets / weeks }))
    .sort((a, b) => b.sets - a.sets);
}

/** PR-Ereignisse ab `from`, neueste zuerst. prInfo = Ergebnis von computeAllPRs. */
export function recentPRs(workouts, prInfo, from = -Infinity) {
  const events = [];
  for (const w of workouts) {
    if (w.startedAt < from) continue;
    const info = prInfo.get(w.id);
    if (!info?.count) continue;
    (w.exercises || []).forEach((e, ei) => {
      (info.byExercise[ei] || []).forEach((types, si) => {
        if (types.length) events.push({ date: w.startedAt, workoutId: w.id, exerciseId: e.exerciseId, types, set: e.sets[si] });
      });
    });
  }
  return events.sort((a, b) => b.date - a.date);
}
