// Erzeugt die App-Icons (PNG) ohne externe Abhängigkeiten.
// Aufruf: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'icons');

// --- PNG-Encoder -------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Formen (Signed Distance) -------------------------------------------------
function roundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Hantel, symmetrisch um (0,0), Koordinaten relativ zur Icongröße
function dumbbell(x, y) {
  const ax = Math.abs(x);
  return Math.min(
    roundRect(ax, y, 0, 0, 0.30, 0.03, 0.02),        // Stange
    roundRect(ax, y, 0.165, 0, 0.04, 0.175, 0.035),  // innere Scheiben
    roundRect(ax, y, 0.245, 0, 0.03, 0.12, 0.028),   // äußere Scheiben
  );
}

function render(size, { scale = 1, rounded = false, angle = 0.52 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 4; // Supersampling 4×4
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const top = [64, 144, 255], bottom = [24, 84, 196];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bgCov = 0, fgCov = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size - 0.5;
          const v = (py + (sy + 0.5) / SS) / size - 0.5;
          const inBg = rounded ? roundRect(u, v, 0, 0, 0.5, 0.5, 0.2) <= 0 : true;
          if (!inBg) continue;
          bgCov++;
          // Drehen und skalieren für die Hantel
          const ru = (u * cos - v * sin) / scale;
          const rv = (u * sin + v * cos) / scale;
          if (dumbbell(ru, rv) <= 0) fgCov++;
        }
      }
      const n = SS * SS;
      const t = py / (size - 1);
      const bg = top.map((c, i) => c + (bottom[i] - c) * t);
      const f = bgCov ? fgCov / bgCov : 0;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(bg[0] + (255 - bg[0]) * f);
      rgba[i + 1] = Math.round(bg[1] + (255 - bg[1]) * f);
      rgba[i + 2] = Math.round(bg[2] + (255 - bg[2]) * f);
      rgba[i + 3] = Math.round((bgCov / n) * 255);
    }
  }
  return encodePNG(size, rgba);
}

mkdirSync(OUT, { recursive: true });
const files = {
  'apple-touch-icon.png': render(180),                       // iOS rundet selbst ab
  'icon-192.png': render(192, { rounded: true }),
  'icon-512.png': render(512, { rounded: true }),
  'icon-maskable-512.png': render(512, { scale: 0.78 }),     // Inhalt in der sicheren Zone
  'favicon-32.png': render(32, { rounded: true, scale: 1.15 }),
};
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(OUT, name), buf);
  console.log('✓', name, buf.length, 'Bytes');
}
