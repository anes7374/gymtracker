// Stellt sicher, dass der Service Worker wirklich alle App-Dateien offline vorhält.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

const sw = readFileSync(join(APP, 'sw.js'), 'utf8');
const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

test('Jede App-Datei ist im Offline-Cache des Service Workers', () => {
  const files = listFiles(APP)
    .map((f) => './' + relative(APP, f).split('\\').join('/'))
    .filter((f) => f !== './sw.js');
  const missing = files.filter((f) => !assets.includes(f));
  assert.deepEqual(missing, [], 'Fehlt in ASSETS (app/sw.js): ' + missing.join(', '));
});

test('Jeder Eintrag im Offline-Cache existiert', () => {
  const gone = assets.filter((a) => a !== './' && !existsSync(join(APP, a)));
  assert.deepEqual(gone, []);
});

test('Alle relativen Imports zeigen auf existierende Dateien', () => {
  for (const f of listFiles(join(APP, 'js'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
      assert.ok(existsSync(join(dirname(f), m[1])), `${relative(APP, f)} importiert fehlende Datei ${m[1]}`);
    }
  }
});

test('Versionsplatzhalter ist vorhanden (wird beim Deploy ersetzt)', () => {
  assert.match(sw, /const VERSION = '__BUILD__'/);
  // Genau einmal – sonst ersetzt der Build auch Vergleiche (DEV wäre immer true).
  assert.equal(sw.split('__BUILD__').length - 1, 1, '__BUILD__ darf in sw.js nur einmal vorkommen');
  assert.match(readFileSync(join(APP, 'js', 'version.js'), 'utf8'), /'__BUILD__'/);
});
