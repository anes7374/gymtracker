// Tests für die Erweiterungen: Progression, Vergleich, Vorlagen, Supersätze,
// Körpergewicht, Zusammenfassung, Plateaus, Kalenderfarben, Jahresrückblick.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sessionStats, progressionTarget, setSuggestions, compareToPrevious, setMetrics, setBodyweight, computeAllPRs,
} from '../app/js/lib/calc.js';
import { mergeTemplate, nextTemplate, normalizeGroups, groupMembers } from '../app/js/lib/templates.js';
import { bodyweightAt, annotateBodyweight, measureSeries, latestMeasure, measureChange } from '../app/js/lib/body.js';
import { workoutSummary, previousSameWorkout } from '../app/js/lib/summary.js';
import { plateaus, workoutTypeColors, yearInReview, strengthIndex } from '../app/js/lib/stats.js';

afterEach(() => setBodyweight(null));
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const DAY = 86400000;
const now = new Date(2026, 9, 6, 12).getTime();
let n = 0;
const wo = (daysAgo, name, exercises, extra = {}) => ({ id: 'w' + ++n, name, templateId: null, startedAt: now - daysAgo * DAY, endedAt: now - daysAgo * DAY + 3600000, notes: '', exercises, ...extra });
const ex = (exerciseId, sets) => ({ exerciseId, notes: '', sets: sets.map(([weight, reps, type]) => (type ? { weight, reps, type } : { weight, reps })) });

// --- #3 verlässliches 1RM -------------------------------------------------------------
test('Kurven nutzen 1RM aus Sätzen bis 12 Wdh., wenn vorhanden', () => {
  const st = sessionStats([{ weight: 80, reps: 8 }, { weight: 60, reps: 25 }]);
  close(st.best1RM, 60 * (1 + 25 / 30));            // 110 – Hochwiederholungssatz überschätzt
  close(st.best1RMReliable, 80 * (1 + 8 / 30));      // 101,3 – verlässlicher
  const high = sessionStats([{ weight: 15, reps: 20 }]); // nur hohe Wdh. -> Rückfall auf alle
  close(high.best1RMReliable, high.best1RM);
});

// --- #7 Progression ---------------------------------------------------------------------
test('Doppelte Progression: alle Sätze oben im Bereich -> Gewicht +1 Schritt, Wdh. unten', () => {
  const last = [{ weight: 70, reps: 12 }, { weight: 70, reps: 12 }, { weight: 40, reps: 10, type: 'warmup' }];
  assert.deepEqual(progressionTarget(last, [8, 12], 2.5), { weight: 72.5, reps: 8, from: 70 });
  assert.equal(progressionTarget([{ weight: 70, reps: 12 }, { weight: 70, reps: 11 }], [8, 12], 2.5), null);
  assert.equal(progressionTarget(last, null, 2.5), null);
  // Unterstützung: weniger Hilfe, aber nie über 0
  assert.deepEqual(progressionTarget([{ weight: -20, reps: 10 }], [6, 10], 2.5), { weight: -17.5, reps: 6, from: -20 });
  assert.deepEqual(progressionTarget([{ weight: -2, reps: 10 }], [6, 10], 2.5), { weight: 0, reps: 6, from: -2 });
  assert.equal(progressionTarget([{ weight: null, reps: 20 }], [10, 20], 2.5), null); // reines Körpergewicht
});

test('Vorschläge zeigen bei Progression das neue Ziel (Aufwärmsätze unverändert)', () => {
  const prev = [{ weight: 40, reps: 10, type: 'warmup' }, { weight: 70, reps: 12 }, { weight: 70, reps: 12 }];
  const sets = [{ weight: null, reps: null, type: 'warmup' }, { weight: null, reps: null }, { weight: null, reps: null }];
  const sug = setSuggestions(sets, prev, { progression: { weight: 72.5, reps: 8 } });
  assert.deepEqual(sug, [{ weight: 40, reps: 10 }, { weight: 72.5, reps: 8 }, { weight: 72.5, reps: 8 }]);
});

// --- #10 Vergleich mit letztem Mal -----------------------------------------------------
test('compareToPrevious: besser / gleich / schwächer', () => {
  assert.equal(compareToPrevious({ weight: 80, reps: 9 }, { weight: 80, reps: 8 }), 1);
  assert.equal(compareToPrevious({ weight: 80, reps: 8 }, { weight: 80, reps: 8 }), 0);
  assert.equal(compareToPrevious({ weight: 80, reps: 7 }, { weight: 80, reps: 8 }), -1);
  assert.equal(compareToPrevious({ weight: 75, reps: 8 }, { weight: 80, reps: 8 }), -1);
  assert.equal(compareToPrevious({ weight: 75, reps: 12 }, { weight: 80, reps: 8 }), 1); // weniger kg, aber 1RM höher
  // Progressionssprung: mehr Gewicht, Wdh. zurück ans untere Ende -> besser (nicht ▼)
  assert.equal(compareToPrevious({ weight: 71.25, reps: 8 }, { weight: 70, reps: 12 }, [8, 12]), 1);
  assert.equal(compareToPrevious({ weight: 72.5, reps: 6 }, { weight: 70, reps: 12 }, [8, 12]), -1); // unter dem Zielbereich
  assert.equal(compareToPrevious({ weight: 72.5, reps: 9 }, { weight: 70, reps: 12 }), 1); // ohne Bereich: 1RM −4 % ist ok
  assert.equal(compareToPrevious({ weight: 80, reps: 1 }, { weight: 70, reps: 12 }), -1); // 1RM 80 statt 98 = deutlich niedriger
  assert.equal(compareToPrevious({ weight: null, reps: 12 }, { weight: null, reps: 10 }), 1); // Körpergewicht
  assert.equal(compareToPrevious({ weight: -20, reps: 8 }, { weight: -25, reps: 8 }), 1);    // weniger Hilfe
  assert.equal(compareToPrevious({ weight: 80, reps: 8 }, null), null);
  assert.equal(compareToPrevious({ weight: 80, reps: null }, { weight: 80, reps: 8 }), null);
});

// --- #2 Vorlage sicher aktualisieren -----------------------------------------------------
test('mergeTemplate: übernimmt Neues, entfernt nie etwas', () => {
  const tpl = [{ exerciseId: 'a', sets: 3 }, { exerciseId: 'b', sets: 3 }, { exerciseId: 'c', sets: 2 }];
  // Training: a mit 4 Sätzen, b übersprungen, neue Übung x nach a, c mit 1 Satz
  const workout = [ex('a', [[1, 1], [1, 1], [1, 1], [1, 1]]), ex('x', [[1, 1], [1, 1]]), ex('c', [[1, 1]])];
  const r = mergeTemplate(tpl, workout);
  assert.deepEqual(r.exercises, [{ exerciseId: 'a', sets: 4 }, { exerciseId: 'x', sets: 2 }, { exerciseId: 'b', sets: 3 }, { exerciseId: 'c', sets: 2 }]);
  assert.equal(r.changed, true);
  assert.deepEqual(r.added, ['x']);
  assert.deepEqual(r.moreSets, ['a']);
  // nur weniger gemacht -> keine Änderung, keine Rückfrage
  assert.equal(mergeTemplate(tpl, [ex('a', [[1, 1]])]).changed, false);
});

// --- #12 Nächstes Training ----------------------------------------------------------------
test('nextTemplate: am längsten nicht trainierte Vorlage der Rotation', () => {
  const t = (id, name) => ({ id, name, exercises: [] });
  const tpls = [t('push', 'Push'), t('pull', 'Pull'), t('legs', 'Beine'), t('home', 'Zuhause')];
  const ws = [wo(1, 'Pull', []), wo(3, 'push', []), wo(5, 'Beine', []), wo(200, 'Zuhause', [])];
  const r = nextTemplate(tpls, ws, { now });
  assert.equal(r.template.id, 'legs'); // „Zuhause“ ist zu lange her und gehört nicht zur Rotation
  assert.equal(nextTemplate(tpls, [], { now }).template.id, 'push');
  assert.equal(nextTemplate([], ws, { now }), null);
  // Zuordnung auch über templateId
  assert.equal(nextTemplate(tpls, [wo(1, 'X', [], { templateId: 'legs' }), wo(2, 'Push', []), wo(3, 'Pull', [])], { now }).template.id, 'pull');
});

// --- #13 Supersätze -------------------------------------------------------------------------
test('normalizeGroups: Einzelne und zerrissene Gruppen werden bereinigt', () => {
  const r = normalizeGroups([{ exerciseId: 'a', group: 'g' }, { exerciseId: 'b', group: 'g' }, { exerciseId: 'c' }, { exerciseId: 'd', group: 'h' }]);
  assert.deepEqual(r.map((e) => e.group ?? '-'), ['g', 'g', '-', '-']);
  const split = normalizeGroups([{ exerciseId: 'a', group: 'g' }, { exerciseId: 'b', group: 'g' }, { exerciseId: 'c' }, { exerciseId: 'd', group: 'g' }, { exerciseId: 'e', group: 'g' }]);
  assert.equal(split[0].group, split[1].group);
  assert.equal(split[3].group, split[4].group);
  assert.notEqual(split[0].group, split[3].group);
  assert.deepEqual(groupMembers(r, r[0]).map((e) => e.exerciseId), ['a', 'b']);
  assert.deepEqual(groupMembers(r, r[2]).map((e) => e.exerciseId), ['c']);
});

// --- #4/#17 Körpergewicht -----------------------------------------------------------------
test('bodyweightAt: letzter Wert davor, sonst erster', () => {
  const entries = [{ id: '1', date: now - 30 * DAY, bodyweight: 82 }, { id: '2', date: now - 10 * DAY, bodyweight: 80 }, { id: '3', date: now - 5 * DAY, waist: 85 }];
  assert.equal(bodyweightAt(entries, now - 20 * DAY), 82);
  assert.equal(bodyweightAt(entries, now), 80);
  assert.equal(bodyweightAt(entries, now - 100 * DAY), 82);
  assert.equal(bodyweightAt([], now), null);
  assert.deepEqual(measureSeries(entries, 'bodyweight').map((p) => p.y), [82, 80]);
  assert.equal(latestMeasure(entries, 'waist').waist, 85);
  assert.equal(measureChange(entries, 'bodyweight', now - 60 * DAY), -2);
});

test('annotateBodyweight: Körpergewicht zum Trainingszeitpunkt an unterstützten Sätzen', () => {
  const entries = [{ id: '1', date: now - 30 * DAY, bodyweight: 85 }, { id: '2', date: now - 5 * DAY, bodyweight: 80 }];
  const ws = [wo(20, 'Pull', [ex('pu', [[-30, 8]]), ex('row', [[50, 10]])]), wo(1, 'Pull', [ex('pu', [[-25, 8]])])];
  const changed = annotateBodyweight(ws, entries);
  assert.equal(changed.length, 2);
  assert.equal(changed[0].exercises[0].sets[0].bw, 85);
  assert.equal(changed[0].exercises[1].sets[0].bw, undefined); // normale Sätze unberührt
  assert.equal(changed[1].exercises[0].sets[0].bw, 80);
  assert.equal(annotateBodyweight(changed, entries).length, 0); // schon aktuell
  // effektive Last nutzt das hinterlegte Körpergewicht, nicht das aktuelle
  setBodyweight(70);
  close(setMetrics(changed[0].exercises[0].sets[0]).volume, (85 - 30) * 8);
});

// --- #15 Zusammenfassung ----------------------------------------------------------------------
test('workoutSummary: Vergleich mit letztem gleichen Training', () => {
  const before = wo(7, 'Push', [ex('bench', [[80, 8], [80, 8]])]);
  const other = wo(3, 'Pull', [ex('row', [[60, 10]])]);
  const today = wo(0, 'push ', [ex('bench', [[82.5, 8], [82.5, 8], [80, 8]])]);
  const all = [before, other, today];
  assert.equal(previousSameWorkout(all, today).id, before.id);
  const s = workoutSummary(today, all, computeAllPRs(all));
  assert.equal(s.current.sets, 3);
  assert.equal(s.previous.sets, 2);
  close(s.delta.volumePct, ((82.5 * 16 + 640) - 1280) / 1280 * 100);
  assert.equal(s.delta.sets, 1);
  assert.equal(s.current.prs, 1);
  close(s.exercises[0].change, (82.5 / 80 - 1) * 100);
  assert.deepEqual(s.exercises[0].compare, { dir: 1, text: '+2,5 kg' });
  assert.equal(workoutSummary(before, all).previous, null);
});

// --- #16 Plateaus -------------------------------------------------------------------------------
test('plateaus: regelmäßig trainiert, aber seit Wochen kein neuer Bestwert', () => {
  const ws = [];
  for (let d = 70; d >= 0; d -= 7) {
    ws.push(wo(d, 'Push', [
      ex('stuck', [[d > 50 ? 10 : 10, 12]]),                 // seit Beginn gleich -> Plateau
      ex('growing', [[50 + (70 - d) / 7 * 2.5, 8]]),          // jede Woche mehr
    ]));
  }
  const p = plateaus(ws, { now });
  assert.deepEqual(p.map((x) => x.exerciseId), ['stuck']);
  assert.ok(p[0].weeks >= 5);
});

// --- #18 Kalenderfarben -------------------------------------------------------------------------
test('workoutTypeColors: feste Farben für die häufigsten Trainingsarten', () => {
  const ws = [wo(9, 'Pull', []), wo(8, 'Push', []), wo(7, 'Beine', []), wo(6, 'Pull', []), wo(5, 'Push', []), wo(4, 'Zuhause', [])];
  const c = workoutTypeColors(ws, [{ name: 'Push' }, { name: 'Pull' }, { name: 'Beine' }], { now });
  assert.deepEqual(c.legend.map((l) => l.name), ['Push', 'Pull', 'Beine']);
  assert.equal(c.slotOf('push '), 0);
  assert.equal(c.slotOf('Zuhause'), null);
});

// --- #19 Jahresrückblick ---------------------------------------------------------------------------
test('yearInReview: Kennzahlen eines Jahres', () => {
  const y = (m, d, sets, name = 'Push') => ({ id: 'y' + ++n, name, templateId: null, startedAt: new Date(2025, m, d, 18).getTime(), endedAt: new Date(2025, m, d, 19).getTime(), notes: '', exercises: [ex('bench', sets)] });
  const ws = [y(0, 6, [[60, 8]]), y(0, 8, [[62.5, 8]]), y(2, 3, [[65, 8]]), y(5, 2, [[70, 8]]), y(5, 4, [[72.5, 8]]),
    { ...y(4, 1, [[1, 1]]), startedAt: new Date(2024, 4, 1).getTime() }]; // anderes Jahr
  const today = new Date(2025, 5, 10, 12).getTime(); // „heute“ mitten im Jahr
  const r = yearInReview(ws, 2025, { goal: 2, now: today });
  assert.equal(r.count, 5);
  assert.equal(r.perMonth[0], 2);
  assert.equal(r.perMonth[5], 2);
  assert.equal(r.topExercises[0].exerciseId, 'bench');
  assert.equal(r.topExercises[0].sessions, 5);
  assert.equal(r.progress[0].exerciseId, 'bench');
  assert.ok(r.progress[0].change > 0.1);
  assert.equal(r.bestStreak, 1);
  assert.equal(r.duration, 5 * 3600000);
  // Ø pro Woche ab dem ersten Training bis heute, nicht über alle 52 Wochen
  close(r.perWeek, 5 / ((today - new Date(2025, 0, 6, 18)) / (7 * DAY)));
});

test('Kraftindex nutzt das verlässliche 1RM', () => {
  const ws = [wo(14, 'P', [ex('a', [[80, 8], [40, 30]])]), wo(7, 'P', [ex('a', [[82.5, 8]])])];
  close(strengthIndex(ws)[1].y, 100 * (82.5 / 80));
});
