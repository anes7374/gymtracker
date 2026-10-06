// Verlauf: Kalender oder Liste aller Trainings, Detailansicht.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, promptDialog } from '../ui/sheets.js';
import { navigate, back } from '../router.js';
import * as repo from '../repo.js';
import { startWorkout } from './home.js';
import { computeAllPRs, sessionStats, workoutVolume, workoutSetCount, setMetrics, prLabel } from '../lib/calc.js';
import { monthGrid, workoutsByDay, countsByWeek, dayKey, startOfWeek, periodSummary, workoutTypeColors } from '../lib/stats.js';
import { fmtDate, fmtTime, fmtDuration, fmtMonth, fmtNum, fmtSet, count } from '../lib/format.js';

const PAGE = 40;
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
// Ansicht, Monat und gewählter Tag bleiben beim Zurückkehren erhalten.
const histState = { mode: 'calendar', year: null, month: null, selected: null };

const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

export async function historyView() {
  const workouts = await repo.workouts();
  const prs = computeAllPRs(workouts);
  const { weeklyGoal } = await repo.settings();
  const templates = await repo.templates();
  const body = h('div', { class: 'page' });
  const addBtn = h('button', {
    class: 'icon-btn', 'aria-label': 'Training nachtragen',
    onclick: () => {
      const sel = histState.selected;
      navigate('/history/add/' + (sel && fromKey(sel) <= Date.now() ? sel : dayKey(Date.now())));
    },
  }, icon('plus'));

  if (!workouts.length) {
    body.append(h('div', { class: 'empty' },
      icon('history', { size: 40 }),
      h('p', null, 'Noch keine Trainings. Beendete Trainings erscheinen hier.'),
      h('p', { class: 'muted small' }, 'Tipp: Deinen bisherigen Verlauf kannst du unter „Mehr“ aus Strong importieren.')));
    return { title: 'Verlauf', tab: 'history', body, actions: [addBtn] };
  }

  const seg = h('div', { class: 'segmented' });
  const content = h('div', { class: 'history-content' });
  const render = () => {
    clear(seg);
    for (const [mode, label] of [['calendar', 'Kalender'], ['list', 'Liste']]) {
      seg.append(h('button', {
        class: 'seg' + (histState.mode === mode ? ' active' : ''),
        onclick: () => { histState.mode = mode; render(); },
      }, label));
    }
    clear(content).append(histState.mode === 'calendar' ? calendarView(workouts, prs, weeklyGoal, templates) : listView(workouts, prs));
  };
  render();
  body.append(seg, content);
  return { title: 'Verlauf', tab: 'history', body, actions: [addBtn] };
}

function listView(workouts, prs) {
  const wrap = h('div');
  const container = h('div');
  wrap.append(container);
  let shown = 0;
  let lastMonth = null;
  const more = h('button', { class: 'btn secondary block', onclick: () => renderMore() }, 'Weitere laden');

  function renderMore() {
    const slice = workouts.slice(shown, shown + PAGE);
    for (const w of slice) {
      const month = fmtMonth(w.startedAt);
      if (month !== lastMonth) {
        lastMonth = month;
        container.append(h('h2', { class: 'month-head' }, month));
      }
      container.append(workoutCard(w, prs.get(w.id)?.count || 0));
    }
    shown += slice.length;
    if (shown >= workouts.length) more.remove();
  }
  renderMore();
  if (shown < workouts.length) wrap.append(more);
  return wrap;
}

function calendarView(workouts, prs, goal, templates) {
  const now = Date.now();
  const thisYear = new Date(now).getFullYear();
  const thisMonth = new Date(now).getMonth();
  if (histState.year == null) { histState.year = thisYear; histState.month = thisMonth; }
  const byDay = workoutsByDay(workouts);
  const weekCounts = countsByWeek(workouts);
  const prDays = new Set(workouts.filter((w) => prs.get(w.id)?.count).map((w) => dayKey(w.startedAt)));
  // Farbe je Trainingsart (z. B. Push/Pull/Beine), Rest grau
  const types = workoutTypeColors(workouts, templates, { now });
  const typeClass = (list) => {
    if (!list.length) return null;
    const slot = types.slotOf(list[0].name);
    return slot == null ? 'type-other' : 'type-' + slot;
  };
  const hasOther = workouts.some((w) => types.slotOf(w.name) == null);
  const todayKey = dayKey(now);
  const wrap = h('div', { class: 'calendar-view' });

  const isCurrentMonth = () => histState.year === thisYear && histState.month === thisMonth;
  const goTo = (year, month) => {
    histState.year = year;
    histState.month = month;
    histState.selected = null;
    render();
  };
  const shift = (n) => {
    if (n > 0 && isCurrentMonth()) return; // keine Zukunft
    const d = new Date(histState.year, histState.month + n, 1);
    goTo(d.getFullYear(), d.getMonth());
  };

  function render() {
    const { year, month } = histState;
    const first = new Date(year, month, 1).getTime();
    const nextFirst = new Date(year, month + 1, 1).getTime();

    const grid = h('div', { class: 'cal-grid' },
      WEEKDAYS.map((d) => h('span', { class: 'cal-dow' }, d)),
      h('span', { class: 'cal-dow', title: 'Trainings pro Woche' }, 'Wo'));
    for (const week of monthGrid(year, month)) {
      for (const ts of week) {
        const k = dayKey(ts);
        const list = byDay.get(k) || [];
        const cls = ['cal-day',
          new Date(ts).getMonth() !== month && 'out',
          list.length && 'trained',
          typeClass(list),
          k === todayKey && 'today',
          k === histState.selected && 'selected',
          ts > now && 'future'].filter(Boolean).join(' ');
        grid.append(h('button', {
          class: cls,
          'aria-label': fmtDate(ts) + (list.length ? ', ' + list.map((w) => w.name).join(', ') : '') + (prDays.has(k) ? ', Rekord' : ''),
          'aria-pressed': String(k === histState.selected),
          onclick: () => { histState.selected = histState.selected === k ? null : k; render(); },
        },
        String(new Date(ts).getDate()),
        prDays.has(k) ? h('span', { class: 'cal-pr' }) : null,
        list.length > 1 ? h('span', { class: 'cal-multi' }, String(list.length)) : null));
      }
      const wc = weekCounts.get(startOfWeek(week[0])) || 0;
      grid.append(h('span', {
        class: 'cal-week' + (wc >= goal ? ' met' : ''), title: `${count(wc, 'Training', 'Trainings')} in dieser Woche`,
      }, wc ? String(wc) : ''));
    }

    // Wischen nach links/rechts wechselt den Monat
    let x0 = null, y0 = null;
    grid.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dy) < 40) shift(dx < 0 ? 1 : -1);
    });

    const sum = periodSummary(workouts, first, nextFirst, prs);
    const sel = histState.selected;
    const shown = sel ? byDay.get(sel) || [] : workouts.filter((w) => w.startedAt >= first && w.startedAt < nextFirst);
    const monthName = fmtMonth(first);
    const mini = (label, value) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value));

    clear(wrap).append(
      h('section', { class: 'card cal-card' },
        h('div', { class: 'cal-head' },
          h('button', { class: 'icon-btn', 'aria-label': 'Vorheriger Monat', onclick: () => shift(-1) }, icon('back')),
          h('button', { class: 'cal-title', title: 'Zum aktuellen Monat', onclick: () => goTo(thisYear, thisMonth) }, monthName),
          h('button', { class: 'icon-btn', 'aria-label': 'Nächster Monat', disabled: isCurrentMonth(), onclick: () => shift(1) }, icon('chevron'))),
        grid,
        h('div', { class: 'cal-legend muted small' },
          types.legend.map((t) => h('span', { class: 'lg-item' }, h('span', { class: 'lg-dot type-' + t.slot }), t.name)),
          hasOther || !types.legend.length ? h('span', { class: 'lg-item' }, h('span', { class: 'lg-dot type-other' }), types.legend.length ? 'Andere' : 'Training') : null,
          h('span', { class: 'lg-item' }, h('span', { class: 'lg-dot pr' }), 'Rekord'),
          h('span', { class: 'lg-item' }, `Wo = Trainings/Woche, grün ab ${goal}`))),
      h('div', { class: 'stat-row month-stats' },
        mini('Trainings', fmtNum(sum.count, 0)),
        mini('Zeit', sum.duration ? `${fmtNum(sum.duration / 3600000, 1)} h` : '–'),
        mini('Volumen', sum.volume >= 1000 ? `${fmtNum(sum.volume / 1000, 1)} t` : `${fmtNum(sum.volume, 0)} kg`),
        mini('Rekorde', fmtNum(sum.prs, 0))),
      h('h2', { class: 'month-head' }, sel ? fmtDate(fromKey(sel)) : `Trainings im ${monthName.split(' ')[0]}`),
      ...(shown.length
        ? shown.map((w) => workoutCard(w, prs.get(w.id)?.count || 0))
        : [h('div', { class: 'empty small' },
          h('p', null, sel ? 'An diesem Tag hast du nicht trainiert.' : 'In diesem Monat hast du nicht trainiert.'),
          sel && fromKey(sel) <= now
            ? h('button', { class: 'btn secondary', onclick: () => navigate('/history/add/' + sel) }, icon('plus'), 'Training nachtragen')
            : null)]),
    );
  }

  render();
  return wrap;
}

function workoutCard(w, prCount) {
  const duration = w.endedAt ? ' · ' + fmtDuration(w.endedAt - w.startedAt) : '';
  const lines = w.exercises.slice(0, 5).map((e) => {
    const st = sessionStats(e.sets);
    return h('div', { class: 'wc-line' },
      h('span', { class: 'wc-ex' }, `${st.count || e.sets.length} × ${repo.exerciseName(e.exerciseId)}`),
      h('span', { class: 'wc-best' }, st.heaviestSet ? fmtSet(st.heaviestSet) : ''));
  });
  return h('button', { class: 'card workout-card', onclick: () => navigate('/history/' + w.id) },
    h('div', { class: 'wc-head' },
      h('strong', null, w.name),
      prCount ? h('span', { class: 'pr-badge' }, icon('trophy', { size: 16 }), String(prCount)) : null),
    h('div', { class: 'muted small' }, `${fmtDate(w.startedAt)} · ${fmtTime(w.startedAt)}${duration}`),
    h('div', { class: 'wc-lines' }, lines,
      w.exercises.length > 5 ? h('div', { class: 'muted small' }, `+ ${w.exercises.length - 5} weitere`) : null),
    h('div', { class: 'wc-foot muted small' }, `${count(workoutSetCount(w), 'Satz', 'Sätze')} · ${fmtNum(workoutVolume(w), 0)} kg Volumen`));
}

export async function workoutDetailView(id) {
  const w = await repo.getWorkout(id);
  if (!w) { navigate('/history', { replace: true }); return null; }
  const prInfo = computeAllPRs(await repo.workouts()).get(w.id) || { count: 0, byExercise: [] };

  const body = h('div', { class: 'page' });
  body.append(h('div', { class: 'card detail-head' },
    h('div', { class: 'muted' }, `${fmtDate(w.startedAt)} · ${fmtTime(w.startedAt)}`),
    h('div', { class: 'stat-row' },
      stat('Dauer', w.endedAt ? fmtDuration(w.endedAt - w.startedAt) : '–'),
      stat('Volumen', fmtNum(workoutVolume(w), 0) + ' kg'),
      stat('Sätze', String(workoutSetCount(w))),
      stat('PRs', String(prInfo.count))),
    w.notes ? h('p', { class: 'notes-text' }, w.notes) : null));

  // Supersätze: A, B, … in Reihenfolge
  const letters = new Map();
  const letterFor = (g) => {
    if (!letters.has(g)) letters.set(g, String.fromCharCode(65 + letters.size));
    return letters.get(g);
  };

  w.exercises.forEach((e, ei) => {
    const prs = prInfo.byExercise[ei] || [];
    let n = 0;
    body.append(h('section', { class: 'card ex-card readonly' },
      h('div', { class: 'ex-head' },
        e.group ? h('span', { class: 'superset-tag', title: 'Supersatz' }, letterFor(e.group)) : null,
        h('button', { class: 'ex-name', onclick: () => navigate('/exercises/' + e.exerciseId) }, repo.exerciseName(e.exerciseId)),
        icon('chevron', { size: 20, cls: 'muted' })),
      e.notes ? h('p', { class: 'notes-text' }, e.notes) : null,
      e.sets.map((s, si) => {
        const label = s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : String(++n);
        const e1 = s.type !== 'warmup' ? setMetrics(s).e1rm : null;
        const types = prs[si] || [];
        return h('div', { class: 'detail-set' + (s.type === 'warmup' ? ' warmup' : '') + (types.length ? ' pr' : '') },
          h('span', { class: 'set-num static' }, label),
          h('span', { class: 'ds-main' }, fmtSet(s), s.rpe ? h('span', { class: 'rpe-inline' }, ` @${fmtNum(s.rpe)}`) : null),
          h('span', { class: 'ds-sub muted' }, e1 ? `1RM ${fmtNum(e1, 1)}` : ''),
          types.length ? h('span', { class: 'ds-pr', title: types.map((t) => prLabel(t, repo.exercise(e.exerciseId))).join(', ') }, icon('trophy', { size: 18 })) : h('span'));
      })));
  });

  body.append(h('div', { class: 'button-stack' },
    h('button', { class: 'btn primary block', onclick: () => repeat(w) }, icon('restart'), 'Erneut trainieren'),
    h('button', { class: 'btn secondary block', onclick: () => saveAsTemplate(w) }, icon('copy'), 'Als Vorlage speichern'),
    h('button', { class: 'btn secondary block', onclick: () => navigate(`/history/${w.id}/edit`) }, icon('edit'), 'Bearbeiten'),
    h('button', { class: 'btn danger-text block', onclick: () => remove(w) }, 'Training löschen')));

  return {
    title: w.name,
    back: '/history',
    tab: 'history',
    actions: [h('button', { class: 'icon-btn', 'aria-label': 'Bearbeiten', onclick: () => navigate(`/history/${w.id}/edit`) }, icon('edit'))],
    body,
  };
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, value));
}

async function repeat(w) {
  const tpl = w.templateId ? await repo.getTemplate(w.templateId) : null;
  await startWorkout({
    id: tpl ? tpl.id : null,
    name: w.name,
    exercises: w.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length })),
  });
}

async function saveAsTemplate(w) {
  const name = await promptDialog({ title: 'Als Vorlage speichern', label: 'Name der Vorlage', value: w.name });
  if (!name) return;
  await repo.saveTemplate({ name, exercises: w.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length })) });
  toast(`Vorlage „${name}“ gespeichert`);
}

async function remove(w) {
  if (!(await confirmDialog({
    title: 'Training löschen?', message: `„${w.name}“ vom ${fmtDate(w.startedAt)} wird endgültig gelöscht.`,
    confirmLabel: 'Löschen', danger: true,
  }))) return;
  await repo.deleteWorkout(w.id);
  toast('Training gelöscht');
  back('/history');
}
