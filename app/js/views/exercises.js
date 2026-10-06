// Übungen: Liste mit Suche/Filter und Detailseite mit Fortschritt & Rekorden.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { actionSheet, confirmDialog, alertDialog } from '../ui/sheets.js';
import { pickExercises, exerciseForm } from '../ui/picker.js';
import { lineChart } from '../ui/chart.js';
import { exerciseSettingsSheet, assignCategoriesSheet, uncategorizedExercises } from '../ui/exercise-settings.js';
import { navigate, back, refresh } from '../router.js';
import * as repo from '../repo.js';
import { CATEGORIES } from '../lib/exercises-data.js';
import { exerciseHistory, personalRecords, progressSeries, SERIES, isCountable } from '../lib/calc.js';
import { fmtNum, fmtSet, fmtDate, fmtDateShort, fmtRelativeDay, normalizeSearch, count } from '../lib/format.js';

// Filter bleiben beim Zurückkehren erhalten
const listState = { q: '', cat: 'Alle', sort: 'name' };
const chartState = { metric: null, range: '6m' };

export async function exercisesView() {
  const all = await repo.exercises();
  const workouts = await repo.workouts();
  const usage = new Map();
  for (const w of workouts) {
    for (const e of w.exercises) {
      const u = usage.get(e.exerciseId);
      if (u) { if (u.lastW !== w.id) { u.count++; u.lastW = w.id; } }
      else usage.set(e.exerciseId, { count: 1, last: w.startedAt, lastW: w.id });
    }
  }

  const search = h('input', {
    class: 'input search', type: 'search', placeholder: 'Übung suchen …', value: listState.q, autocomplete: 'off',
    oninput: () => { listState.q = search.value; renderList(); },
  });
  const chips = h('div', { class: 'chips' });
  const list = h('div', { class: 'pick-list' });
  const sortBtn = h('button', { class: 'text-btn small', onclick: () => { listState.sort = listState.sort === 'name' ? 'recent' : 'name'; renderList(); } });

  function renderChips() {
    clear(chips);
    for (const c of ['Alle', 'Eigene', ...CATEGORIES]) {
      chips.append(h('button', { class: 'chip' + (c === listState.cat ? ' active' : ''), onclick: () => { listState.cat = c; renderChips(); renderList(); } }, c));
    }
  }

  function renderList() {
    sortBtn.textContent = listState.sort === 'name' ? 'Sortierung: A–Z' : 'Sortierung: Zuletzt trainiert';
    clear(list);
    const q = normalizeSearch(listState.q);
    let items = all.filter((e) =>
      (listState.cat === 'Alle' || (listState.cat === 'Eigene' ? e.custom : e.category === listState.cat)) &&
      (!q || normalizeSearch(e.name).includes(q)));
    if (listState.sort === 'recent') {
      items = [...items].sort((a, b) => (usage.get(b.id)?.last || 0) - (usage.get(a.id)?.last || 0));
    }
    if (!items.length) {
      list.append(h('div', { class: 'empty small' }, h('p', null, 'Keine Übung gefunden.')));
      return;
    }
    for (const e of items) {
      const u = usage.get(e.id);
      list.append(h('button', { class: 'pick-item', onclick: () => navigate('/exercises/' + e.id) },
        h('span', { class: 'pick-text' },
          h('span', { class: 'pick-name' }, e.name),
          h('span', { class: 'pick-sub' }, [e.category, e.custom ? 'eigene' : null, u ? `${u.count}× · zuletzt ${fmtRelativeDay(u.last)}` : null].filter(Boolean).join(' · '))),
        icon('chevron', { size: 20, cls: 'muted' })));
    }
  }

  renderChips();
  renderList();

  const uncategorized = await uncategorizedExercises();
  const body = h('div', { class: 'page' },
    h('div', { class: 'picker-top sticky' }, search, chips),
    uncategorized.length
      ? h('button', { class: 'card hint', onclick: async () => { if (await assignCategoriesSheet()) refresh(); } },
        icon('list'),
        h('span', null, h('strong', null, `${count(uncategorized.length, 'Übung', 'Übungen')} ohne Muskelgruppe`), h('br'),
          'Zuordnen, damit „Sätze pro Muskelgruppe“ stimmt.'),
        icon('chevron'))
      : null,
    h('div', { class: 'list-tools' }, h('span', { class: 'muted small' }, `${all.length} Übungen`), sortBtn),
    list);

  return {
    title: 'Übungen',
    tab: 'exercises',
    actions: [h('button', {
      class: 'icon-btn', 'aria-label': 'Eigene Übung anlegen',
      onclick: async () => { const ex = await exerciseForm(); if (ex) { toast('Übung angelegt'); refresh(); } },
    }, icon('plus'))],
    body,
  };
}

const RANGES = [['3m', '3 M', 3], ['6m', '6 M', 6], ['1y', '1 J', 12], ['all', 'Alle', null]];

export async function exerciseDetailView(id) {
  const ex = repo.exercise(id);
  if (!ex) { navigate('/exercises', { replace: true }); return null; }
  const workouts = await repo.workouts();
  const hist = exerciseHistory(workouts, id);
  const rec = personalRecords(workouts, id);
  const assisted = !!ex.assisted;
  const { bodyweight } = await repo.settings();
  const hasWeight = hist.some((r) => r.stats.hasWeight);
  const body = h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('h1', { class: 'page-title' }, ex.name),
      h('span', { class: 'muted' }, ex.category + (ex.custom ? ' · eigene Übung' : '') +
        (ex.bodyweight ? ' · Körpergewicht' : '') + (assisted ? ' · unterstützt (Minusgewicht)' : ''))));

  if (assisted && !bodyweight) {
    body.append(h('button', { class: 'card hint', onclick: () => navigate('/settings') },
      icon('sliders'),
      h('span', null, h('strong', null, 'Körpergewicht eintragen'), h('br'),
        'Dann rechnet die App mit der effektiven Last (Körpergewicht − Hilfe) und zeigt auch 1RM, Volumen und Kraftentwicklung.'),
      icon('chevron')));
  }

  if (!hist.length) {
    body.append(h('div', { class: 'empty' },
      icon('trophy', { size: 40 }),
      h('p', null, 'Noch keine Daten. Sobald du diese Übung trainierst, siehst du hier Diagramme und Rekorde.')));
  } else {
    // Rekorde
    const tiles = [];
    if (assisted) {
      tiles.push(recordTile('Geringste Unterstützung', rec.weight, (r) => fmtNum(r.value) + ' kg', (r) => fmtSet(r.set)));
      if (rec.e1rm) tiles.push(recordTile('Geschätztes 1RM', rec.e1rm, (r) => fmtNum(r.value, 1) + ' kg', () => 'effektive Last'));
      if (rec.sessionVolume) tiles.push(recordTile('Bestes Trainingsvolumen', rec.sessionVolume, (r) => fmtNum(r.value, 0) + ' kg', () => ''));
    } else if (hasWeight) {
      tiles.push(recordTile('Geschätztes 1RM', rec.e1rm, (r) => fmtNum(r.value, 1) + ' kg', (r) => fmtSet(r.set)));
      tiles.push(recordTile('Schwerster Satz', rec.weight, (r) => fmtNum(r.value) + ' kg', (r) => fmtSet(r.set)));
      tiles.push(recordTile('Bestes Satzvolumen', rec.volume, (r) => fmtNum(r.value, 0) + ' kg', (r) => fmtSet(r.set)));
      tiles.push(recordTile('Bestes Trainingsvolumen', rec.sessionVolume, (r) => fmtNum(r.value, 0) + ' kg', () => ''));
    }
    if (rec.reps) tiles.push(recordTile('Meiste Wiederholungen', rec.reps, (r) => `${r.value} Wdh.`, () => (assisted ? 'ganz ohne Hilfe' : 'ohne Zusatzgewicht')));
    body.append(h('h2', { class: 'section-title' }, 'Persönliche Rekorde'), h('div', { class: 'record-grid' }, tiles));

    // Diagramm
    const metrics = assisted
      ? ['weight', ...(rec.e1rm ? ['e1rm', 'volume'] : [])]
      : hasWeight ? ['e1rm', 'weight', 'volume'] : [];
    if (rec.reps) metrics.push('reps');
    if (!metrics.includes(chartState.metric)) chartState.metric = metrics[0];

    const seg = h('div', { class: 'segmented', role: 'tablist' });
    const ranges = h('div', { class: 'chips compact' });
    const chartBox = h('div', { class: 'chart-box' });
    const delta = h('p', { class: 'chart-delta muted small' });

    const renderChart = () => {
      clear(seg); clear(ranges); clear(chartBox);
      const labels = { e1rm: '1RM', weight: assisted ? 'Hilfe' : 'Gewicht', volume: 'Volumen', reps: 'Wdh.' };
      for (const m of metrics) {
        seg.append(h('button', {
          class: 'seg' + (m === chartState.metric ? ' active' : ''), role: 'tab', 'aria-selected': String(m === chartState.metric),
          onclick: () => { chartState.metric = m; renderChart(); },
        }, labels[m]));
      }
      for (const [key, label] of RANGES) {
        ranges.append(h('button', { class: 'chip' + (key === chartState.range ? ' active' : ''), onclick: () => { chartState.range = key; renderChart(); } }, label));
      }
      const months = RANGES.find((r) => r[0] === chartState.range)[2];
      const since = months ? addMonths(Date.now(), -months) : -Infinity;
      const pts = progressSeries(hist, chartState.metric, { since, assisted });
      const meta = assisted && chartState.metric === 'weight'
        ? { ...SERIES.weight, label: 'Unterstützung (−kg) – je näher an 0, desto weniger Hilfe' }
        : SERIES[chartState.metric];
      const unit = meta.unit;
      const fmt = (v) => `${fmtNum(v, chartState.metric === 'volume' ? 0 : 1)} ${unit}`;
      if (!pts.length) {
        chartBox.append(h('div', { class: 'empty small' }, h('p', null, 'Keine Daten in diesem Zeitraum.')));
        delta.textContent = '';
        return;
      }
      chartBox.append(h('div', { class: 'chart-title' }, meta.label), lineChart(pts, {
        format: fmt,
        axisFormat: (v) => (v >= 10000 ? fmtNum(v / 1000, 1) + 'k' : fmtNum(v, 1)),
        label: `${meta.label}: ${pts.length} Trainings, aktuell ${fmt(pts[pts.length - 1].y)}`,
      }));
      if (pts.length > 1) {
        const d = pts[pts.length - 1].y - pts[0].y;
        const pct = pts[0].y ? (d / Math.abs(pts[0].y)) * 100 : 0;
        delta.textContent = `Veränderung seit ${fmtDateShort(pts[0].x)}: ${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d), 1)} ${unit} (${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(pct), 0)} %)`;
      } else {
        delta.textContent = 'Nur ein Training im Zeitraum.';
      }
    };
    renderChart();
    body.append(h('h2', { class: 'section-title' }, 'Fortschritt'),
      h('div', { class: 'card chart-card' }, seg, ranges, chartBox, delta));

    // Verlauf (zugleich Tabellenansicht der Diagrammdaten)
    body.append(h('h2', { class: 'section-title' }, `Verlauf (${hist.length})`));
    const histList = h('div', { class: 'hist-list' });
    const rows = [...hist].reverse();
    let shown = 0;
    const more = h('button', { class: 'btn secondary block', onclick: () => renderRows() }, 'Weitere laden');
    const renderRows = () => {
      for (const r of rows.slice(shown, shown + 30)) {
        const work = r.sets.filter(isCountable);
        histList.append(h('button', { class: 'card hist-row', onclick: () => navigate('/history/' + r.workoutId) },
          h('div', { class: 'hist-top' },
            h('strong', null, fmtDate(r.date)),
            r.stats.best1RM ? h('span', { class: 'muted small' }, `1RM ${fmtNum(r.stats.best1RM, 1)} kg`) : null),
          h('div', { class: 'hist-sets' }, work.map((s) => fmtSet(s, { unit: false })).join(' · ') || '–'),
          h('div', { class: 'muted small' }, r.workoutName)));
      }
      shown += 30;
      if (shown >= rows.length) more.remove();
    };
    renderRows();
    body.append(histList);
    if (shown < rows.length) body.append(more);
  }

  const actions = [h('button', { class: 'icon-btn', 'aria-label': 'Übungsmenü', onclick: () => exerciseMenu(ex) }, icon('more'))];

  return { title: ex.name, back: '/exercises', tab: 'exercises', actions, body };
}

function recordTile(label, record, fmtValue, fmtSub) {
  return h('div', { class: 'record' },
    h('span', { class: 'record-label' }, label),
    h('span', { class: 'record-value' }, record ? fmtValue(record) : '–'),
    h('span', { class: 'record-sub muted small' }, record ? [fmtSub(record), fmtDateShort(record.date)].filter(Boolean).join(' · ') : ''));
}

function addMonths(ts, n) {
  const d = new Date(ts);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}

/** Verlauf in eine andere Übung verschieben (eigene Übungen werden danach gelöscht). */
async function moveHistory(ex) {
  const [target] = await pickExercises({ title: ex.custom ? 'Zusammenführen mit …' : 'Verlauf übertragen nach …', multi: false, exclude: [ex.id] });
  if (!target) return;
  const tEx = repo.exercise(target);
  const signs = await repo.weightSigns(ex.id);
  // In eine unterstützte Übung: bisherige Gewichte waren die Hilfe -> negativ
  const negate = !!tEx?.assisted && !ex.assisted && signs.positive > 0;
  if (!(await confirmDialog({
    title: ex.custom ? 'Übungen zusammenführen?' : 'Verlauf übertragen?',
    message: `Alle Einträge von „${ex.name}“ werden zu „${tEx.name}“ verschoben.` +
      (ex.custom ? ` „${ex.name}“ wird danach gelöscht.` : '') +
      (negate ? `\n\n„${tEx.name}“ ist eine unterstützte Übung: Die Gewichte von ${count(signs.positive, 'Satz', 'Sätzen')} werden als Unterstützung übernommen (z. B. 30 kg → −30 kg).` : ''),
    confirmLabel: ex.custom ? 'Zusammenführen' : 'Übertragen',
  }))) return;
  const res = await repo.mergeExercise(ex.id, target, { negate });
  toast(`${count(res.workouts, 'Training', 'Trainings')} übernommen`);
  navigate('/exercises/' + target, { replace: true });
}

async function exerciseMenu(ex) {
  const choice = await actionSheet({
    title: ex.name,
    items: [
      { label: 'Ziel, Pause & Gewichtsschritt', value: 'settings', icon: 'sliders' },
      ...(ex.custom
        ? [
          { label: 'Bearbeiten', value: 'edit', icon: 'edit' },
          { label: 'Zusammenführen mit …', value: 'merge', icon: 'copy' },
          { label: 'Löschen', value: 'delete', icon: 'trash', danger: true },
        ]
        : [{ label: 'Verlauf übertragen nach …', value: 'merge', icon: 'copy' }]),
    ],
  });
  if (choice === 'settings') {
    await exerciseSettingsSheet(ex.id);
  } else if (choice === 'edit') {
    if (await exerciseForm(ex)) { toast('Übung gespeichert'); refresh(); }
  } else if (choice === 'merge') {
    await moveHistory(ex);
  } else if (choice === 'delete') {
    const u = await repo.exerciseUsage(ex.id);
    if (u.workouts || u.templates) {
      await alertDialog({
        title: 'Übung wird verwendet',
        message: `„${ex.name}“ kommt in ${count(u.workouts, 'Training', 'Trainings')} und ${count(u.templates, 'Vorlage', 'Vorlagen')} vor. Entferne sie dort zuerst – oder nutze „Zusammenführen“, um den Verlauf zu behalten.`,
        confirmLabel: 'Verstanden',
      });
      return;
    }
    if (await confirmDialog({ title: 'Übung löschen?', message: `„${ex.name}“ wird gelöscht.`, confirmLabel: 'Löschen', danger: true })) {
      await repo.deleteExercise(ex.id);
      toast('Übung gelöscht');
      back('/exercises');
    }
  }
}
