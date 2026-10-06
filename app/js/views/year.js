// Jahresrückblick: das Trainingsjahr in Zahlen.

import { h } from '../ui/dom.js';
import { barChart } from '../ui/chart.js';
import { navigate } from '../router.js';
import * as repo from '../repo.js';
import { computeAllPRs } from '../lib/calc.js';
import { yearInReview } from '../lib/stats.js';
import { fmtNum, fmtDateShort, count } from '../lib/format.js';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Jahre mit Trainings (neueste zuerst). */
export function yearsWithData(workouts) {
  return [...new Set(workouts.map((w) => new Date(w.startedAt).getFullYear()))].sort((a, b) => b - a);
}

export async function yearView(yearStr) {
  const year = Number(yearStr);
  const workouts = await repo.workouts();
  const { weeklyGoal } = await repo.settings();
  const years = yearsWithData(workouts);
  const r = yearInReview(workouts, year, { prInfo: computeAllPRs(workouts), goal: weeklyGoal });
  const body = h('div', { class: 'page year' });

  if (years.length > 1) {
    body.append(h('div', { class: 'chips' }, years.map((y) =>
      h('button', { class: 'chip' + (y === year ? ' active' : ''), onclick: () => navigate('/year/' + y, { replace: true }) }, String(y)))));
  }

  if (!r.count) {
    body.append(h('div', { class: 'empty' }, h('p', null, `${year} gibt es noch keine Trainings.`)));
    return { title: `Rückblick ${year}`, back: '/progress', body };
  }

  const big = (value, label) => h('div', { class: 'year-big' }, h('span', { class: 'year-value' }, value), h('span', { class: 'muted' }, label));
  body.append(
    h('div', { class: 'year-hero card' },
      h('span', { class: 'eyebrow' }, `Dein Jahr ${year}`),
      h('div', { class: 'year-grid' },
        big(fmtNum(r.count, 0), r.count === 1 ? 'Training' : 'Trainings'),
        big(fmtNum(r.duration / 3600000, 0), 'Stunden'),
        big(r.volume >= 10000 ? fmtNum(r.volume / 1000, 0) + ' t' : fmtNum(r.volume, 0) + ' kg', 'bewegt'),
        big(fmtNum(r.prs, 0), r.prs === 1 ? 'Rekord' : 'Rekorde')),
      h('p', { class: 'muted small' }, `${fmtNum(r.sets, 0)} Arbeitssätze · Ø ${fmtNum(r.perWeek, 1)} Trainings pro Woche` +
        (r.firstWorkout ? ` · erstes Training am ${fmtDateShort(r.firstWorkout)}` : ''))),
    h('section', { class: 'card stat-card' },
      h('div', { class: 'card-head' }, h('h2', null, 'Trainings pro Monat')),
      barChart(r.perMonth.map((v, i) => ({ x: new Date(year, i, 1).getTime(), y: v, i })), {
        integer: true,
        format: (v) => String(v),
        tipValue: (v) => count(v, 'Training', 'Trainings'),
        tip: (p) => MONTHS_LONG[p.i],
        xLabel: (p) => MONTHS[p.i],
        label: `Trainings pro Monat ${year}`,
      })),
  );

  const highlights = [];
  if (r.favoriteWeekday) highlights.push(['Lieblingstag', r.favoriteWeekday]);
  highlights.push(['Längste Serie', r.bestStreak ? `${count(r.bestStreak, 'Woche', 'Wochen')} mit ≥ ${weeklyGoal} Trainings` : '–']);
  body.append(h('section', { class: 'card list-card' }, highlights.map(([k, v]) =>
    h('div', { class: 'info-row' }, h('span', null, k), h('strong', null, v)))));

  if (r.progress.length) {
    body.append(h('h2', { class: 'section-title' }, 'Größter Fortschritt'),
      h('div', { class: 'card list-card' }, r.progress.map((p, i) => h('button', { class: 'row-btn', onclick: () => navigate('/exercises/' + p.exerciseId) },
        h('span', { class: 'rank' }, String(i + 1)),
        h('span', null, repo.exerciseName(p.exerciseId), h('small', { class: 'muted' }, `1RM ${fmtNum(p.first, 1)} → ${fmtNum(p.last, 1)} kg`)),
        h('span', { class: 'trend-badge up' }, `▲ ${fmtNum(p.change * 100, 0)} %`)))));
  }
  if (r.topExercises.length) {
    body.append(h('h2', { class: 'section-title' }, 'Am häufigsten trainiert'),
      h('div', { class: 'card list-card' }, r.topExercises.map((t, i) => h('button', { class: 'row-btn', onclick: () => navigate('/exercises/' + t.exerciseId) },
        h('span', { class: 'rank' }, String(i + 1)),
        h('span', null, repo.exerciseName(t.exerciseId)),
        h('span', { class: 'muted small' }, count(t.sessions, 'Training', 'Trainings'))))));
  }

  return { title: `Rückblick ${year}`, back: '/progress', body };
}
