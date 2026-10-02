// Start: laufendes Training, leeres Training starten, Vorlagen.

import { h, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { actionSheet, confirmDialog } from '../ui/sheets.js';
import { navigate, refresh } from '../router.js';
import * as repo from '../repo.js';
import * as active from '../active.js';
import * as timer from '../timer.js';
import { weekSummary } from '../lib/calc.js';
import { fmtNum, fmtRelativeDay, fmtClock, count } from '../lib/format.js';
import { SAMPLE_TEMPLATES } from '../lib/exercises-data.js';

/** Training starten (aus Vorlage oder leer). Fragt nach, falls schon eins läuft. */
export async function startWorkout(template = null) {
  if (active.get()) {
    const choice = await actionSheet({
      title: 'Es läuft bereits ein Training',
      items: [
        { label: 'Laufendes Training fortsetzen', value: 'resume', icon: 'play' },
        { label: 'Verwerfen und neu starten', value: 'discard', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'resume') { navigate('/workout'); return; }
    if (choice !== 'discard') return;
    timer.stop();
  }
  await active.start(template);
  navigate('/workout');
}

export async function homeView() {
  const [templates, workouts] = await Promise.all([repo.templates(), repo.workouts()]);
  const lastBackupAt = await repo.getMeta('lastBackupAt', null);
  const act = active.get();
  const week = weekSummary(workouts);
  const { weeklyGoal } = await repo.settings();

  const lastUse = new Map();
  for (const w of workouts) if (w.templateId && !lastUse.has(w.templateId)) lastUse.set(w.templateId, w.startedAt);

  const body = h('div', { class: 'page' });

  if (act) {
    body.append(h('button', { class: 'card active-card', onclick: () => navigate('/workout') },
      h('div', { class: 'active-card-text' },
        h('span', { class: 'eyebrow' }, 'Training läuft'),
        h('strong', null, act.name),
        h('span', { class: 'muted' }, `seit ${fmtClock((Date.now() - act.startedAt) / 1000)} · ${count(act.exercises.length, 'Übung', 'Übungen')}`)),
      h('span', { class: 'btn primary small' }, 'Fortsetzen')));
  } else {
    body.append(h('button', { class: 'btn primary block big', onclick: () => startWorkout(null) }, icon('plus'), 'Leeres Training starten'));
  }

  body.append(h('div', { class: 'stat-row' },
    h('button', { class: 'stat', onclick: () => navigate('/progress') },
      h('span', { class: 'stat-label' }, 'Trainings diese Woche'),
      h('span', { class: 'stat-value' }, `${week.count} / ${weeklyGoal}`, week.count >= weeklyGoal ? ' ✓' : ''),
      h('div', { class: 'meter small' }, h('div', { class: 'meter-fill' + (week.count >= weeklyGoal ? ' met' : ''), style: { width: Math.min(100, (week.count / weeklyGoal) * 100) + '%' } }))),
    h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, 'Volumen diese Woche'), h('span', { class: 'stat-value' }, fmtNum(week.volume, 0) + ' kg'))));

  if (workouts.length >= 5 && (!lastBackupAt || Date.now() - lastBackupAt > 14 * 86400000)) {
    body.append(h('button', { class: 'card hint', onclick: () => navigate('/settings') },
      icon('share'),
      h('span', null, h('strong', null, 'Backup empfohlen'), h('br'),
        lastBackupAt ? `Letztes Backup ${fmtRelativeDay(lastBackupAt)}.` : 'Du hast noch nie ein Backup gemacht.'),
      icon('chevron')));
  }

  body.append(h('div', { class: 'section-head' },
    h('h2', null, 'Vorlagen'),
    h('div', { class: 'section-actions' },
      h('button', { class: 'icon-btn', 'aria-label': 'Split teilen (z. B. mit deinem Coach)', onclick: () => navigate('/split') }, icon('share', { size: 22 })),
      h('button', { class: 'text-btn', onclick: () => navigate('/template/new') }, icon('plus', { size: 20 }), 'Neu'))));

  if (!templates.length) {
    body.append(h('div', { class: 'empty' },
      h('p', null, 'Noch keine Vorlagen. Übernimm deinen Split aus dem Verlauf, lege eigene an – oder starte mit Beispielen.'),
      workouts.length
        ? h('button', { class: 'btn primary', onclick: () => navigate('/split') }, 'Aus meinem Verlauf übernehmen')
        : null,
      h('button', { class: 'btn secondary', onclick: createSamples }, 'Beispielvorlagen anlegen')));
  }

  const list = h('div', { class: 'template-grid' });
  for (const t of templates) {
    const names = t.exercises.map((e) => repo.exerciseName(e.exerciseId));
    const last = lastUse.get(t.id);
    list.append(h('div', { class: 'card template-card' },
      h('button', { class: 'template-main', onclick: () => templateMenu(t) },
        h('strong', null, t.name),
        h('span', { class: 'template-ex' }, names.length ? names.join(' · ') : 'Keine Übungen'),
        h('span', { class: 'muted small' }, count(t.exercises.length, 'Übung', 'Übungen') + (last ? ` · zuletzt ${fmtRelativeDay(last)}` : ''))),
      h('button', { class: 'icon-btn play', 'aria-label': `${t.name} starten`, onclick: () => startWorkout(t) }, icon('play'))));
  }
  body.append(list);

  return { title: 'Training', tab: 'train', body };
}

async function templateMenu(t) {
  const choice = await actionSheet({
    title: t.name,
    items: [
      { label: 'Training starten', value: 'start', icon: 'play' },
      { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
      { label: 'Duplizieren', value: 'copy', icon: 'copy' },
      { label: 'Nach oben', value: 'up', icon: 'up' },
      { label: 'Nach unten', value: 'down', icon: 'down' },
      { label: 'Löschen', value: 'delete', icon: 'trash', danger: true },
    ],
  });
  if (choice === 'start') startWorkout(t);
  else if (choice === 'edit') navigate('/template/' + t.id);
  else if (choice === 'copy') {
    await repo.saveTemplate({ name: t.name + ' (Kopie)', exercises: structuredClone(t.exercises) });
    toast('Vorlage dupliziert');
    refresh();
  } else if (choice === 'up' || choice === 'down') {
    await repo.moveTemplate(t.id, choice === 'up' ? -1 : 1);
    refresh();
  } else if (choice === 'delete') {
    if (await confirmDialog({ title: 'Vorlage löschen?', message: `„${t.name}“ wird gelöscht. Dein Trainingsverlauf bleibt erhalten.`, confirmLabel: 'Löschen', danger: true })) {
      await repo.deleteTemplate(t.id);
      toast('Vorlage gelöscht');
      refresh();
    }
  }
}

async function createSamples() {
  for (const s of SAMPLE_TEMPLATES) {
    await repo.saveTemplate({ name: s.name, exercises: s.exercises.map(([exerciseId, sets]) => ({ exerciseId, sets })) });
  }
  toast('Beispielvorlagen angelegt – passe sie gern an.');
  refresh();
}
