import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  epley1RM, sessionStats, detectSetPRs, updateBests, emptyBests, bestsForExercise,
  computeAllPRs, lastPerformance, exerciseHistory, progressSeries, personalRecords, workoutVolume,
} from '../app/js/lib/calc.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const day = (d) => new Date(2026, 0, d, 18, 0).getTime();
const wo = (id, d, exercises) => ({ id, name: 'T', startedAt: day(d), endedAt: day(d) + 3600000, notes: '', exercises });
const ex = (exerciseId, sets) => ({ exerciseId, notes: '', sets: sets.map(([weight, reps, type]) => (type ? { weight, reps, type } : { weight, reps })) });

test('Epley-1RM', () => {
  assert.equal(epley1RM(100, 1), 100);
  close(epley1RM(100, 10), 133.3333333);
  close(epley1RM(80, 8), 101.3333333);
  assert.equal(epley1RM(100, 0), null);
  assert.equal(epley1RM(0, 10), null);
  assert.equal(epley1RM(null, 5), null);
});

test('sessionStats ignoriert Aufwärmsätze', () => {
  const s = sessionStats([
    { weight: 60, reps: 10, type: 'warmup' },
    { weight: 100, reps: 5 },
    { weight: 90, reps: 8 },
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.maxWeight, 100);
  assert.equal(s.volume, 100 * 5 + 90 * 8);
  assert.equal(s.bestSetVolume, 720);
  close(s.best1RM, 116.6666667);
  assert.deepEqual(s.heaviestSet, { weight: 100, reps: 5 });
});

test('sessionStats: nicht erledigte Sätze zählen nicht', () => {
  const s = sessionStats([{ weight: 200, reps: 1, done: false }, { weight: 100, reps: 5, done: true }]);
  assert.equal(s.maxWeight, 100);
});

test('detectSetPRs: ohne Vorgeschichte keine PRs', () => {
  const prs = detectSetPRs([{ weight: 100, reps: 5 }], emptyBests());
  assert.deepEqual(prs, [[]]);
});

test('detectSetPRs: markiert nur den besten Satz je Rekordart', () => {
  const bests = updateBests(emptyBests(), [{ weight: 100, reps: 5 }]); // 1RM 116,67 / Volumen 500
  const prs = detectSetPRs([
    { weight: 102.5, reps: 3 },  // schwerer als 100 -> Gewicht; 1RM 112,75 kein PR
    { weight: 105, reps: 3 },    // noch schwerer -> Gewicht-PR wandert hierher
    { weight: 95, reps: 8 },     // 1RM 120,33 und Volumen 760 -> PR
  ], bests);
  assert.deepEqual(prs[0], []);
  assert.deepEqual(prs[1], ['weight']);
  assert.deepEqual(prs[2].sort(), ['e1rm', 'volume']);
});

test('detectSetPRs: Gleichstand ist kein PR, Aufwärmsatz nie', () => {
  const bests = updateBests(emptyBests(), [{ weight: 100, reps: 5 }]);
  assert.deepEqual(detectSetPRs([{ weight: 100, reps: 5 }], bests), [[]]);
  assert.deepEqual(detectSetPRs([{ weight: 150, reps: 5, type: 'warmup' }], bests), [[]]);
});

test('detectSetPRs: Wiederholungs-PR bei Körpergewicht', () => {
  const bests = updateBests(emptyBests(), [{ weight: null, reps: 10 }]);
  assert.deepEqual(detectSetPRs([{ weight: null, reps: 12 }, { weight: null, reps: 11 }], bests), [['reps'], []]);
});

const history = [
  wo('w1', 1, [ex('bench', [[80, 8], [80, 8], [80, 7]]), ex('squat', [[100, 5]])]),
  wo('w2', 4, [ex('bench', [[60, 10, 'warmup'], [82.5, 8], [82.5, 6]])]),
  wo('w3', 8, [ex('bench', [[80, 10], [85, 5]])]),
];

test('computeAllPRs: chronologisch, erstes Training ohne PR', () => {
  const prs = computeAllPRs([...history].reverse()); // Reihenfolge der Eingabe egal
  assert.equal(prs.get('w1').count, 0);
  // w2: 82,5×8 schlägt 80×8 bei Gewicht, 1RM und Volumen
  assert.equal(prs.get('w2').count, 1);
  assert.deepEqual(prs.get('w2').byExercise[0][1].sort(), ['e1rm', 'volume', 'weight']);
  // w3: 80×10 -> 1RM 106,67 (bisher 104,5) und Volumen 800 (bisher 660); 85×5 -> Gewicht
  assert.deepEqual(prs.get('w3').byExercise[0][0].sort(), ['e1rm', 'volume']);
  assert.deepEqual(prs.get('w3').byExercise[0][1], ['weight']);
});

test('bestsForExercise berücksichtigt nur frühere Trainings', () => {
  const b = bestsForExercise(history, 'bench', { beforeTs: day(4) });
  assert.equal(b.weight, 80);
  const all = bestsForExercise(history, 'bench', { excludeId: 'w3' });
  assert.equal(all.weight, 82.5);
});

test('lastPerformance liefert das jüngste Training', () => {
  assert.equal(lastPerformance(history, 'bench').workout.id, 'w3');
  assert.equal(lastPerformance(history, 'bench', { beforeTs: day(8) }).workout.id, 'w2');
  assert.equal(lastPerformance(history, 'squat').workout.id, 'w1');
  assert.equal(lastPerformance(history, 'deadlift'), null);
});

test('exerciseHistory und progressSeries', () => {
  const h = exerciseHistory(history, 'bench');
  assert.deepEqual(h.map((r) => r.workoutId), ['w1', 'w2', 'w3']);
  const weights = progressSeries(h, 'weight').map((p) => p.y);
  assert.deepEqual(weights, [80, 82.5, 85]);
  const vol = progressSeries(h, 'volume').map((p) => p.y);
  assert.deepEqual(vol, [80 * 8 * 2 + 80 * 7, 82.5 * 14, 800 + 425]);
  assert.equal(progressSeries(h, 'weight', { since: day(5) }).length, 1);
});

test('personalRecords mit Datum', () => {
  const r = personalRecords(history, 'bench');
  assert.equal(r.weight.value, 85);
  assert.equal(r.weight.workoutId, 'w3');
  close(r.e1rm.value, 80 * (1 + 10 / 30));
  assert.equal(r.volume.value, 800);
  assert.equal(r.sessionVolume.value, 1840);
  assert.equal(r.sessionVolume.workoutId, 'w1');
  assert.equal(r.reps, null);
});

test('workoutVolume summiert Arbeitssätze', () => {
  assert.equal(workoutVolume(history[1]), 82.5 * 14);
});
