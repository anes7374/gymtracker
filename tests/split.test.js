import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFromTemplates, splitFromHistory, trainingFrequency, buildSplitText } from '../app/js/lib/split.js';
import { inferWeightStep } from '../app/js/lib/calc.js';

const DAY = 86400000;
const now = new Date(2026, 9, 2, 12).getTime();
let n = 0;
const wo = (daysAgo, name, exercises) => ({ id: 'w' + ++n, name, startedAt: now - daysAgo * DAY, endedAt: null, notes: '', exercises });
const ex = (exerciseId, sets) => ({ exerciseId, notes: '', sets: sets.map(([weight, reps, type]) => (type ? { weight, reps, type } : { weight, reps })) });
const names = { a: 'Brustpresse (Maschine)', b: 'Latziehen (Kabel)', c: 'Beinpresse (Maschine)', d: 'Seitheben (Kurzhantel)' };

test('splitFromHistory: jüngstes Training je Name, nach Häufigkeit sortiert', () => {
  const ws = [
    wo(2, 'Push ', [ex('a', [[40, 10, 'warmup'], [60, 10], [60, 9]]), ex('d', [[10, 12]])]),
    wo(9, 'push', [ex('a', [[60, 10]])]),          // älter -> zählt nur
    wo(5, 'Pull', [ex('b', [[50, 10], [50, 10], [50, 8]])]),
    wo(80, 'Beine', [ex('c', [[100, 10]])]),       // außerhalb von 8 Wochen
  ];
  const days = splitFromHistory(ws, { now });
  assert.deepEqual(days.map((d) => [d.name, d.count]), [['Push', 2], ['Pull', 1]]);
  assert.deepEqual(days[0].exercises, [{ exerciseId: 'a', sets: 2 }, { exerciseId: 'd', sets: 1 }]); // Aufwärmsatz zählt nicht
  close(trainingFrequency(ws, { now }), 3 / 8);
});

test('splitFromHistory: Reihenfolge der Rotation, seltene Tage zuletzt', () => {
  const ws = [];
  // Rotation Push -> Pull -> Beine über 4 Wochen, dazu einmal "Zuhause"
  ['Push', 'Pull', 'Beine', 'Push', 'Pull', 'Beine', 'Push', 'Pull', 'Beine', 'Push'].forEach((name, i) => ws.push(wo(30 - i * 3, name, [ex('a', [[10, 10]])])));
  ws.push(wo(12, 'Zuhause', [ex('d', [[5, 20]])]));
  assert.deepEqual(splitFromHistory(ws, { now }).map((d) => d.name), ['Push', 'Pull', 'Beine', 'Zuhause']);
});

function close(a, b) { assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`); }

test('buildSplitText: ohne Gewichte, optional mit Sätzen und Frequenz', () => {
  const days = splitFromTemplates([
    { id: 't1', name: 'Push', exercises: [{ exerciseId: 'a', sets: 3 }, { exerciseId: 'd', sets: 1 }] },
    { id: 't2', name: 'Pull', exercises: [{ exerciseId: 'b', sets: 4 }] },
  ]);
  const text = buildSplitText(days, { nameOf: (id) => names[id], perWeek: 2.75 });
  assert.equal(text, [
    'Mein Trainingsplan',
    '',
    'Push',
    '1. Brustpresse (Maschine) – 3 Sätze',
    '2. Seitheben (Kurzhantel) – 1 Satz',
    '',
    'Pull',
    '1. Latziehen (Kabel) – 4 Sätze',
    '',
    'Trainingsfrequenz: Ø 2,8 Trainings pro Woche',
  ].join('\n'));
  const bare = buildSplitText(days, { nameOf: (id) => names[id], showSets: false });
  assert.ok(!bare.includes('Sätze') && !bare.includes('Trainingsfrequenz') && !/\d+\s*kg/.test(bare));
  assert.ok(bare.includes('1. Brustpresse (Maschine)\n'));
});

test('inferWeightStep: lernt den Schritt aus dem Verlauf', () => {
  const machine = [
    wo(30, 'P', [ex('a', [[17.5, 10], [20, 8]])]),
    wo(20, 'P', [ex('a', [[20, 10], [20, 9]])]),
    wo(10, 'P', [ex('a', [[22.5, 10], [22.5, 8]])]),
  ];
  assert.equal(inferWeightStep(machine, 'a'), 2.5);
  const dumbbells = [
    wo(30, 'P', [ex('d', [[8, 12]])]),
    wo(20, 'P', [ex('d', [[10, 12], [8, 15]])]),
    wo(10, 'P', [ex('d', [[12, 10]])]),
  ];
  assert.equal(inferWeightStep(dumbbells, 'd'), 2);
  assert.equal(inferWeightStep([], 'x'), 2.5);                 // ohne Verlauf: Standard
  assert.equal(inferWeightStep([wo(5, 'P', [ex('d', [[7, 10]])])], 'd', 2.5), 2.5); // zu wenig Belege
});
