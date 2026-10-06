// Graue Vorschläge beim Loggen: Werte vom letzten Mal, Satz für Satz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setSuggestions, matchPrevious } from '../app/js/lib/calc.js';

const empty = (n, types = []) => Array.from({ length: n }, (_, i) => (types[i] ? { weight: null, reps: null, type: types[i] } : { weight: null, reps: null }));
const last = [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 77.5, reps: 7 }];
const pairs = (arr) => arr.map((s) => `${s.weight}×${s.reps}`);

test('jeder Satz zeigt den passenden Satz vom letzten Mal', () => {
  assert.deepEqual(pairs(setSuggestions(empty(3), last)), ['80×8', '80×8', '77.5×7']);
});

test('eigene Eingabe ändert die Vorschläge der folgenden Sätze NICHT', () => {
  const sets = empty(3);
  sets[0] = { weight: 85, reps: 6, done: true };
  assert.deepEqual(pairs(setSuggestions(sets, last)).slice(1), ['80×8', '77.5×7']);
});

test('mehr Sätze als letztes Mal: Rückfall auf den vorherigen Satz', () => {
  const sets = empty(4);
  assert.deepEqual(pairs(setSuggestions(sets, last))[3], '77.5×7'); // Vorschlag von Satz 3
  sets[2] = { weight: 82.5, reps: 6, done: true };
  assert.deepEqual(pairs(setSuggestions(sets, last))[3], '82.5×6'); // tatsächlicher Satz 3
});

test('neue Übung ohne Vorwerte: vorheriger Satz dieses Trainings', () => {
  const sets = empty(3);
  assert.deepEqual(pairs(setSuggestions(sets, [])), ['null×null', 'null×null', 'null×null']);
  sets[0] = { weight: 50, reps: 10 };
  assert.deepEqual(pairs(setSuggestions(sets, [])).slice(1), ['50×10', '50×10']);
});

test('Aufwärmsätze werden mit Aufwärmsätzen verglichen', () => {
  const prev = [{ weight: 40, reps: 10, type: 'warmup' }, { weight: 80, reps: 8 }];
  assert.deepEqual(pairs(setSuggestions(empty(2, ['warmup']), prev)), ['40×10', '80×8']);
  // heute ohne Aufwärmsatz: Satz 1 bekommt den ersten Arbeitssatz, nicht den Aufwärmsatz
  assert.deepEqual(pairs(setSuggestions(empty(2), prev)), ['80×8', '80×8']);
  assert.deepEqual(matchPrevious(empty(2), prev), [prev[1], null]);
});

test('Unterstützung 0 (ohne Hilfe) bleibt als Wert erhalten', () => {
  const prev = [{ weight: 0, reps: 5 }, { weight: -10, reps: 6 }];
  assert.deepEqual(pairs(setSuggestions(empty(2), prev)), ['0×5', '-10×6']);
});
