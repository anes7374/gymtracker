// Verlauf: Liste aller Trainings (nach Monat gruppiert) und Detailansicht.

import { h, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog, promptDialog } from '../ui/sheets.js';
import { navigate, back } from '../router.js';
import * as repo from '../repo.js';
import { startWorkout } from './home.js';
import { computeAllPRs, sessionStats, workoutVolume, workoutSetCount, epley1RM, PR_LABELS } from '../lib/calc.js';
import { fmtDate, fmtTime, fmtDuration, fmtMonth, fmtNum, fmtSet, count } from '../lib/format.js';

const PAGE = 40;

export async function historyView() {
  const workouts = await repo.workouts();
  const prs = computeAllPRs(workouts);
  const body = h('div', { class: 'page' });

  if (!workouts.length) {
    body.append(h('div', { class: 'empty' },
      icon('history', { size: 40 }),
      h('p', null, 'Noch keine Trainings. Beendete Trainings erscheinen hier.'),
      h('p', { class: 'muted small' }, 'Tipp: Deinen bisherigen Verlauf kannst du unter „Mehr“ aus Strong importieren.')));
    return { title: 'Verlauf', tab: 'history', body };
  }

  const container = h('div');
  body.append(container);
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
  if (shown < workouts.length) body.append(more);

  return { title: 'Verlauf', tab: 'history', body };
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

  w.exercises.forEach((e, ei) => {
    const prs = prInfo.byExercise[ei] || [];
    let n = 0;
    body.append(h('section', { class: 'card ex-card readonly' },
      h('div', { class: 'ex-head' },
        h('button', { class: 'ex-name', onclick: () => navigate('/exercises/' + e.exerciseId) }, repo.exerciseName(e.exerciseId)),
        icon('chevron', { size: 20, cls: 'muted' })),
      e.notes ? h('p', { class: 'notes-text' }, e.notes) : null,
      e.sets.map((s, si) => {
        const label = s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : String(++n);
        const e1 = s.type !== 'warmup' ? epley1RM(s.weight, s.reps) : null;
        const types = prs[si] || [];
        return h('div', { class: 'detail-set' + (s.type === 'warmup' ? ' warmup' : '') + (types.length ? ' pr' : '') },
          h('span', { class: 'set-num static' }, label),
          h('span', { class: 'ds-main' }, fmtSet(s)),
          h('span', { class: 'ds-sub muted' }, e1 ? `1RM ${fmtNum(e1, 1)}` : ''),
          types.length ? h('span', { class: 'ds-pr', title: types.map((t) => PR_LABELS[t]).join(', ') }, icon('trophy', { size: 18 })) : h('span'));
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
