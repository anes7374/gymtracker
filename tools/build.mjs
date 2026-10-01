// Kopiert app/ nach dist/ und setzt die Versionsnummer (statt "__BUILD__").
// Wird vom GitHub-Actions-Deploy verwendet; lokal: node tools/build.mjs
import { cpSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'app');
const OUT = join(ROOT, 'dist');

const d = new Date();
const pad = (x) => String(x).padStart(2, '0');
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const version = `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}-${sha}`;

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });
for (const file of ['sw.js', 'js/version.js']) {
  const p = join(OUT, file);
  const src = readFileSync(p, 'utf8');
  if (!src.includes('__BUILD__')) throw new Error(`Platzhalter fehlt in ${file}`);
  writeFileSync(p, src.replaceAll('__BUILD__', version));
}
console.log('Build fertig: dist/ – Version', version);
