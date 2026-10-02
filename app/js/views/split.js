// Split teilen: Trainingstage mit Übungen als Text (z. B. für den Coach) –
// ohne Gewichte. Quelle: Vorlagen oder die letzten Trainings aus dem Verlauf.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/sheets.js';
import { navigate } from '../router.js';
import * as repo from '../repo.js';
import { splitFromTemplates, splitFromHistory, trainingFrequency, buildSplitText } from '../lib/split.js';
import { fmtRelativeDay, count } from '../lib/format.js';

const WEEKS = 8;
// Auswahl bleibt erhalten, solange die App offen ist.
const state = { source: null, showSets: true, showFreq: true, excluded: new Set() };

export async function splitView() {
  const [templates, workouts] = await Promise.all([repo.templates(), repo.workouts()]);
  if (!state.source) state.source = templates.length ? 'templates' : 'history';
  const body = h('div', { class: 'page' });
  const content = h('div', { class: 'split-content' });

  const render = () => {
    const days = state.source === 'templates'
      ? splitFromTemplates(templates)
      : splitFromHistory(workouts, { weeks: WEEKS });
    const chosen = days.filter((d) => !state.excluded.has(d.key));
    const perWeek = state.showFreq && workouts.length ? trainingFrequency(workouts, { weeks: WEEKS }) : null;
    const text = buildSplitText(chosen, { nameOf: repo.exerciseName, showSets: state.showSets, perWeek });

    const seg = h('div', { class: 'segmented' },
      [['templates', `Vorlagen (${templates.length})`], ['history', 'Aus Verlauf']].map(([val, label]) =>
        h('button', { class: 'seg' + (state.source === val ? ' active' : ''), onclick: () => { state.source = val; render(); } }, label)));

    const hint = state.source === 'templates'
      ? 'Deine Vorlagen in ihrer Reihenfolge.'
      : `Je Trainingsname die Übungen deines letzten Trainings (letzte ${WEEKS} Wochen).`;

    if (!days.length) {
      clear(content).append(seg, h('p', { class: 'muted small split-hint' }, hint),
        h('div', { class: 'empty' }, h('p', null, state.source === 'templates'
          ? 'Noch keine Vorlagen. Wähle „Aus Verlauf“ – dort kannst du deine Trainings auch als Vorlagen speichern.'
          : `In den letzten ${WEEKS} Wochen gibt es keine Trainings.`)));
      return;
    }

    const toggle = (label, value, onChange) => {
      const input = h('input', { type: 'checkbox', checked: value, onchange: () => onChange(input.checked) });
      return h('label', { class: 'switch-row' }, h('span', null, label), input);
    };

    clear(content).append(
      seg,
      h('p', { class: 'muted small split-hint' }, hint),
      h('h2', { class: 'section-title' }, 'Trainingstage'),
      h('div', { class: 'card list-card' }, days.map((d) => toggle(
        h('span', { class: 'split-day' },
          h('strong', null, d.name),
          h('small', null, count(d.exercises.length, 'Übung', 'Übungen') +
            (d.count ? ` · ${d.count}× in ${WEEKS} Wochen · zuletzt ${fmtRelativeDay(d.last)}` : ''))),
        !state.excluded.has(d.key),
        (on) => { if (on) state.excluded.delete(d.key); else state.excluded.add(d.key); render(); }))),
      h('h2', { class: 'section-title' }, 'Anzeigen'),
      h('div', { class: 'card list-card' },
        toggle('Satzanzahl', state.showSets, (on) => { state.showSets = on; render(); }),
        toggle('Trainingsfrequenz', state.showFreq, (on) => { state.showFreq = on; render(); })),
      h('h2', { class: 'section-title' }, 'Vorschau'),
      h('div', { class: 'card split-preview', 'aria-label': 'Vorschau des Textes' }, chosen.length ? text : 'Kein Trainingstag ausgewählt.'),
      h('div', { class: 'split-actions' },
        h('button', { class: 'btn secondary', disabled: !chosen.length, onclick: () => copy(text) }, icon('copy'), 'Kopieren'),
        h('button', { class: 'btn primary', disabled: !chosen.length, onclick: () => share(text) }, icon('share'), 'Teilen')),
      state.source === 'history'
        ? h('button', { class: 'btn ghost block', disabled: !chosen.length, onclick: () => saveAsTemplates(chosen, templates) },
          icon('plus'), 'Ausgewählte als Vorlagen speichern')
        : null,
    );
  };
  render();
  body.append(content);
  return { title: 'Split teilen', back: '/', body };
}

async function share(text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Mein Trainingsplan', text });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  copy(text);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback für ältere Browser
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast('Text kopiert – jetzt z. B. in WhatsApp einfügen');
}

async function saveAsTemplates(days, templates) {
  const existing = new Set(templates.map((t) => t.name.trim().toLowerCase()));
  const fresh = days.filter((d) => !existing.has(d.name.trim().toLowerCase()));
  const skipped = days.length - fresh.length;
  if (!fresh.length) { toast('Für alle ausgewählten Tage gibt es schon Vorlagen.'); return; }
  if (!(await confirmDialog({
    title: `${count(fresh.length, 'Vorlage', 'Vorlagen')} anlegen?`,
    message: fresh.map((d) => d.name).join(', ') + (skipped ? `\n(${skipped} mit gleichem Namen gibt es schon – werden übersprungen.)` : ''),
    confirmLabel: 'Anlegen',
  }))) return;
  for (const d of fresh) {
    await repo.saveTemplate({ name: d.name, exercises: d.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: Math.max(1, Math.min(20, e.sets || 3)) })) });
  }
  toast(`${count(fresh.length, 'Vorlage', 'Vorlagen')} angelegt ✓`);
  navigate('/');
}
