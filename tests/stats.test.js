import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startOfWeek, addDays, dayKey, isoWeek, monthGrid, workoutsByDay, periodSummary, weeklySeries, weekStreak,
  strengthIndex, indexChangeSince, exerciseTrends, muscleGroupSets, recentPRs,
} from '../app/js/lib/stats.js';
import { computeAllPRs } from '../app/js/lib/calc.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const at = (y, m, d, h = 18) => new Date(y, m - 1, d, h, 0).getTime();
let n = 0;
const wo = (ts, exercises) => ({ id: 'w' + ++n, name: 'T', startedAt: ts, endedAt: ts + 3600000, notes: '', exercises });
const ex = (exerciseId, sets) => ({ exerciseId, notes: '', sets: sets.map(([weight, reps]) => ({ weight, reps })) });

test('Wochenbeginn Montag, Kalenderwoche, dayKey', () => {
  assert.equal(startOfWeek(at(2026, 10, 1)), new Date(2026, 8, 28).getTime()); // Do -> Mo 28.09.
  assert.equal(startOfWeek(at(2026, 10, 4)), new Date(2026, 8, 28).getTime()); // So -> gleiche Woche
  assert.equal(startOfWeek(at(2026, 10, 5)), new Date(2026, 9, 5).getTime());
  assert.equal(isoWeek(at(2026, 10, 1)), 40);
  assert.equal(isoWeek(at(2021, 1, 1)), 53);
  assert.equal(dayKey(at(2026, 3, 9)), '2026-03-09');
  // Zeitumstellung (29.03.2026): trotzdem 7 Kalendertage weiter
  assert.equal(dayKey(addDays(new Date(2026, 2, 23).getTime(), 7)), '2026-03-30');
});

test('monthGrid: ganze Wochen Mo–So', () => {
  const g = monthGrid(2026, 9); // Oktober 2026: 1. ist ein Donnerstag
  assert.equal(g.length, 5);
  assert.equal(dayKey(g[0][0]), '2026-09-28');
  assert.equal(dayKey(g[4][6]), '2026-11-01');
  assert.ok(g.every((w) => w.length === 7));
});

test('workoutsByDay, periodSummary, weeklySeries', () => {
  const ws = [
    wo(at(2026, 9, 28), [ex('a', [[100, 5]])]),
    wo(at(2026, 9, 28, 20), [ex('a', [[50, 10]])]),
    wo(at(2026, 10, 1), [ex('b', [[10, 10], [10, 10]])]),
  ];
  assert.equal(workoutsByDay(ws).get('2026-09-28').length, 2);
  const s = periodSummary(ws, at(2026, 9, 28, 0), at(2026, 10, 5, 0));
  assert.equal(s.count, 3);
  assert.equal(s.volume, 500 + 500 + 200);
  assert.equal(s.sets, 4);
  assert.equal(s.duration, 3 * 3600000);
  close(s.perWeek, 3);
  const weeks = weeklySeries(ws, at(2026, 9, 14), at(2026, 10, 2));
  assert.deepEqual(weeks.map((w) => w.count), [0, 0, 3]);
});

test('weekStreak: laufende Woche bricht die Serie nicht', () => {
  const now = at(2026, 10, 1); // Woche ab 28.09.
  const ws = [];
  for (const wk of [-3, -2, -1]) for (let i = 0; i < 3; i++) ws.push(wo(addDays(at(2026, 9, 29), wk * 7 + i), []));
  ws.push(wo(at(2026, 9, 29), [])); // laufende Woche: erst 1 Training
  let r = weekStreak(ws, 3, now);
  assert.equal(r.current, 3);
  assert.equal(r.thisWeek, 1);
  ws.push(wo(at(2026, 9, 30), []), wo(at(2026, 10, 1, 8), []));
  r = weekStreak(ws, 3, now);
  assert.equal(r.current, 4);
  assert.equal(r.best, 4);
  assert.equal(weekStreak([], 3, now).current, 0);
});

test('strengthIndex: eine Übung = letzter / erster Wert', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('a', [[100, 1]])]),
    wo(at(2026, 1, 12), [ex('a', [[105, 1]])]),
    wo(at(2026, 1, 26), [ex('a', [[110, 1]])]),
  ];
  const idx = strengthIndex(ws);
  assert.equal(idx.length, 3);
  close(idx[2].y, 110);
  const pct = indexChangeSince(idx, at(2026, 1, 12));
  close(pct[0].y, 0);
  close(pct[1].y, (110 / 105 - 1) * 100);
});

test('strengthIndex: neue Übung verzerrt den Index nicht', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('a', [[100, 1]])]),
    wo(at(2026, 1, 12), [ex('a', [[110, 1]]), ex('b', [[20, 1]])]), // b neu und leicht
    wo(at(2026, 1, 19), [ex('a', [[110, 1]]), ex('b', [[22, 1]])]), // a gleich, b +10 %
  ];
  const idx = strengthIndex(ws);
  close(idx[1].y, 110); // nur a zählt
  close(idx[2].y, 110 * Math.sqrt(1 * 1.1));
});

test('strengthIndex: ein einzelner Ausreißer (leichter Tag) hebt sich wieder auf', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const week = (d, override = {}) => wo(at(2026, 1, d), ids.map((id) => ex(id, [[override[id] ?? 100, 1]])));
  const ws = [
    week(5),
    week(12, { a: 60 }), // a einmal viel leichter
    week(19),            // alles wieder wie vorher
  ];
  const idx = strengthIndex(ws);
  assert.ok(idx[1].y > 85 && idx[1].y < 100, 'nur eine kleine Delle: ' + idx[1].y);
  close(idx[2].y, 100); // danach exakt wie vorher
});

test('strengthIndex: nach langer Pause zählt eine Übung neu', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('a', [[100, 1]]), ex('b', [[100, 1]])]),
    wo(at(2026, 1, 12), [ex('a', [[100, 1]])]),
    wo(at(2026, 3, 30), [ex('a', [[100, 1]]), ex('b', [[70, 1]])]), // b nach 12 Wochen Pause schwächer
  ];
  close(strengthIndex(ws)[2].y, 100); // Wiedereinstieg zieht den Index nicht runter
});

test('strengthIndex: Steigerungen in Stufen (je Übung in einer anderen Woche) werden voll erfasst', () => {
  const ids = ['a', 'b', 'c', 'd'];
  // Woche i: Übungen 0..i-1 haben schon +10 %, der Rest noch nicht
  const ws = [0, 1, 2, 3, 4].map((i) => wo(at(2026, 1, 5 + i * 7), ids.map((id, j) => ex(id, [[j < i ? 110 : 100, 1]]))));
  const idx = strengthIndex(ws);
  close(idx[4].y, 110); // am Ende sind alle 10 % stärker
});

test('strengthIndex: Pausen einzelner Übungen (Push/Pull-Wechsel) zählen als "unverändert"', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('push', [[100, 1]]), ex('pull', [[100, 1]])]),
    wo(at(2026, 1, 12), [ex('push', [[110, 1]])]), // pull diese Woche nicht trainiert
    wo(at(2026, 1, 19), [ex('pull', [[110, 1]])]),
  ];
  const idx = strengthIndex(ws);
  close(idx[2].y, 110);
});

test('exerciseTrends: Fortschritt, Stagnation, Rückgang', () => {
  const days = [5, 12, 19, 26];
  const ws = days.map((d, i) => wo(at(2026, 1, d), [
    ex('up', [[100 + i * 5, 1]]),
    ex('flat', [[50, 1]]),
    ex('down', [[80 - i * 4, 1]]),
    ex('bw', [[null, 10 + i]]),
    ...(i < 2 ? [ex('rare', [[10, 1]])] : []),
  ]));
  const t = Object.fromEntries(exerciseTrends(ws, at(2026, 1, 1), at(2026, 2, 1)).map((x) => [x.exerciseId, x]));
  assert.equal(t.up.status, 'up');
  close(t.up.change, (112.5 - 102.5) / 102.5); // Mittel aus je 2
  assert.equal(t.flat.status, 'flat');
  assert.equal(t.down.status, 'down');
  assert.equal(t.bw.metric, 'reps');
  assert.equal(t.bw.status, 'up');
  assert.equal(t.rare, undefined); // nur 2 Trainings
});

test('muscleGroupSets: Ø Sätze pro Woche je Muskelgruppe', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('bench', [[80, 8], [80, 8], [80, 8]]), ex('curl', [[10, 10]])]),
    wo(at(2026, 1, 12), [ex('bench', [[80, 8], [80, 8]]), ex('mystery', [[5, 5]])]),
  ];
  const cat = { bench: 'Brust', curl: 'Bizeps' };
  const r = muscleGroupSets(ws, (id) => cat[id], at(2026, 1, 5, 0), at(2026, 1, 19, 0));
  assert.deepEqual(r.map((x) => [x.category, x.sets, x.perWeek]), [['Brust', 5, 2.5], ['Bizeps', 1, 0.5], ['Sonstige', 1, 0.5]]);
});

test('recentPRs: neueste zuerst, mit Satz', () => {
  const ws = [
    wo(at(2026, 1, 5), [ex('a', [[100, 5]])]),
    wo(at(2026, 1, 12), [ex('a', [[105, 5]])]),
    wo(at(2026, 1, 19), [ex('a', [[110, 3]])]),
  ];
  const ev = recentPRs(ws, computeAllPRs(ws));
  assert.equal(ev.length, 2);
  assert.equal(ev[0].date, at(2026, 1, 19));
  assert.deepEqual(ev[0].types, ['weight']);
  assert.deepEqual(ev[1].set, { weight: 105, reps: 5 });
  assert.equal(recentPRs(ws, computeAllPRs(ws), at(2026, 1, 15)).length, 1);
});
