// Körpergewicht & Körpermaße: schnell eintragen, Verlauf als Diagramm.

import { h, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, confirmDialog } from '../ui/sheets.js';
import { lineChart } from '../ui/chart.js';
import { refresh } from '../router.js';
import * as repo from '../repo.js';
import { MEASURES, measureSeries, latestMeasure, measureChange } from '../lib/body.js';
import { addMonths } from '../lib/stats.js';
import { fmtNum, fmtDateShort, fmtRelativeDay, parseNumber } from '../lib/format.js';

const RANGES = [['3m', '3 M', 3], ['6m', '6 M', 6], ['1y', '1 J', 12], ['all', 'Alle', null]];
const state = { metric: 'bodyweight', range: '6m' };
const signed = (v, d) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), d)}`;

export async function bodyView() {
  const entries = await repo.measurements();
  const body = h('div', { class: 'page' });

  // Schnell: Gewicht von heute
  const quick = h('input', {
    class: 'input bw-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kg',
    'aria-label': 'Körpergewicht heute in kg',
  });
  const latestBw = latestMeasure(entries, 'bodyweight');
  if (latestBw) quick.placeholder = fmtNum(latestBw.bodyweight, 1);
  const saveQuick = async () => {
    const v = parseNumber(quick.value);
    if (!(v > 20 && v < 400)) { toast('Bitte ein Gewicht in kg eingeben.'); quick.focus(); return; }
    await repo.saveMeasurement({ date: Date.now(), bodyweight: v });
    toast('Gewicht gespeichert ✓');
    refresh();
  };
  quick.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveQuick(); });
  body.append(h('section', { class: 'card quick-weight' },
    h('div', { class: 'quick-row' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Gewicht heute'), h('div', { class: 'bw-row' }, quick, h('span', { class: 'muted' }, 'kg'))),
      h('button', { class: 'btn primary', onclick: saveQuick }, 'Speichern')),
    h('button', { class: 'text-btn small', onclick: () => entrySheet() }, icon('plus', { size: 18 }), 'Weitere Maße (Bauch, Arm, KFA …)')));

  if (!entries.length) {
    body.append(h('div', { class: 'empty' },
      icon('chart', { size: 40 }),
      h('p', null, 'Trag dein Gewicht regelmäßig ein (z. B. morgens) – hier siehst du dann den Verlauf.'),
      h('p', { class: 'muted small' }, 'Das Körpergewicht nutzt die App auch für unterstützte Übungen (effektive Last = Körpergewicht − Hilfe).')));
    return { title: 'Körper', back: '/settings', body, actions: [addAction()] };
  }

  // Aktuelle Werte
  const monthAgo = addMonths(Date.now(), -1);
  const available = MEASURES.filter((m) => latestMeasure(entries, m.key));
  body.append(h('div', { class: 'record-grid' }, available.map((m) => {
    const last = latestMeasure(entries, m.key);
    const ch = measureChange(entries, m.key, monthAgo);
    return h('button', { class: 'record measure-tile' + (state.metric === m.key ? ' selected' : ''), onclick: () => { state.metric = m.key; refresh(); } },
      h('span', { class: 'record-label' }, m.label),
      h('span', { class: 'record-value' }, `${fmtNum(last[m.key], m.decimals)} ${m.unit}`),
      h('span', { class: 'record-sub muted small' }, ch != null ? `${signed(ch, m.decimals)} ${m.unit} in 30 Tagen` : fmtRelativeDay(last.date)));
  })));

  // Diagramm
  if (!available.some((m) => m.key === state.metric)) state.metric = available[0].key;
  const meta = MEASURES.find((m) => m.key === state.metric);
  const months = RANGES.find((r) => r[0] === state.range)[2];
  const pts = measureSeries(entries, state.metric, { since: months ? addMonths(Date.now(), -months) : -Infinity });
  body.append(h('section', { class: 'card chart-card' },
    h('div', { class: 'chips compact' }, RANGES.map(([key, label]) =>
      h('button', { class: 'chip' + (key === state.range ? ' active' : ''), onclick: () => { state.range = key; refresh(); } }, label))),
    h('div', { class: 'chart-title' }, meta.label),
    pts.length
      ? lineChart(pts, { format: (v) => `${fmtNum(v, meta.decimals)} ${meta.unit}`, axisFormat: (v) => fmtNum(v, meta.decimals), label: `${meta.label}: ${pts.length} Messungen` })
      : h('div', { class: 'empty small' }, h('p', null, 'Keine Messungen in diesem Zeitraum.'))));

  // Liste
  body.append(h('h2', { class: 'section-title' }, 'Messungen'),
    h('div', { class: 'card list-card' }, entries.slice(0, 60).map((e) => h('button', { class: 'row-btn measure-row', onclick: () => entrySheet(e) },
      h('span', null, h('strong', null, fmtDateShort(e.date)), h('small', { class: 'muted' },
        MEASURES.filter((m) => e[m.key] > 0).map((m) => `${m.short} ${fmtNum(e[m.key], m.decimals)} ${m.unit}`).join(' · '))),
      icon('chevron', { size: 20, cls: 'muted' })))));

  return { title: 'Körper', back: '/settings', body, actions: [addAction()] };
}

function addAction() {
  return h('button', { class: 'icon-btn', 'aria-label': 'Messung hinzufügen', onclick: () => entrySheet() }, icon('plus'));
}

const toDateValue = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Messung anlegen oder bearbeiten. */
function entrySheet(existing = null) {
  const date = h('input', { class: 'input', type: 'date', value: toDateValue(existing?.date ?? Date.now()) });
  const inputs = MEASURES.map((m) => {
    const inp = h('input', {
      class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '–',
      value: existing?.[m.key] ? fmtNum(existing[m.key], m.decimals, false) : '',
    });
    return { m, inp };
  });
  const save = async () => {
    const [y, mo, d] = date.value.split('-').map(Number);
    const sameDay = existing && toDateValue(existing.date) === date.value;
    const entry = { id: existing?.id, date: sameDay ? existing.date : new Date(y, mo - 1, d, 8).getTime() };
    let any = false;
    for (const { m, inp } of inputs) {
      const v = parseNumber(inp.value);
      if (v > 0) { entry[m.key] = v; any = true; }
    }
    if (!any || !y) { toast('Bitte mindestens einen Wert eintragen.'); return; }
    await repo.saveMeasurement(entry);
    s.close();
    toast('Gespeichert ✓');
    refresh();
  };
  const del = async () => {
    if (!(await confirmDialog({ title: 'Messung löschen?', message: fmtDateShort(existing.date), confirmLabel: 'Löschen', danger: true }))) return;
    await repo.deleteMeasurement(existing.id);
    s.close();
    toast('Messung gelöscht');
    refresh();
  };
  const s = openSheet({
    title: existing ? 'Messung bearbeiten' : 'Neue Messung',
    full: true,
    body: h('div', { class: 'form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Datum'), date),
      h('div', { class: 'measure-grid' }, inputs.map(({ m, inp }) =>
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, `${m.label} (${m.unit})`), inp))),
      existing ? h('button', { class: 'btn danger-text block', onclick: del }, 'Messung löschen') : null),
    footer: [
      h('button', { class: 'btn secondary', onclick: () => s.close() }, 'Abbrechen'),
      h('button', { class: 'btn primary', onclick: save }, 'Speichern'),
    ],
  });
}

