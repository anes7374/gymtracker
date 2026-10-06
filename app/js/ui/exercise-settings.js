// Einstellungen je Übung (Wiederholungsbereich, Pausenzeit, Gewichtsschritt)
// und Zuordnen von Muskelgruppen für Übungen unter „Sonstige“.

import { h, clear, toast } from './dom.js';
import { openSheet } from './sheets.js';
import * as repo from '../repo.js';
import { inferWeightStep, WEIGHT_STEPS } from '../lib/calc.js';
import { CATEGORIES } from '../lib/exercises-data.js';
import { fmtNum, fmtClock, count } from '../lib/format.js';

export const REP_RANGES = [[5, 8], [6, 10], [8, 10], [8, 12], [10, 12], [10, 15], [12, 15], [15, 20]];
export const REST_CHOICES = [45, 60, 90, 120, 150, 180, 240, 300];

export const fmtRange = (r) => (r ? `${r[0]}–${r[1]} Wdh.` : null);

/** Aktuelle Werte einer Übung (mit Standardwerten). */
export function exerciseSettings(exerciseId, settings = repo.settingsSync()) {
  return {
    range: settings.repRanges?.[exerciseId] || null,
    rest: settings.restByExercise?.[exerciseId] ?? null,
    restDefault: settings.restSeconds,
    step: settings.weightSteps?.[exerciseId] ?? null,
  };
}

/** Pausenzeit einer Übung in Sekunden (eigene oder Standard). */
export function restFor(exerciseId, settings = repo.settingsSync()) {
  return settings.restByExercise?.[exerciseId] ?? settings.restSeconds;
}

/**
 * Sheet mit den Einstellungen einer Übung. Änderungen werden sofort gespeichert.
 * Rückgabe: Promise, das beim Schließen erfüllt wird.
 */
export function exerciseSettingsSheet(exerciseId) {
  return new Promise(async (resolve) => {
    const autoStep = inferWeightStep(await repo.workouts(), exerciseId);
    const body = h('div', { class: 'form ex-settings' });

    const chipRow = (items, isActive, onPick) => h('div', { class: 'chips wrap' }, items.map((it) =>
      h('button', { class: 'chip' + (isActive(it.value) ? ' active' : ''), onclick: () => onPick(it.value) }, it.label)));

    const render = () => {
      const cur = exerciseSettings(exerciseId);
      const save = async (key, value) => { await repo.setExerciseSetting(key, exerciseId, value); render(); };
      clear(body).append(
        h('section', { class: 'setting-group' },
          h('h3', { class: 'field-label' }, 'Wiederholungsbereich'),
          h('p', { class: 'muted small' }, 'Für Progressions-Vorschläge: Schaffst du in allen Sätzen das obere Ende, schlägt die App beim nächsten Mal mehr Gewicht vor.'),
          chipRow(
            [{ label: 'Keiner', value: null }, ...REP_RANGES.map((r) => ({ label: `${r[0]}–${r[1]}`, value: r }))],
            (v) => (v == null ? !cur.range : cur.range && v[0] === cur.range[0] && v[1] === cur.range[1]),
            (v) => save('repRanges', v))),
        h('section', { class: 'setting-group' },
          h('h3', { class: 'field-label' }, 'Pausenzeit nach jedem Satz'),
          chipRow(
            [{ label: `Standard (${fmtClock(cur.restDefault)})`, value: null }, ...REST_CHOICES.map((s) => ({ label: fmtClock(s), value: s }))],
            (v) => (v == null ? cur.rest == null : cur.rest === v),
            (v) => save('restByExercise', v))),
        h('section', { class: 'setting-group' },
          h('h3', { class: 'field-label' }, 'Gewichtsschritt für +/−'),
          chipRow(
            [{ label: `Automatisch (${fmtNum(autoStep)} kg)`, value: null }, ...WEIGHT_STEPS.map((v) => ({ label: `${fmtNum(v)} kg`, value: v }))],
            (v) => (v == null ? cur.step == null : cur.step === v),
            (v) => save('weightSteps', v))),
      );
    };
    render();
    openSheet({
      title: repo.exerciseName(exerciseId),
      body,
      onClose: () => resolve(),
    });
  });
}

/** Eigene Übungen ohne Muskelgruppe („Sonstige“), die im Verlauf vorkommen. */
export async function uncategorizedExercises() {
  const used = new Set((await repo.workouts()).flatMap((w) => w.exercises.map((e) => e.exerciseId)));
  return (await repo.exercises()).filter((e) => e.custom && e.category === 'Sonstige' && used.has(e.id));
}

/** Sheet: Muskelgruppen für Übungen unter „Sonstige“ zuordnen. Rückgabe: Anzahl geänderter Übungen. */
export function assignCategoriesSheet() {
  return new Promise(async (resolve) => {
    const list = await uncategorizedExercises();
    let changedCount = 0;
    const body = h('div', { class: 'form' },
      h('p', { class: 'muted small' }, 'Diese eigenen Übungen haben noch keine Muskelgruppe. Mit Zuordnung stimmt die Auswertung „Sätze pro Muskelgruppe“.'),
      list.length ? h('div', { class: 'card list-card' }, list.map((e) => {
        const sel = h('select', {
          class: 'input', 'aria-label': `Muskelgruppe für ${e.name}`,
          onchange: async () => {
            await repo.saveExercise({ ...e, category: sel.value });
            changedCount++;
            toast(`${e.name}: ${sel.value}`);
          },
        }, CATEGORIES.map((c) => h('option', { value: c, selected: c === e.category }, c)));
        return h('label', { class: 'cat-row' }, h('span', null, e.name), sel);
      })) : h('p', null, 'Alle Übungen sind zugeordnet. 👍'));
    openSheet({
      title: list.length ? `${count(list.length, 'Übung', 'Übungen')} zuordnen` : 'Muskelgruppen',
      body,
      full: list.length > 5,
      onClose: () => resolve(changedCount),
    });
  });
}
