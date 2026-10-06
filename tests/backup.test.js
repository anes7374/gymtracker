import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackup, serializeBackup, parseBackup, planBackupImport, backupFileName } from '../app/js/lib/backup.js';

const data = {
  exercises: [
    { id: 'b-kniebeuge', name: 'Kniebeuge (Langhantel)', category: 'Beine', bodyweight: false, custom: false },
    { id: 'c1', name: 'Meine Übung', category: 'Brust', bodyweight: false, custom: true, createdAt: 1700000000000 },
  ],
  templates: [
    { id: 't1', name: 'Push', order: 0, exercises: [{ exerciseId: 'c1', sets: 3 }], createdAt: 1, updatedAt: 2 },
  ],
  workouts: [
    {
      id: 'w1', name: 'Push', templateId: 't1', startedAt: 1700000000000, endedAt: 1700003600000, notes: 'gut',
      exercises: [
        { exerciseId: 'c1', notes: '', sets: [{ weight: 40, reps: 10, type: 'warmup' }, { weight: 82.5, reps: 8 }] },
        { exerciseId: 'b-kniebeuge', notes: 'tief', sets: [{ weight: null, reps: 12 }] },
      ],
    },
    {
      id: 'w2', name: 'Import', templateId: null, startedAt: 1600000000000, endedAt: null, notes: '', source: 'strong',
      exercises: [{ exerciseId: 'c1', notes: '', sets: [{ weight: null, reps: null, distance: 2500, seconds: 900 }] }],
    },
  ],
  settings: { restSeconds: 150, theme: 'light' },
};

test('Export und Import ergeben dieselben Daten (Roundtrip)', () => {
  const text = serializeBackup(createBackup(data, Date.UTC(2026, 9, 1)));
  const parsed = parseBackup(text);
  assert.deepEqual(parsed.exercises, data.exercises);
  assert.deepEqual(parsed.templates, data.templates);
  assert.deepEqual(parsed.workouts, data.workouts);
  assert.deepEqual(parsed.settings, data.settings);
  assert.equal(parsed.invalid, 0);
  assert.equal(parsed.exportedAt, Date.UTC(2026, 9, 1));
});

test('parseBackup lehnt fremde Dateien ab', () => {
  assert.throws(() => parseBackup('kein json'), /kein gültiges JSON/);
  assert.throws(() => parseBackup('{"foo":1}'), /kein GymTracker-Backup/);
  assert.throws(() => parseBackup(JSON.stringify({ format: 'gymtracker-backup', version: 99, data: {} })), /neueren App-Version/);
});

test('parseBackup überspringt ungültige Einträge und bereinigt Werte', () => {
  const b = createBackup({
    exercises: [{ id: 'x', name: '' }, { id: 'c2', name: ' Curl ', category: 'Bizeps' }],
    templates: [{ name: 'ohne id' }],
    workouts: [
      { id: 'w', startedAt: '1700000000000', exercises: [{ exerciseId: 'c2', sets: [{ weight: '80,5', reps: '8' }, null] }] },
      { id: 'kaputt' },
    ],
  });
  const p = parseBackup(JSON.stringify(b));
  assert.equal(p.invalid, 3);
  assert.equal(p.exercises[0].name, 'Curl');
  assert.equal(p.exercises[0].custom, true);
  assert.equal(p.workouts[0].startedAt, 1700000000000);
  assert.deepEqual(p.workouts[0].exercises[0].sets, [{ weight: 80.5, reps: 8 }]);
  assert.equal(p.workouts[0].name, 'Training');
});

test('planBackupImport: Zusammenführen vs. Ersetzen', () => {
  const builtin = new Set(['b-kniebeuge']);
  const current = {
    exercises: [{ id: 'c0', name: 'Alt', custom: true }],
    templates: [{ id: 't0', name: 'Alt' }],
    workouts: [{ id: 'w0', startedAt: 1 }, { id: 'w1', name: 'alt', startedAt: 2 }],
    settings: { restSeconds: 90, theme: 'dark' },
  };
  const incoming = parseBackup(serializeBackup(createBackup(data)));

  const merged = planBackupImport(current, incoming, 'merge', builtin);
  assert.deepEqual(merged.exercises.map((e) => e.id).sort(), ['c0', 'c1']); // eingebaute Übung nicht übernommen
  assert.deepEqual(merged.workouts.map((w) => w.id).sort(), ['w0', 'w1', 'w2']);
  assert.equal(merged.workouts.find((w) => w.id === 'w1').name, 'Push'); // Backup gewinnt bei gleicher ID
  assert.equal(merged.settings.restSeconds, 90);

  const replaced = planBackupImport(current, incoming, 'replace', builtin);
  assert.deepEqual(replaced.exercises.map((e) => e.id), ['c1']);
  assert.deepEqual(replaced.templates.map((t) => t.id), ['t1']);
  assert.deepEqual(replaced.workouts.map((w) => w.id), ['w1', 'w2']);
  assert.equal(replaced.settings.restSeconds, 150);
});

test('backupFileName', () => {
  assert.equal(backupFileName(new Date(2026, 9, 1).getTime()), 'gymtracker-backup-2026-10-01.json');
});

test('Backup enthält Körpermaße und Supersätze', () => {
  const data = {
    exercises: [], templates: [{ id: 't', name: 'Pull', order: 0, exercises: [{ exerciseId: 'a', sets: 3, group: 'g1' }, { exerciseId: 'b', sets: 3, group: 'g1' }] }],
    workouts: [{ id: 'w', name: 'Pull', templateId: 't', startedAt: 1, endedAt: null, notes: '', exercises: [{ exerciseId: 'a', notes: '', group: 'g1', sets: [{ weight: -20, reps: 8, bw: 82, rpe: 8.5 }] }] }],
    settings: {}, measurements: [{ id: 'm1', date: 5, bodyweight: 82.5, waist: 85 }, { id: 'kaputt', date: 6 }],
  };
  const p = parseBackup(serializeBackup(createBackup(data)));
  assert.deepEqual(p.measurements, [{ id: 'm1', date: 5, bodyweight: 82.5, waist: 85 }]);
  assert.equal(p.invalid, 1);
  assert.deepEqual(p.templates[0].exercises.map((e) => e.group), ['g1', 'g1']);
  assert.deepEqual(p.workouts[0].exercises[0], data.workouts[0].exercises[0]);
});
