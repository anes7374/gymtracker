// Fortschritt: Überblick über alle Trainings.
// Jeder Abschnitt beantwortet eine Frage:
//   Werde ich stärker?          -> Kraftindex über alle Übungen
//   Bin ich konsequent?          -> Trainings pro Woche + Wochen-Serie
//   Trainiere ich ausgewogen?    -> Sätze pro Muskelgruppe und Woche
//   Was läuft, was stagniert?    -> Trend je Übung
//   Was habe ich geschafft?      -> neue Rekorde

import { h, clear } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { lineChart, barChart, sparkline } from '../ui/chart.js';
import { navigate } from '../router.js';
import * as repo from '../repo.js';
import { computeAllPRs, setMetrics } from '../lib/calc.js';
import {
  periodSummary, weeklySeries, weekStreak, strengthIndex, indexChangeSince, exerciseTrends, muscleGroupSets,
  recentPRs, startOfWeek, addDays, addMonths, isoWeek,
} from '../lib/stats.js';
import { fmtNum, fmtDateShort, fmtRelativeDay, fmtSet, count } from '../lib/format.js';

const RANGES = [['4w', '4 W'], ['3m', '3 M'], ['6m', '6 M'], ['1y', '1 J'], ['all', 'Alle']];
const RANGE_TEXT = { '4w': 'in 4 Wochen', '3m': 'in 3 Monaten', '6m': 'in 6 Monaten', '1y': 'in 12 Monaten', all: 'seit Beginn' };
const PREV_TEXT = { '4w': 'den 4 Wochen davor', '3m': 'den 3 Monaten davor', '6m': 'den 6 Monaten davor', '1y': 'den 12 Monaten davor' };
const GUIDE = [10, 20]; // gängiger Richtwert: Arbeitssätze pro Muskelgruppe und Woche
const TREND_PREVIEW = 8;
const SHORT_PR = { e1rm: '1RM', weight: 'Gewicht', volume: 'Satzvolumen', reps: 'Wdh.' };

const state = { range: '3m', allTrends: false };

function rangeStart(key, oldest, now) {
  if (key === '4w') return addDays(startOfWeek(now), -21);
  if (key === '3m') return addMonths(now, -3);
  if (key === '6m') return addMonths(now, -6);
  if (key === '1y') return addMonths(now, -12);
  return oldest;
}

const signedPct = (v, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), d)} %`;
const fmtVolume = (kg) => (kg >= 10000 ? `${fmtNum(kg / 1000, 1)} t` : `${fmtNum(kg, 0)} kg`);

export async function progressView() {
  const workouts = await repo.workouts();
  const { weeklyGoal } = await repo.settings();
  const body = h('div', { class: 'page' });

  if (!workouts.length) {
    body.append(h('div', { class: 'empty' },
      icon('chart', { size: 40 }),
      h('p', null, 'Noch keine Trainings. Sobald du trainierst oder deinen Verlauf aus Strong importierst, siehst du hier deinen Fortschritt.')));
    return { title: 'Fortschritt', tab: 'progress', body };
  }

  const prInfo = computeAllPRs(workouts);
  const index = strengthIndex(workouts);
  const oldest = workouts[workouts.length - 1].startedAt;

  body.append(streakCard(weekStreak(workouts, weeklyGoal), weeklyGoal));

  const chips = h('div', { class: 'chips range-chips', role: 'tablist', 'aria-label': 'Zeitraum' });
  const content = h('div', { class: 'progress-content' });
  body.append(chips, content);

  const render = () => {
    clear(chips);
    for (const [key, label] of RANGES) {
      chips.append(h('button', {
        class: 'chip' + (key === state.range ? ' active' : ''), role: 'tab', 'aria-selected': String(key === state.range),
        onclick: () => { state.range = key; state.allTrends = false; render(); },
      }, label));
    }
    const now = Date.now();
    const from = rangeStart(state.range, oldest, now);
    const to = now + 1;
    clear(content).append(
      summaryTiles(workouts, prInfo, from, to),
      strengthCard(index, from),
      consistencyCard(workouts, from, to, weeklyGoal),
      muscleCard(workouts, from, to),
      trendsCard(workouts, from, to),
      prsCard(workouts, prInfo, from),
    );
  };
  render();

  return { title: 'Fortschritt', tab: 'progress', body };
}

function card(title, sub, ...children) {
  return h('section', { class: 'card stat-card' },
    h('div', { class: 'card-head' }, h('h2', null, title), sub ? h('p', { class: 'muted small' }, sub) : null),
    ...children);
}

// --- Serie ------------------------------------------------------------------------

function streakCard(st, goal) {
  const done = st.thisWeek >= goal;
  return h('section', { class: 'card streak-card' },
    h('div', { class: 'streak-main' },
      h('span', { class: 'streak-icon' + (st.current ? ' on' : '') }, icon('flame', { size: 26 })),
      h('div', { class: 'streak-text' },
        h('strong', null, st.current ? `${count(st.current, 'Woche', 'Wochen')} in Folge` : 'Noch keine Serie'),
        h('span', { class: 'muted small' }, `Wochenziel ${goal}× erreicht · Rekord: ${count(st.best, 'Woche', 'Wochen')}`))),
    h('div', { class: 'week-progress' },
      h('div', { class: 'week-progress-text' },
        h('span', null, 'Diese Woche'),
        h('strong', null, `${st.thisWeek} / ${goal}`, done ? ' ✓' : '')),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': goal, 'aria-valuenow': st.thisWeek },
        h('div', { class: 'meter-fill' + (done ? ' met' : ''), style: { width: Math.min(100, (st.thisWeek / goal) * 100) + '%' } }))));
}

// --- Kennzahlen ---------------------------------------------------------------------

function summaryTiles(workouts, prInfo, from, to) {
  const cur = periodSummary(workouts, from, to, prInfo);
  const prev = state.range === 'all' ? null : periodSummary(workouts, from - (to - from), from, prInfo);
  const delta = (c, p) => {
    if (!prev || !p) return null;
    const pct = ((c - p) / p) * 100;
    const dir = Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down';
    return h('span', { class: 'delta ' + dir, title: 'Veränderung gegenüber ' + PREV_TEXT[state.range] },
      `${dir === 'up' ? '▲' : dir === 'down' ? '▼' : '='} ${fmtNum(Math.abs(pct), 0)} %`);
  };
  const tile = (label, value, sub, c, p) => h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    h('span', { class: 'stat-sub' }, sub ? h('span', { class: 'muted' }, sub) : null, delta(c, p)));

  return h('div', { class: 'tiles' },
    h('div', { class: 'stat-row grid2' },
      tile('Trainings', fmtNum(cur.count, 0), `Ø ${fmtNum(cur.perWeek, 1)}/Woche`, cur.count, prev?.count),
      tile('Volumen', fmtVolume(cur.volume), null, cur.volume, prev?.volume),
      tile('Arbeitssätze', fmtNum(cur.sets, 0), null, cur.sets, prev?.sets),
      tile('Neue Rekorde', fmtNum(cur.prs, 0), null, cur.prs, prev?.prs)),
    prev && prev.count ? h('p', { class: 'muted small tiles-note' }, `▲▼ im Vergleich zu ${PREV_TEXT[state.range]}`) : null);
}

// --- Kraft --------------------------------------------------------------------------

function strengthCard(index, from) {
  const pts = indexChangeSince(index, from);
  const sub = 'Ø Veränderung deines geschätzten 1RM über alle aktiven Übungen';
  if (pts.length < 2) {
    return card('Kraftentwicklung', sub, h('div', { class: 'empty small' }, h('p', null, 'Noch zu wenige Trainings in diesem Zeitraum.')));
  }
  const last = pts[pts.length - 1].y;
  return card('Kraftentwicklung', sub,
    h('div', { class: 'hero' },
      h('span', { class: 'hero-value ' + (last > 0.5 ? 'up' : last < -0.5 ? 'down' : '') }, signedPct(last)),
      h('span', { class: 'muted' }, RANGE_TEXT[state.range])),
    lineChart(pts, {
      format: (v) => signedPct(v),
      axisFormat: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), 0)} %`,
      label: `Kraftentwicklung ${RANGE_TEXT[state.range]}: ${signedPct(last)}`,
    }),
    h('p', { class: 'muted small card-note' },
      'Jede Übung zählt gleich viel und wird nur mit sich selbst verglichen. Übungen, die du gerade nicht trainierst (z. B. Pull an Push-Tagen), zählen als unverändert. Ein einzelner leichter Tag ist nur eine kleine Delle, die wieder verschwindet.'));
}

// --- Konstanz -----------------------------------------------------------------------

function consistencyCard(workouts, from, to, goal) {
  const weeks = weeklySeries(workouts, from, to);
  const met = weeks.filter((w) => w.count >= goal).length;
  return card('Trainings pro Woche', `Wochenziel (${goal}×) erreicht in ${met} von ${count(weeks.length, 'Woche', 'Wochen')}`,
    barChart(weeks.map((w) => ({ x: w.weekStart, y: w.count })), {
      integer: true,
      goal,
      format: (v) => String(v),
      tipValue: (v) => count(v, 'Training', 'Trainings'),
      tip: (p) => `KW ${isoWeek(p.x)} · ab ${fmtDateShort(p.x)}`,
      label: `Trainings pro Woche, Ziel ${goal}`,
    }));
}

// --- Muskelgruppen ------------------------------------------------------------------

function muscleCard(workouts, from, to) {
  const rows = muscleGroupSets(workouts, (id) => repo.exercise(id)?.category, from, to);
  if (!rows.length) return card('Sätze pro Muskelgruppe', null, h('div', { class: 'empty small' }, h('p', null, 'Keine Sätze in diesem Zeitraum.')));
  const max = Math.max(GUIDE[1] * 1.25, ...rows.map((r) => r.perWeek));
  const pct = (v) => (v / max) * 100 + '%';
  return card('Sätze pro Muskelgruppe', 'Ø Arbeitssätze pro Woche',
    h('div', { class: 'mg-list' }, rows.map((r) =>
      h('div', { class: 'mg-row' },
        h('span', { class: 'mg-label' }, r.category),
        h('div', { class: 'mg-track' },
          h('div', { class: 'mg-band', style: { left: pct(GUIDE[0]), width: pct(GUIDE[1] - GUIDE[0]) } }),
          h('div', { class: 'mg-fill', style: { width: pct(r.perWeek) } })),
        h('span', { class: 'mg-value' }, fmtNum(r.perWeek, 1))))),
    h('div', { class: 'mg-legend muted small' },
      h('span', { class: 'mg-swatch' }), `Richtwert für Muskelaufbau: ca. ${GUIDE[0]}–${GUIDE[1]} Sätze pro Woche`),
    h('p', { class: 'muted small card-note' },
      'Gezählt wird die Hauptmuskelgruppe jeder Übung.' +
      (rows.some((r) => r.category === 'Sonstige') ? ' „Sonstige“ = eigene Übungen ohne Muskelgruppe – ändern unter Übungen → Übung → ⋯ → Bearbeiten.' : '')));
}

// --- Trends je Übung ----------------------------------------------------------------

function trendsCard(workouts, from, to) {
  const trends = exerciseTrends(workouts, from, to);
  const sub = 'Bestes geschätztes 1RM pro Training, Anfang vs. Ende des Zeitraums';
  if (!trends.length) {
    return card('Übungen im Trend', sub, h('div', { class: 'empty small' }, h('p', null, 'Für einen Trend braucht eine Übung mindestens 3 Trainings im Zeitraum.')));
  }
  const n = { up: 0, flat: 0, down: 0 };
  for (const t of trends) n[t.status]++;
  const list = h('div', { class: 'trend-list' });
  const more = h('button', { class: 'btn ghost block' });

  const fmtMetric = (t, v) => (t.metric === 'reps' ? `${fmtNum(v, 0)} Wdh.` : `${fmtNum(v, t.metric === 'weight' ? 2 : 1)} kg`);
  const renderList = () => {
    clear(list);
    const shown = state.allTrends ? trends : trends.slice(0, TREND_PREVIEW);
    for (const t of shown) {
      const pct = t.change * 100;
      list.append(h('button', { class: 'trend-row', onclick: () => navigate('/exercises/' + t.exerciseId) },
        h('strong', { class: 'trend-name' }, repo.exerciseName(t.exerciseId)),
        h('span', { class: 'trend-badge ' + t.status, title: { up: 'verbessert', flat: 'stagniert', down: 'rückläufig' }[t.status] },
          t.status === 'up' ? '▲' : t.status === 'down' ? '▼' : '→', ' ', signedPct(pct, 0)),
        h('span', { class: 'trend-sub muted small' }, `${count(t.sessions, 'Training', 'Trainings')} · ${fmtMetric(t, t.first)} → ${fmtMetric(t, t.last)}`),
        sparkline(t.points.map((p) => p.y), { width: 72, height: 24 })));
    }
    more.hidden = trends.length <= TREND_PREVIEW;
    more.textContent = state.allTrends ? 'Weniger anzeigen' : `Alle ${trends.length} Übungen anzeigen`;
  };
  more.addEventListener('click', () => { state.allTrends = !state.allTrends; renderList(); });
  renderList();

  return card('Übungen im Trend', sub,
    h('div', { class: 'trend-summary' },
      h('span', { class: 'trend-badge up', title: 'verbessert' }, `▲ ${n.up} besser`),
      h('span', { class: 'trend-badge flat', title: 'stagniert (weniger als ±2 %)' }, `→ ${n.flat} gleich`),
      h('span', { class: 'trend-badge down', title: 'rückläufig' }, `▼ ${n.down} schwächer`)),
    list, more);
}

// --- Rekorde ------------------------------------------------------------------------

function prsCard(workouts, prInfo, from) {
  const events = recentPRs(workouts, prInfo, from).slice(0, 8);
  if (!events.length) return card('Neue Rekorde', null, h('div', { class: 'empty small' }, h('p', null, 'Keine neuen Rekorde in diesem Zeitraum.')));
  const value = (type, set) => {
    const m = setMetrics(set);
    if (type === 'reps') return `${m.reps} Wdh.`;
    return `${fmtNum(m[type], type === 'weight' ? 2 : type === 'e1rm' ? 1 : 0)} kg`;
  };
  return card('Neue Rekorde', 'Die letzten persönlichen Bestleistungen',
    h('div', { class: 'pr-list' }, events.map((e) =>
      h('button', { class: 'pr-row', onclick: () => navigate('/history/' + e.workoutId) },
        h('span', { class: 'pr-icon' }, icon('trophy', { size: 18 })),
        h('strong', { class: 'pr-name' }, repo.exerciseName(e.exerciseId)),
        h('span', { class: 'muted small pr-date' }, fmtRelativeDay(e.date)),
        h('span', { class: 'pr-sub small' },
          h('strong', null, `${e.types[0] === 'weight' && repo.exercise(e.exerciseId)?.assisted ? 'Weniger Hilfe' : SHORT_PR[e.types[0]]} ${value(e.types[0], e.set)}`),
          h('span', { class: 'muted' }, ` · ${fmtSet(e.set)}`))))));
}
