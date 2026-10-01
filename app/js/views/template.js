// Vorlage anlegen/bearbeiten: Name, Übungen, Satzanzahl, Reihenfolge.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/sheets.js';
import { pickExercises } from '../ui/picker.js';
import { navigate, back } from '../router.js';
import * as repo from '../repo.js';

export async function templateView(id) {
  const isNew = id === 'new';
  const existing = isNew ? null : await repo.getTemplate(id);
  if (!isNew && !existing) { navigate('/', { replace: true }); return null; }
  const t = existing ? structuredClone(existing) : { name: '', exercises: [] };
  let dirty = false;

  const nameIn = h('input', {
    class: 'title-input', type: 'text', value: t.name, placeholder: 'Name, z. B. Push', 'aria-label': 'Name der Vorlage',
    enterkeyhint: 'done', oninput: () => { t.name = nameIn.value; dirty = true; },
  });
  const list = h('div', { class: 'tpl-list' });

  function renderList() {
    clear(list);
    if (!t.exercises.length) {
      list.append(h('div', { class: 'empty' }, h('p', null, 'Füge Übungen hinzu. Die Reihenfolge kannst du mit den Pfeilen ändern.')));
    }
    t.exercises.forEach((e, i) => {
      const ex = repo.exercise(e.exerciseId);
      list.append(h('div', { class: 'card tpl-row' },
        h('div', { class: 'tpl-top' },
          h('span', { class: 'tpl-index' }, String(i + 1)),
          h('div', { class: 'tpl-name' },
            h('strong', null, repo.exerciseName(e.exerciseId)),
            h('span', { class: 'muted small' }, ex?.category || '')),
          h('button', { class: 'icon-btn', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(i, -1) }, icon('up')),
          h('button', { class: 'icon-btn', 'aria-label': 'Nach unten', disabled: i === t.exercises.length - 1, onclick: () => move(i, 1) }, icon('down')),
          h('button', { class: 'icon-btn danger', 'aria-label': 'Entfernen', onclick: () => remove(i) }, icon('trash'))),
        h('div', { class: 'stepper' },
          h('button', { class: 'step', 'aria-label': 'Ein Satz weniger', disabled: e.sets <= 1, onclick: () => setSets(i, -1) }, '−'),
          h('span', { class: 'step-val' }, `${e.sets} ${e.sets === 1 ? 'Satz' : 'Sätze'}`),
          h('button', { class: 'step', 'aria-label': 'Ein Satz mehr', disabled: e.sets >= 20, onclick: () => setSets(i, 1) }, '+'))));
    });
  }

  function move(i, dir) {
    const j = i + dir;
    [t.exercises[i], t.exercises[j]] = [t.exercises[j], t.exercises[i]];
    dirty = true; renderList();
  }
  function remove(i) {
    t.exercises.splice(i, 1);
    dirty = true; renderList();
  }
  function setSets(i, d) {
    t.exercises[i].sets = Math.max(1, Math.min(20, t.exercises[i].sets + d));
    dirty = true; renderList();
  }
  async function add() {
    const ids = await pickExercises();
    for (const exerciseId of ids) t.exercises.push({ exerciseId, sets: 3 });
    if (ids.length) { dirty = true; renderList(); }
  }

  async function save() {
    document.activeElement?.blur();
    t.name = nameIn.value.trim();
    if (!t.name) { toast('Bitte gib der Vorlage einen Namen.'); nameIn.focus(); return; }
    await repo.saveTemplate(t);
    dirty = false;
    toast(isNew ? 'Vorlage angelegt' : 'Vorlage gespeichert');
    back('/');
  }

  async function cancel() {
    if (dirty && !(await confirmDialog({ title: 'Änderungen verwerfen?', confirmLabel: 'Verwerfen', danger: true }))) return;
    back('/');
  }

  async function del() {
    if (!(await confirmDialog({
      title: 'Vorlage löschen?', message: `„${t.name || 'Vorlage'}“ wird gelöscht. Dein Trainingsverlauf bleibt erhalten.`,
      confirmLabel: 'Löschen', danger: true,
    }))) return;
    await repo.deleteTemplate(t.id);
    toast('Vorlage gelöscht');
    back('/');
  }

  renderList();
  const body = h('div', { class: 'page' },
    h('div', { class: 'workout-top' }, nameIn),
    list,
    h('button', { class: 'btn secondary block big', onclick: add }, icon('plus'), 'Übung hinzufügen'),
    isNew ? null : h('button', { class: 'btn danger-text block', onclick: del }, 'Vorlage löschen'));

  if (isNew) requestAnimationFrame(() => nameIn.focus());

  return {
    title: isNew ? 'Neue Vorlage' : 'Vorlage bearbeiten',
    back: '/',
    onBack: cancel,
    hideTabbar: true,
    actions: [h('button', { class: 'btn primary small', onclick: save }, 'Speichern')],
    body,
  };
}
