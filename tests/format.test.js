import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, fmtNum, fmtSet, fmtClock, fmtDuration, toDateTimeLocal, fromDateTimeLocal, normalizeSearch } from '../app/js/lib/format.js';

test('parseNumber akzeptiert Komma und Punkt', () => {
  assert.equal(parseNumber('80'), 80);
  assert.equal(parseNumber('80,5'), 80.5);
  assert.equal(parseNumber('80.5'), 80.5);
  assert.equal(parseNumber(' 102,25 '), 102.25);
  assert.equal(parseNumber(',5'), 0.5);
  assert.equal(parseNumber('1.234,5'), 1234.5);
  assert.equal(parseNumber('1,234.5'), 1234.5);
  assert.equal(parseNumber(42), 42);
  assert.equal(parseNumber('−30'), -30); // typografisches Minus
  assert.equal(parseNumber('-27,5'), -27.5);
});

test('parseNumber lehnt Ungültiges ab', () => {
  for (const v of ['', '   ', 'abc', '-', ',', '1,2,3', '12kg', null, undefined, NaN]) {
    assert.equal(parseNumber(v), null, `Eingabe ${JSON.stringify(v)}`);
  }
});

test('fmtNum formatiert deutsch', () => {
  assert.equal(fmtNum(1234.5), '1.234,5');
  assert.equal(fmtNum(80), '80');
  assert.equal(fmtNum(93.3333, 1), '93,3');
  assert.equal(fmtNum(null), '');
  assert.equal(fmtNum(-30), '−30');
});

test('fmtSet zeigt Gewicht × Wiederholungen', () => {
  assert.equal(fmtSet({ weight: 80, reps: 8 }), '80 kg × 8');
  assert.equal(fmtSet({ weight: 82.5, reps: 5 }, { unit: false }), '82,5 × 5');
  assert.equal(fmtSet({ weight: null, reps: 12 }), '12 Wdh.');
  assert.equal(fmtSet({ weight: null, reps: null, distance: 5000 }), '5 km');
});

test('fmtClock und fmtDuration', () => {
  assert.equal(fmtClock(90), '1:30');
  assert.equal(fmtClock(5), '0:05');
  assert.equal(fmtClock(3723), '1:02:03');
  assert.equal(fmtDuration(45 * 60000), '45 min');
  assert.equal(fmtDuration(65 * 60000), '1 h 05 min');
});

test('datetime-local Hin- und Rückweg', () => {
  const ts = new Date(2026, 9, 1, 18, 30).getTime();
  assert.equal(toDateTimeLocal(ts), '2026-10-01T18:30');
  assert.equal(fromDateTimeLocal('2026-10-01T18:30'), ts);
  assert.equal(fromDateTimeLocal('kaputt'), null);
});

test('normalizeSearch ignoriert Umlaute und Großschreibung', () => {
  assert.equal(normalizeSearch('Bankdrücken'), 'bankdrucken');
  assert.equal(normalizeSearch('Fuß'), 'fuss');
});
