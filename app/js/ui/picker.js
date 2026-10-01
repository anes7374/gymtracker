// Übungsauswahl (Suche, Muskelgruppen-Filter, Mehrfachauswahl) und
// Formular für eigene Übungen.

import { h, clear, toast } from './dom.js';
import { icon } from './icons.js';
import { openSheet } from './sheets.js';
import * as repo from '../repo.js';
import { CATEGORIES, normalizeExerciseName } from '../lib/exercises-data.js';
import { normalizeSearch } from '../lib/format.js';

/**
 * Öffnet die Übungsauswahl. Rückgabe: Promise<string[]> (IDs, evtl. leer).
 * multi=false: Antippen wählt sofort genau eine Übung.
 */
export function pickExercises({ title = 'Übung hinzufügen', multi = true, exclude = [] } = {}) {
  return new Promise(async (resolve) => {
    const all = (await repo.exercises()).filter((e) => !exclude.includes(e.id));
    const selected = [];
    let query = '';
    let category = 'Alle';

    const search = h('input', {
      class: 'input search', type: 'search', placeholder: 'Übung suchen …', autocomplete: 'off', enterkeyhint: 'search',
      oninput: () => { query = search.value; renderList(); },
    });
    const chips = h('div', { class: 'chips' });
    const list = h('div', { class: 'pick-list' });
    const addBtn = h('button', { class: 'btn primary block', disabled: true, onclick: () => s.close() }, 'Hinzufügen');

    const cats = ['Alle', 'Eigene', ...CATEGORIES];
    function renderChips() {
      clear(chips);
      for (const c of cats) {
        chips.append(h('button', {
          class: 'chip' + (c === category ? ' active' : ''),
          onclick: () => { category = c; renderChips(); renderList(); },
        }, c));
      }
    }

    function renderList() {
      clear(list);
      const q = normalizeSearch(query);
      const items = all.filter((e) =>
        (category === 'Alle' || (category === 'Eigene' ? e.custom : e.category === category)) &&
        (!q || normalizeSearch(e.name).includes(q)));
      if (!items.length) {
        list.append(h('div', { class: 'empty small' },
          h('p', null, 'Keine Übung gefunden.'),
          h('button', { class: 'btn secondary', onclick: createNew }, icon('plus'), query.trim() ? `„${query.trim()}“ anlegen` : 'Eigene Übung anlegen')));
        return;
      }
      for (const e of items) {
        const idx = selected.indexOf(e.id);
        list.append(h('button', {
          class: 'pick-item' + (idx !== -1 ? ' selected' : ''),
          onclick: () => toggle(e.id),
        },
        h('span', { class: 'pick-text' }, h('span', { class: 'pick-name' }, e.name), h('span', { class: 'pick-sub' }, e.custom ? `${e.category} · eigene` : e.category)),
        h('span', { class: 'pick-mark' }, idx !== -1 ? (multi ? String(idx + 1) : icon('check')) : null)));
      }
    }

    function toggle(id) {
      if (!multi) { selected.splice(0, selected.length, id); s.close(); return; }
      const i = selected.indexOf(id);
      if (i === -1) selected.push(id); else selected.splice(i, 1);
      addBtn.disabled = !selected.length;
      addBtn.textContent = selected.length ? `Hinzufügen (${selected.length})` : 'Hinzufügen';
      renderList();
    }

    async function createNew() {
      const ex = await exerciseForm({ name: query.trim() });
      if (!ex) return;
      all.push(ex);
      all.sort((a, b) => a.name.localeCompare(b.name, 'de'));
      query = ''; search.value = ''; category = 'Alle';
      renderChips();
      toggle(ex.id);
    }

    renderChips();
    renderList();
    const s = openSheet({
      title,
      full: true,
      headerAction: h('button', { class: 'text-btn', onclick: createNew }, 'Neu'),
      body: h('div', { class: 'picker' }, h('div', { class: 'picker-top' }, search, chips), list),
      footer: multi ? addBtn : null,
      onClose: () => resolve([...selected]),
    });
  });
}

/**
 * Formular zum Anlegen/Bearbeiten einer eigenen Übung.
 * Rückgabe: Promise<Übung|null> (bereits gespeichert).
 */
export function exerciseForm(existing = {}) {
  return new Promise((resolve) => {
    let result = null;
    const isEdit = !!existing.id;
    const name = h('input', { class: 'input', type: 'text', value: existing.name || '', placeholder: 'z. B. Bankdrücken (Schrägbank)', autocomplete: 'off', enterkeyhint: 'done' });
    const cat = h('select', { class: 'input' }, CATEGORIES.map((c) => h('option', { value: c, selected: c === (existing.category || 'Sonstige') }, c)));
    const bw = h('input', { type: 'checkbox', checked: !!existing.bodyweight });

    async function save() {
      const n = name.value.trim().replace(/\s+/g, ' ');
      if (!n) { name.focus(); return; }
      const dup = (await repo.exercises()).find((e) => e.id !== existing.id && normalizeExerciseName(e.name) === normalizeExerciseName(n));
      if (dup) { toast(`„${dup.name}“ gibt es schon.`); return; }
      result = await repo.saveExercise({ ...existing, name: n, category: cat.value, bodyweight: bw.checked, custom: true });
      s.close();
    }

    const s = openSheet({
      title: isEdit ? 'Übung bearbeiten' : 'Neue Übung',
      body: h('div', { class: 'form' },
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Muskelgruppe'), cat),
        h('label', { class: 'switch-row' }, h('span', null, 'Körpergewichtsübung', h('small', null, 'Gewicht ist optional (Zusatzgewicht)')), bw),
      ),
      footer: [
        h('button', { class: 'btn secondary', onclick: () => s.close() }, 'Abbrechen'),
        h('button', { class: 'btn primary', onclick: save }, 'Speichern'),
      ],
      onClose: () => resolve(result),
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    if (!isEdit) name.focus();
  });
}
