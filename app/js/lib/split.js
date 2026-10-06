// Trainingsplan (Split) als teilbarer Text – nur Trainingstage und Übungen,
// bewusst ohne Gewichte oder andere Leistungswerte. Rein, ohne DOM.

import { isCountable } from './calc.js';
import { fmtNum } from './format.js';

const WEEK = 7 * 86400000;

/** Tage aus den Vorlagen (in deren Reihenfolge). */
export function splitFromTemplates(templates) {
  return templates.map((t) => ({
    key: 't:' + t.id,
    name: t.name,
    exercises: t.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets, ...(e.group ? { group: e.group } : {}) })),
  }));
}

/**
 * Tage aus dem Verlauf: je Trainingsname (ohne Groß/Klein, Leerzeichen) die
 * Übungen des jüngsten Trainings im Zeitraum. Regelmäßige Tage stehen in der
 * Reihenfolge, in der sie im Zeitraum zuerst vorkommen (= Ablauf der Rotation,
 * z. B. Push → Pull → Beine); seltene Tage (z. B. „Zuhause“) kommen ans Ende.
 */
export function splitFromHistory(workouts, { weeks = 8, now = Date.now() } = {}) {
  const from = now - weeks * WEEK;
  const groups = new Map();
  const recent = workouts.filter((w) => w.startedAt >= from && w.startedAt <= now).sort((a, b) => b.startedAt - a.startedAt);
  for (const w of recent) {
    const name = (w.name || 'Training').trim() || 'Training';
    const key = 'h:' + name.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = {
        key, name, count: 0, last: w.startedAt,
        exercises: (w.exercises || []).map((e) => ({
          exerciseId: e.exerciseId,
          sets: (e.sets || []).filter(isCountable).length || (e.sets || []).length,
        })),
      };
      groups.set(key, g);
    }
    g.count++;
    g.first = w.startedAt; // Liste ist absteigend sortiert -> am Ende das früheste
  }
  const all = [...groups.values()];
  const minRegular = Math.max(2, Math.max(0, ...all.map((g) => g.count)) * 0.25);
  const regular = all.filter((g) => g.count >= minRegular).sort((a, b) => a.first - b.first);
  const rare = all.filter((g) => g.count < minRegular).sort((a, b) => b.count - a.count || b.last - a.last);
  return [...regular, ...rare];
}

/** Ø Trainings pro Woche im Zeitraum. */
export function trainingFrequency(workouts, { weeks = 8, now = Date.now() } = {}) {
  const from = now - weeks * WEEK;
  return workouts.filter((w) => w.startedAt >= from && w.startedAt <= now).length / weeks;
}

/** Fertiger Text, z. B. für WhatsApp. nameOf(exerciseId) -> Übungsname. */
export function buildSplitText(days, { nameOf, showSets = true, perWeek = null, title = 'Mein Trainingsplan' } = {}) {
  const lines = [title];
  for (const d of days) {
    lines.push('', d.name);
    const letters = new Map();
    d.exercises.forEach((e, i) => {
      const sets = showSets && e.sets > 0 ? ` – ${e.sets} ${e.sets === 1 ? 'Satz' : 'Sätze'}` : '';
      if (e.group && !letters.has(e.group)) letters.set(e.group, String.fromCharCode(65 + letters.size));
      const ss = e.group ? ` (Supersatz ${letters.get(e.group)})` : '';
      lines.push(`${i + 1}. ${nameOf(e.exerciseId)}${sets}${ss}`);
    });
  }
  if (perWeek != null) lines.push('', `Trainingsfrequenz: Ø ${fmtNum(perWeek, 1)} Trainings pro Woche`);
  return lines.join('\n');
}
