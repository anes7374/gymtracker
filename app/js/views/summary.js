// Zusammenfassung direkt nach „Beenden“: Kennzahlen, Vergleich mit dem letzten
// gleichen Training, Rekorde – und ein Bild zum Teilen.

import { h, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { navigate } from '../router.js';
import * as repo from '../repo.js';
import { computeAllPRs, prLabel } from '../lib/calc.js';
import { recentPRs } from '../lib/stats.js';
import { workoutSummary } from '../lib/summary.js';
import { fmtNum, fmtSet, fmtDate, fmtTime, fmtDuration, fmtDateShort, count } from '../lib/format.js';

const fmtVolume = (kg) => (kg >= 10000 ? `${fmtNum(kg / 1000, 1)} t` : `${fmtNum(kg, 0)} kg`);
const signed = (v, d = 0, unit = '') => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmtNum(Math.abs(v), d)}${unit}`;

export async function summaryView(id) {
  const w = await repo.getWorkout(id);
  if (!w) { navigate('/history', { replace: true }); return null; }
  const all = await repo.workouts();
  const prInfo = computeAllPRs(all);
  const s = workoutSummary(w, all, prInfo, { ranges: (await repo.settings()).repRanges || {} });
  const prs = recentPRs([w], prInfo);
  const d = s.delta;

  const tile = (label, value, delta) => h('div', { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value),
    delta ? h('span', { class: 'delta ' + delta.dir }, delta.text) : h('span', { class: 'stat-sub' }));
  const dir = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');

  const body = h('div', { class: 'page summary' },
    h('div', { class: 'summary-hero' },
      h('span', { class: 'summary-emoji', 'aria-hidden': 'true' }, prs.length ? '🏆' : '💪'),
      h('h1', { class: 'page-title' }, prs.length ? 'Starkes Training!' : 'Training beendet'),
      h('span', { class: 'muted' }, `${w.name} · ${fmtDate(w.startedAt)} · ${fmtTime(w.startedAt)}`)),
    h('div', { class: 'stat-row grid2' },
      tile('Dauer', s.current.duration ? fmtDuration(s.current.duration) : '–',
        d?.duration != null && Math.abs(d.duration) >= 60000 ? { dir: 'flat', text: `${signed(Math.round(d.duration / 60000))} min` } : null),
      tile('Volumen', fmtVolume(s.current.volume),
        d?.volumePct != null ? { dir: dir(Math.round(d.volumePct)), text: `${d.volumePct >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d.volumePct), 0)} %` } : null),
      tile('Sätze', String(s.current.sets), d && d.sets ? { dir: dir(d.sets), text: signed(d.sets) } : null),
      tile('Neue Rekorde', String(s.current.prs), null)),
    s.previous
      ? h('p', { class: 'muted small summary-compare' }, `Verglichen mit „${w.name}“ vom ${fmtDateShort(s.previous.date)}.`)
      : h('p', { class: 'muted small summary-compare' }, 'Erstes Training mit diesem Namen – beim nächsten Mal siehst du hier den Vergleich.'));

  if (prs.length) {
    body.append(h('h2', { class: 'section-title' }, 'Neue Rekorde'),
      h('div', { class: 'card pr-list' }, prs.map((e) => {
        const ex = repo.exercise(e.exerciseId);
        return h('div', { class: 'pr-row static' },
          h('span', { class: 'pr-icon' }, icon('trophy', { size: 18 })),
          h('strong', { class: 'pr-name' }, repo.exerciseName(e.exerciseId)),
          h('span', { class: 'muted small pr-date' }, ''),
          h('span', { class: 'pr-sub small' }, e.types.map((t) => prLabel(t, ex)).join(', '), h('span', { class: 'muted' }, ` · ${fmtSet(e.set)}`)));
      })));
  }

  body.append(h('h2', { class: 'section-title' }, 'Übungen'),
    h('div', { class: 'card list-card' }, s.exercises.map((e) =>
      h('div', { class: 'info-row summary-ex' },
        h('span', { class: 'summary-ex-name' }, repo.exerciseName(e.exerciseId),
          h('small', { class: 'muted' }, e.best ? `bester Satz ${fmtSet(e.best)}` : '')),
        e.compare
          ? h('span', { class: 'trend-badge ' + (e.compare.dir > 0 ? 'up' : e.compare.dir < 0 ? 'down' : 'flat') },
            `${e.compare.dir > 0 ? '▲' : e.compare.dir < 0 ? '▼' : '='} ${e.compare.text}`)
          : h('span', { class: 'muted small' }, 'neu')))),
    h('p', { class: 'muted small summary-compare' }, '▲▼ = bester Satz im Vergleich zum letzten gleichen Training (mehr Gewicht im Zielbereich zählt als besser).'),
    h('div', { class: 'button-stack' },
      h('button', { class: 'btn primary block', onclick: () => shareImage(w, s, prs) }, icon('share'), 'Als Bild teilen'),
      h('button', { class: 'btn secondary block', onclick: () => navigate('/history/' + w.id, { replace: true }) }, 'Details ansehen'),
      h('button', { class: 'btn ghost block', onclick: () => navigate('/', { replace: true }) }, 'Fertig')));

  return {
    title: 'Zusammenfassung',
    tab: 'train',
    actions: [h('button', { class: 'text-btn', onclick: () => navigate('/', { replace: true }) }, 'Fertig')],
    body,
  };
}

// --- Bild zum Teilen ----------------------------------------------------------------------

async function shareImage(w, s, prs) {
  const c = renderShareCanvas(w, s, prs);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], `training-${fmtDateShort(w.startedAt).replace(/\./g, '-')}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: w.name });
    } catch (err) {
      if (err?.name !== 'AbortError') toast('Teilen fehlgeschlagen');
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Zeichnet die Teilen-Grafik (1080 × 1350, Instagram-Format) auf ein Canvas. */
export function renderShareCanvas(w, s, prs) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const font = (size, weight = 600) => `${weight} ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif`;

  // Hintergrund
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#16233d');
  bg.addColorStop(1, '#0e1013');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const P = 80;
  g.fillStyle = '#6aa8ff';
  g.font = font(34, 700);
  g.fillText('GYMTRACKER', P, P + 30);
  g.fillStyle = '#ffffff';
  g.font = font(84, 800);
  g.fillText(clip(g, w.name, W - 2 * P), P, P + 150);
  g.fillStyle = '#b6bdc8';
  g.font = font(36, 500);
  g.fillText(`${fmtDate(w.startedAt)} · ${fmtTime(w.startedAt)}`, P, P + 210);

  // Kennzahlen 2×2
  const stats = [
    ['Dauer', s.current.duration ? fmtDuration(s.current.duration) : '–'],
    ['Volumen', fmtVolume(s.current.volume)],
    ['Sätze', String(s.current.sets)],
    ['Rekorde', String(s.current.prs)],
  ];
  const bw = (W - 2 * P - 30) / 2, bh = 170;
  stats.forEach(([label, value], i) => {
    const x = P + (i % 2) * (bw + 30), y = 340 + Math.floor(i / 2) * (bh + 30);
    g.fillStyle = 'rgba(255,255,255,0.07)';
    roundRect(g, x, y, bw, bh, 28);
    g.fill();
    g.fillStyle = '#8b94a2';
    g.font = font(32, 600);
    g.fillText(label, x + 36, y + 58);
    g.fillStyle = '#ffffff';
    g.font = font(64, 800);
    g.fillText(value, x + 36, y + 136);
  });

  // Übungen mit bestem Satz
  let y = 790;
  g.fillStyle = '#8b94a2';
  g.font = font(30, 700);
  g.fillText('ÜBUNGEN', P, y);
  y += 30;
  for (const e of s.exercises.slice(0, 6)) {
    y += 62;
    const hasPr = prs.some((p) => p.exerciseId === e.exerciseId);
    g.fillStyle = '#f3f5f8';
    g.font = font(38, 600);
    g.fillText(clip(g, (hasPr ? '🏆 ' : '') + repo.exerciseName(e.exerciseId), W - 2 * P - 260), P, y);
    g.fillStyle = '#b6bdc8';
    g.font = font(36, 600);
    const best = e.best ? fmtSet(e.best) : '';
    g.fillText(best, W - P - g.measureText(best).width, y);
  }
  if (s.exercises.length > 6) {
    g.fillStyle = '#8b94a2';
    g.font = font(32, 500);
    g.fillText(`+ ${count(s.exercises.length - 6, 'weitere Übung', 'weitere Übungen')}`, P, y + 56);
  }

  // Fußzeile
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(P, H - 130, W - 2 * P, 2);
  g.fillStyle = '#8b94a2';
  g.font = font(30, 600);
  const foot = s.current.prs ? `${count(s.current.prs, 'neuer Rekord', 'neue Rekorde')} 🏆` : 'Training abgeschlossen 💪';
  g.fillText(foot, P, H - 70);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Text auf Breite kürzen (mit …). */
function clip(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

