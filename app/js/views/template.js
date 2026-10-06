// Vorlage anlegen/bearbeiten: Name, Übungen, Satzanzahl, Reihenfolge.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { confirmDialog } from '../ui/sheets.js';
import { pickExercises } from '../ui/picker.js';
import { navigate, back } from '../router.js';
import * as repo from '../repo.js';
import { exerciseSettingsSheet, restFor } from '../ui/exercise-settings.js';
import { normalizeGroups } from '../lib/templates.js';
import { uid } from '../lib/uid.js';
import { fmtClock } from '../lib/format.js';

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
    const settings = repo.settingsSync();
    const letters = new Map();
    t.exercises.forEach((e, i) => {
      const ex = repo.exercise(e.exerciseId);
      if (e.group && !letters.has(e.group)) letters.set(e.group, String.fromCharCode(65 + letters.size));
      const range = settings.repRanges?.[e.exerciseId];
      const next = t.exercises[i + 1];
      const linked = next && e.group && next.group === e.group;
      list.append(h('div', { class: 'card tpl-row' + (e.group ? ' superset' : '') },
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
          h('button', { class: 'step', 'aria-label': 'Ein Satz mehr', disabled: e.sets >= 20, onclick: () => setSets(i, 1) }, '+')),
        h('div', { class: 'ex-chips' },
          h('button', { class: 'mini-chip' + (range ? ' set' : ''), onclick: () => openSettings(e) }, range ? `Ziel ${range[0]}–${range[1]} Wdh.` : 'Wdh.-Ziel festlegen'),
          h('button', { class: 'mini-chip' + (settings.restByExercise?.[e.exerciseId] ? ' set' : ''), onclick: () => openSettings(e) },
            icon('timer', { size: 14 }), fmtClock(restFor(e.exerciseId, settings))),
          e.group ? h('span', { class: 'mini-chip superset-chip' }, `Supersatz ${letters.get(e.group)}`) : null)));
      // Verbinden/Trennen zwischen zwei Übungen = Supersatz
      if (next) {
        list.append(h('button', {
          class: 'link-btn' + (linked ? ' linked' : ''), 'aria-pressed': String(!!linked),
          onclick: () => toggleLink(i),
        }, linked ? 'Supersatz – trennen' : '+ Als Supersatz verbinden'));
      }
    });
  }

  const fixGroups = () => { t.exercises = normalizeGroups(t.exercises); };
  function move(i, dir) {
    const j = i + dir;
    [t.exercises[i], t.exercises[j]] = [t.exercises[j], t.exercises[i]];
    fixGroups();
    dirty = true; renderList();
  }
  function remove(i) {
    t.exercises.splice(i, 1);
    fixGroups();
    dirty = true; renderList();
  }
  /** Übung i und i+1 zu einem Supersatz verbinden bzw. dazwischen trennen. */
  function toggleLink(i) {
    const a = t.exercises[i], b = t.exercises[i + 1];
    if (a.group && a.group === b.group) {
      // trennen: alles ab b bekommt eine neue Gruppe (bzw. keine)
      const g = a.group, fresh = uid();
      for (let j = i + 1; j < t.exercises.length && t.exercises[j].group === g; j++) t.exercises[j].group = fresh;
    } else {
      const g = a.group || b.group || uid();
      const old = b.group;
      for (const e of t.exercises) if (old && e.group === old) e.group = g;
      a.group = g; b.group = g;
    }
    fixGroups();
    dirty = true; renderList();
  }
  async function openSettings(e) {
    await exerciseSettingsSheet(e.exerciseId);
    renderList();
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
