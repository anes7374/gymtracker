// Unterstützte Übungen (Klimmzug-/Dip-Maschine): Unterstützung = negatives Gewicht.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setBodyweight, setMetrics, sessionStats, detectSetPRs, updateBests, emptyBests, personalRecords,
  progressSeries, exerciseHistory, inferWeightStep, prLabel,
} from '../app/js/lib/calc.js';
import { exerciseTrends, strengthIndex } from '../app/js/lib/stats.js';
import { parseStrongCSV, planStrongImport } from '../app/js/lib/strong-csv.js';
import { BUILTIN_EXERCISES } from '../app/js/lib/exercises-data.js';

afterEach(() => setBodyweight(null));

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const day = (d) => new Date(2026, 0, d, 18).getTime();
let n = 0;
const wo = (d, sets) => ({ id: 'w' + ++n, name: 'Pull', startedAt: day(d), endedAt: null, notes: '', exercises: [{ exerciseId: 'pu', notes: '', sets }] });
// Fortschritt: 30 -> 25 -> 20 kg Hilfe
const history = [
  wo(5, [{ weight: -30, reps: 8 }, { weight: -30, reps: 7 }]),
  wo(12, [{ weight: -25, reps: 8 }, { weight: -27.5, reps: 8 }]),
  wo(19, [{ weight: -20, reps: 6 }]),
];

test('ohne Körpergewicht: weniger Hilfe ist der „schwerste“ Satz, kein 1RM', () => {
  const m = setMetrics({ weight: -20, reps: 8 });
  assert.equal(m.weight, -20);
  assert.equal(m.e1rm, null);
  assert.equal(m.volume, null);
  assert.equal(m.reps, null);
  const st = sessionStats(history[1].exercises[0].sets);
  assert.equal(st.maxWeight, -25);
  assert.equal(st.best1RM, 0);
  assert.deepEqual(st.heaviestSet, { weight: -25, reps: 8 });
});

test('PR bei weniger Unterstützung', () => {
  const bests = updateBests(emptyBests(), history[0].exercises[0].sets);
  assert.equal(bests.weight, -30);
  const prs = detectSetPRs([{ weight: -27.5, reps: 8 }, { weight: -25, reps: 5 }], bests);
  assert.deepEqual(prs, [[], ['weight']]);
  // mehr Hilfe ist kein PR
  assert.deepEqual(detectSetPRs([{ weight: -35, reps: 12 }], bests), [[]]);
  assert.equal(prLabel('weight', { assisted: true }), 'Weniger Unterstützung');
  assert.equal(prLabel('weight', {}), 'Schwerster Satz');
});

test('mit Körpergewicht: effektive Last = Körpergewicht − Unterstützung', () => {
  setBodyweight(80);
  const m = setMetrics({ weight: -30, reps: 10 });
  close(m.e1rm, 50 * (1 + 10 / 30));
  assert.equal(m.volume, 500);
  const idx = strengthIndex(history);
  close(idx[idx.length - 1].y, (60 * (1 + 6 / 30)) / (50 * (1 + 8 / 30)) * 100);
});

test('Rekorde und Diagramm-Reihe für Unterstützung', () => {
  const rec = personalRecords(history, 'pu');
  assert.equal(rec.weight.value, -20);
  assert.equal(rec.e1rm, null);
  const pts = progressSeries(exerciseHistory(history, 'pu'), 'weight', { assisted: true });
  assert.deepEqual(pts.map((p) => p.y), [-30, -25, -20]);
  // ganz ohne Hilfe (0) bleibt im Diagramm sichtbar
  const done = [...history, wo(26, [{ weight: null, reps: 3 }])];
  assert.deepEqual(progressSeries(exerciseHistory(done, 'pu'), 'weight', { assisted: true }).map((p) => p.y), [-30, -25, -20, 0]);
});

test('Trend ohne Körpergewicht nutzt die Unterstützung', () => {
  const t = exerciseTrends(history, day(1), day(30))[0];
  assert.equal(t.metric, 'weight');
  assert.equal(t.status, 'up');
  assert.ok(t.change > 0);
});

test('Gewichtsschritt funktioniert auch für Unterstützung', () => {
  assert.equal(inferWeightStep(history, 'pu'), 5); // Hilfe sank zweimal um 5 kg
  const small = [
    wo(5, [{ weight: -30, reps: 8 }]),
    wo(12, [{ weight: -27.5, reps: 8 }, { weight: -30, reps: 8 }]),
    wo(19, [{ weight: -25, reps: 8 }]),
  ];
  assert.equal(inferWeightStep(small, 'pu'), 2.5);
});

test('Strong-Import: unterstützte Übungen werden negativ gespeichert', () => {
  const csv = [
    'Date,Workout Name,Exercise Name,Set Order,Weight,Reps',
    '2026-01-05 18:00:00,Pull,Pull Up (Assisted),1,30,8',      // Hilfe als positive Zahl
    '2026-01-05 18:00:00,Pull,Pull Up (Assisted),2,-25,8',     // oder schon negativ
    '2026-01-05 18:00:00,Pull,Assisted Chin Up Machine,1,20,10',
  ].join('\n');
  const parsed = parseStrongCSV(csv);
  const plan = planStrongImport(parsed, { exercises: BUILTIN_EXERCISES, workouts: [] });
  const byFrom = Object.fromEntries(plan.mapping.map((m) => [m.from, m]));
  assert.equal(byFrom['Pull Up (Assisted)'].id, 'b-klimmzuege-assist');
  const [pu, chin] = plan.workouts[0].exercises;
  assert.deepEqual(pu.sets.map((s) => s.weight), [-30, -25]);
  assert.deepEqual(chin.sets.map((s) => s.weight), [-20]);
  assert.equal(plan.newExercises[0].assisted, true); // neue Übung mit "Assisted" im Namen
});

test('Backup behält unterstützte Übungen und Minusgewicht', async () => {
  const { createBackup, serializeBackup, parseBackup } = await import('../app/js/lib/backup.js');
  const data = {
    exercises: [{ id: 'c1', name: 'Klimmzug-Maschine', category: 'Rücken', bodyweight: false, custom: true, assisted: true }],
    templates: [],
    workouts: [{ id: 'w', name: 'Pull', templateId: null, startedAt: 1, endedAt: null, notes: '', exercises: [{ exerciseId: 'c1', notes: '', sets: [{ weight: -27.5, reps: 8 }] }] }],
    settings: { bodyweight: 80 },
  };
  const back = parseBackup(serializeBackup(createBackup(data)));
  assert.deepEqual(back.exercises, data.exercises);
  assert.deepEqual(back.workouts, data.workouts);
  assert.equal(back.settings.bodyweight, 80);
});
