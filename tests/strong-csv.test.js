import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCSV, detectDelimiter, parseStrongCSV, planStrongImport, parseDurationSeconds, parseDateTime, parseSetOrder,
} from '../app/js/lib/strong-csv.js';
import { BUILTIN_EXERCISES } from '../app/js/lib/exercises-data.js';

// Aktuelles Strong-Format (Komma, Anführungszeichen, "Workout #", Dauer in Sekunden, Pausentimer-Zeilen)
const NEW_FORMAT = [
  '"Workout #","Date","Workout Name","Duration (sec)","Exercise Name","Set Order","Weight (kg)","Reps","RPE","Distance (meters)","Seconds","Notes","Workout Notes"',
  '"1","2024-01-15 08:30:00","Push Day","3900","Bench Press (Barbell)","W","40","10","","","","","Guter Tag"',
  '"1","2024-01-15 08:30:00","Push Day","3900","Bench Press (Barbell)","1","80","8","8","","","Griff, eng",""',
  '"1","2024-01-15 08:30:00","Push Day","3900","Bench Press (Barbell)","2","80","7","","","","",""',
  '"1","2024-01-15 08:30:00","Push Day","3900","Bench Press (Barbell)","Rest Timer","","","","","90","",""',
  '"1","2024-01-15 08:30:00","Push Day","3900","Cable Fly Special","1","15","12","","","","Zeile 1',
  'Zeile 2",""',
  '"2","2024-01-17 18:00:00","Legs","2700","Squat (Barbell)","1","100","5","","","","",""',
  '"2","2024-01-17 18:00:00","Legs","2700","Running (Treadmill)","1","","","","2500","900","",""',
].join('\n');

// Älteres Format: Semikolon, deutsches Dezimalkomma, eigene Einheitenspalte (lbs), Dauer als Text
const OLD_FORMAT = [
  'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Weight Unit;Reps;RPE;Distance;Distance Unit;Seconds;Notes;Workout Notes',
  '2023-03-01 07:00:00;Morning;1h 5m;Deadlift (Barbell);1;225;lbs;5;;;;0;;',
  '2023-03-01 07:00:00;Morning;1h 5m;Deadlift (Barbell);2;232,5;lbs;3;;;;0;;',
  '2023-03-01 07:00:00;Morning;1h 5m;Pull Up;1;0;lbs;12;;;;0;;',
].join('\r\n');

test('parseCSV: Anführungszeichen, Kommas und Zeilenumbrüche in Feldern', () => {
  const rows = parseCSV('a,"b, c","He said ""hi"""\n1,"x\ny",3\n\n');
  assert.deepEqual(rows, [['a', 'b, c', 'He said "hi"'], ['1', 'x\ny', '3']]);
});

test('parseCSV: BOM, CRLF, leere Felder', () => {
  const rows = parseCSV('﻿a;b;c\r\n1;;3\r\n', ';');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', '', '3']]);
});

test('detectDelimiter', () => {
  assert.equal(detectDelimiter('a,b,c\n1;2;3'), ',');
  assert.equal(detectDelimiter('a;b;c\n1,5;2;3'), ';');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
  assert.equal(detectDelimiter('"x;y",b,c'), ',');
});

test('parseDurationSeconds', () => {
  assert.equal(parseDurationSeconds('1h 5m'), 3900);
  assert.equal(parseDurationSeconds('45m'), 2700);
  assert.equal(parseDurationSeconds('1h'), 3600);
  assert.equal(parseDurationSeconds('1 h 5 min 30 s'), 3930);
  assert.equal(parseDurationSeconds('01:05:00'), 3900);
  assert.equal(parseDurationSeconds('3900', 'duration (sec)'), 3900);
  assert.equal(parseDurationSeconds('75', 'duration'), 4500);
  assert.equal(parseDurationSeconds(''), null);
  assert.equal(parseDurationSeconds('irgendwas'), null);
});

test('parseDateTime in verschiedenen Formaten (lokale Zeit)', () => {
  const expected = new Date(2024, 0, 15, 8, 30).getTime();
  assert.equal(parseDateTime('2024-01-15 08:30:00'), expected);
  assert.equal(parseDateTime('2024-01-15T08:30'), expected);
  assert.equal(parseDateTime('15.01.2024 08:30'), expected);
  assert.equal(parseDateTime('1/15/2024 8:30 AM'), expected);
  assert.equal(parseDateTime('1/15/2024 8:30 PM'), new Date(2024, 0, 15, 20, 30).getTime());
  assert.equal(parseDateTime('kein datum'), null);
});

test('parseSetOrder', () => {
  assert.deepEqual(parseSetOrder('3'), { type: 'normal' });
  assert.deepEqual(parseSetOrder('W'), { type: 'warmup' });
  assert.deepEqual(parseSetOrder('D'), { type: 'drop' });
  assert.deepEqual(parseSetOrder('Rest Timer'), { skip: 'rest' });
});

test('parseStrongCSV: aktuelles Format', () => {
  const r = parseStrongCSV(NEW_FORMAT);
  assert.equal(r.workouts.length, 2);
  assert.equal(r.stats.sets, 6);
  assert.equal(r.stats.skippedRest, 1);
  assert.equal(r.stats.convertedLbs, false);

  const [push, legs] = r.workouts;
  assert.equal(push.name, 'Push Day');
  assert.equal(push.startedAt, new Date(2024, 0, 15, 8, 30).getTime());
  assert.equal(push.endedAt - push.startedAt, 3900 * 1000);
  assert.equal(push.notes, 'Guter Tag');
  assert.equal(push.exercises.length, 2);

  const bench = push.exercises[0];
  assert.equal(bench.name, 'Bench Press (Barbell)');
  assert.equal(bench.notes, 'Griff, eng');
  assert.deepEqual(bench.sets, [
    { weight: 40, reps: 10, type: 'warmup' },
    { weight: 80, reps: 8, rpe: 8 },
    { weight: 80, reps: 7 },
  ]);
  assert.equal(push.exercises[1].notes, 'Zeile 1\nZeile 2');

  assert.equal(legs.exercises[1].sets[0].distance, 2500);
  assert.equal(legs.exercises[1].sets[0].seconds, 900);
  assert.equal(legs.exercises[1].sets[0].weight, null);

  assert.equal(r.exercises.find((e) => e.name === 'Bench Press (Barbell)').sets, 3);
  assert.equal(r.columns.exerciseName, 'Exercise Name');
});

test('parseStrongCSV: altes Format mit lbs, Semikolon und Dezimalkomma', () => {
  const r = parseStrongCSV(OLD_FORMAT);
  assert.equal(r.workouts.length, 1);
  const w = r.workouts[0];
  assert.equal(w.endedAt - w.startedAt, 3900 * 1000);
  const dl = w.exercises[0].sets;
  assert.equal(dl[0].weight, 102.06); // 225 lbs
  assert.equal(dl[1].weight, 105.46); // 232,5 lbs
  assert.equal(r.stats.convertedLbs, true);
  assert.deepEqual(w.exercises[1].sets[0], { weight: null, reps: 12 }); // Körpergewicht
});

// Export der deutschen Strong-App: übersetzte Spaltennamen, "Ruhezeit"-Zeilen, keine Einheit
const GERMAN_FORMAT = [
  'Datum,Workout-Name,Dauer,Name der Übung,Reihenfolge festlegen,Gewicht,Wiederh.,Entfernung,Sekunden,Notizen,Workout-Notizen,RPE',
  '2025-08-23 17:51:23,"Ganzkörper",2h 23min,"Chest Press (Machine)",1,50.0,12.0,0,0.0,"","Erstes Training",',
  '2025-08-23 17:51:23,"Ganzkörper",2h 23min,"Chest Press (Machine)",Ruhezeit,0,0.0,0,120.0,,,',
  '2025-08-23 17:51:23,"Ganzkörper",2h 23min,"Chest Press (Machine)",2,55.0,10.0,0,0.0,,,8',
  '2025-08-23 17:51:23,"Ganzkörper",2h 23min,"Push Up",1,0,15.0,0,0.0,"",,',
  '2026-09-30 20:37:54,"Push ",13min,"Hammer Curl (Cable)",1,17.5,8.0,0,0.0,"",,',
].join('\n');

test('parseStrongCSV: deutscher Strong-Export', () => {
  const r = parseStrongCSV(GERMAN_FORMAT);
  assert.equal(r.columns.exerciseName, 'Name der Übung');
  assert.equal(r.columns.setOrder, 'Reihenfolge festlegen');
  assert.equal(r.columns.reps, 'Wiederh.');
  assert.equal(r.columns.workoutNotes, 'Workout-Notizen');
  assert.equal(r.workouts.length, 2);
  assert.equal(r.stats.sets, 4);
  assert.equal(r.stats.skippedRest, 1);
  assert.equal(r.stats.unitKnown, false);
  const [w1, w2] = r.workouts;
  assert.equal(w1.name, 'Ganzkörper');
  assert.equal(w1.notes, 'Erstes Training');
  assert.equal(w1.endedAt - w1.startedAt, (2 * 60 + 23) * 60000);
  assert.deepEqual(w1.exercises[0].sets, [{ weight: 50, reps: 12 }, { weight: 55, reps: 10, rpe: 8 }]);
  assert.deepEqual(w1.exercises[1].sets, [{ weight: null, reps: 15 }]);
  assert.equal(w2.name, 'Push'); // Leerzeichen am Ende entfernt
  assert.equal(w2.endedAt - w2.startedAt, 13 * 60000);
});

test('planStrongImport: manuelle Zuordnung aus der Vorschau', () => {
  const parsed = parseStrongCSV(GERMAN_FORMAT);
  const auto = planStrongImport(parsed, { exercises: BUILTIN_EXERCISES, workouts: [] });
  const byFrom = (plan) => Object.fromEntries(plan.mapping.map((m) => [m.from, m]));
  assert.equal(byFrom(auto)['Hammer Curl (Cable)'].id, 'b-hammercurls-kabel');
  assert.equal(byFrom(auto)['Chest Press (Machine)'].id, 'b-brustpresse');

  const manual = planStrongImport(parsed, { exercises: BUILTIN_EXERCISES, workouts: [] }, {
    overrides: { 'Chest Press (Machine)': 'b-bankdruecken-mp', 'Push Up': 'new' },
  });
  const m = byFrom(manual);
  assert.equal(m['Chest Press (Machine)'].id, 'b-bankdruecken-mp');
  assert.equal(m['Chest Press (Machine)'].status, 'manual');
  assert.equal(m['Push Up'].status, 'new'); // eigene Übung statt "Liegestütze"
  assert.equal(m['Push Up'].to, 'Push Up');
  assert.equal(manual.newExercises.length, 1);
  assert.equal(manual.workouts[0].exercises[0].exerciseId, 'b-bankdruecken-mp');
});

test('parseStrongCSV: Spaltenreihenfolge egal, Einheit im Spaltennamen', () => {
  const csv = '﻿Exercise Name,Reps,Weight (lbs),Date\r\nBench Press (Barbell),5,135,2024-02-01 10:00:00\r\n';
  const r = parseStrongCSV(csv);
  assert.equal(r.workouts.length, 1);
  assert.equal(r.workouts[0].name, 'Training');
  assert.deepEqual(r.workouts[0].exercises[0].sets[0], { weight: 61.23, reps: 5 });
});

test('parseStrongCSV: verständliche Fehler', () => {
  assert.throws(() => parseStrongCSV(''), /leer/);
  assert.throws(() => parseStrongCSV('Name,Wert\nA,1\n'), /Exercise Name/);
  assert.throws(() => parseStrongCSV('Date,Exercise Name\n'), /keine Datenzeilen/);
});

test('planStrongImport: Übungen zuordnen, Duplikate überspringen', () => {
  const parsed = parseStrongCSV(NEW_FORMAT);
  let n = 0;
  const existing = {
    exercises: [...BUILTIN_EXERCISES, { id: 'c1', name: 'cable fly special', category: 'Brust', custom: true }],
    // Training 2 existiert schon (30 s Abweichung)
    workouts: [{ id: 'old', startedAt: new Date(2024, 0, 17, 18, 0, 30).getTime(), exercises: [] }],
  };
  const plan = planStrongImport(parsed, existing, { makeId: () => 'id' + ++n, now: 0 });

  const byFrom = Object.fromEntries(plan.mapping.map((m) => [m.from, m]));
  assert.equal(byFrom['Bench Press (Barbell)'].id, 'b-bankdruecken-lh');
  assert.equal(byFrom['Bench Press (Barbell)'].status, 'mapped');
  assert.equal(byFrom['Cable Fly Special'].id, 'c1');
  assert.equal(byFrom['Cable Fly Special'].status, 'existing');
  assert.equal(byFrom['Squat (Barbell)'].id, 'b-kniebeuge');
  assert.equal(byFrom['Running (Treadmill)'].status, 'new');
  assert.equal(plan.newExercises.length, 1);
  assert.equal(plan.newExercises[0].name, 'Running (Treadmill)');
  assert.equal(plan.newExercises[0].custom, true);

  assert.equal(plan.duplicates, 1);
  assert.equal(plan.workouts.length, 1);
  assert.equal(plan.setCount, 4);
  const w = plan.workouts[0];
  assert.equal(w.source, 'strong');
  assert.deepEqual(w.exercises.map((e) => e.exerciseId), ['b-bankdruecken-lh', 'c1']);
});

test('planStrongImport: erneuter Import ist idempotent', () => {
  const parsed = parseStrongCSV(NEW_FORMAT);
  const first = planStrongImport(parsed, { exercises: BUILTIN_EXERCISES, workouts: [] });
  const second = planStrongImport(parsed, {
    exercises: [...BUILTIN_EXERCISES, ...first.newExercises],
    workouts: first.workouts,
  });
  assert.equal(second.workouts.length, 0);
  assert.equal(second.duplicates, 2);
  assert.equal(second.newExercises.length, 0);
});
