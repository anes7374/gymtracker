// Schlankes SVG-Liniendiagramm mit Fadenkreuz + Tooltip (Touch & Maus).
// Keine externe Bibliothek nötig → funktioniert garantiert offline.

import { h } from './dom.js';
import { fmtDateShort, fmtDateTiny, fmtMonthShort } from '../lib/format.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

/** "Schöne" Achsenwerte (1, 2, 2,5, 5, 10 × 10^n). */
export function niceTicks(min, max, count = 4) {
  if (!(max > min)) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/**
 * Erzeugt ein Diagramm-Element. points: [{x: Zeitstempel, y: Wert}] (aufsteigend).
 * format(v): Text für Werte (Tooltip, Achse, Endwert).
 */
export function lineChart(points, { format = String, axisFormat = format, label = '' } = {}) {
  const wrap = h('div', { class: 'chart', role: 'img', 'aria-label': label });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tip);

  let svg = null;
  let width = 0;
  const HEIGHT = 220;

  function draw() {
    const w = Math.round(wrap.clientWidth);
    if (!w || w === width) return;
    width = w;
    svg?.remove();
    svg = render(w);
    wrap.prepend(svg);
  }

  function render(W) {
    const pad = { top: 16, right: 14, bottom: 26, left: 46 };
    const iw = W - pad.left - pad.right;
    const ih = HEIGHT - pad.top - pad.bottom;
    const root = s('svg', { viewBox: `0 0 ${W} ${HEIGHT}`, width: W, height: HEIGHT, class: 'chart-svg' });

    const ys = points.map((p) => p.y);
    const yTicks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
    const y0 = yTicks[0], y1 = yTicks[yTicks.length - 1];
    let x0 = points[0].x, x1 = points[points.length - 1].x;
    if (x1 === x0) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
    const X = (x) => pad.left + ((x - x0) / (x1 - x0)) * iw;
    const Y = (y) => pad.top + ih - ((y - y0) / (y1 - y0)) * ih;

    // Gitter + y-Achse
    const grid = s('g', { class: 'chart-grid' });
    for (const t of yTicks) {
      const y = Y(t);
      grid.append(s('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y }));
      const txt = s('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-axis' });
      txt.textContent = axisFormat(t);
      grid.append(txt);
    }
    root.append(grid);

    // x-Achse: bis zu 4 Datumsmarken
    const spanDays = (x1 - x0) / 86400000;
    const xCount = Math.min(4, Math.max(2, Math.floor(iw / 80)));
    for (let i = 0; i < xCount; i++) {
      const t = x0 + ((x1 - x0) * i) / (xCount - 1);
      const d = new Date(t);
      const lbl = spanDays > 200 ? `${fmtMonthShort(t)} ${String(d.getFullYear()).slice(2)}` : fmtDateTiny(t);
      const anchor = i === 0 ? 'start' : i === xCount - 1 ? 'end' : 'middle';
      const txt = s('text', { x: X(t), y: HEIGHT - 6, 'text-anchor': anchor, class: 'chart-axis' });
      txt.textContent = lbl;
      root.append(txt);
    }

    // Fläche + Linie
    const pts = points.map((p) => [X(p.x), Y(p.y)]);
    const linePath = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    if (pts.length > 1) {
      const area = `${linePath}L${pts[pts.length - 1][0].toFixed(1)},${pad.top + ih}L${pts[0][0].toFixed(1)},${pad.top + ih}Z`;
      root.append(s('path', { d: area, class: 'chart-area' }));
      root.append(s('path', { d: linePath, class: 'chart-line' }));
    }

    // Punkte: bei wenigen Werten alle, sonst nur der letzte
    const showAll = pts.length <= 30;
    pts.forEach(([x, y], i) => {
      if (showAll || i === pts.length - 1) root.append(s('circle', { cx: x, cy: y, r: 4, class: 'chart-dot' }));
    });

    // Endwert direkt beschriften
    const [lx, ly] = pts[pts.length - 1];
    const endLabel = s('text', { x: Math.min(lx, W - pad.right), y: Math.max(ly - 10, 12), 'text-anchor': 'end', class: 'chart-end' });
    endLabel.textContent = format(points[points.length - 1].y);
    root.append(endLabel);

    // Fadenkreuz
    const cross = s('line', { y1: pad.top, y2: pad.top + ih, class: 'chart-cross', visibility: 'hidden' });
    const hot = s('circle', { r: 6, class: 'chart-dot hot', visibility: 'hidden' });
    root.append(cross, hot);

    const hit = s('rect', { x: 0, y: 0, width: W, height: HEIGHT, fill: 'transparent' });
    root.append(hit);

    const show = (clientX) => {
      const rect = root.getBoundingClientRect();
      const px = clientX - rect.left;
      let best = 0;
      for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - px) < Math.abs(pts[best][0] - px)) best = i;
      const [cx, cy] = pts[best];
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      hot.setAttribute('cx', cx); hot.setAttribute('cy', cy); hot.setAttribute('visibility', 'visible');
      tip.hidden = false;
      tip.replaceChildren(h('strong', null, format(points[best].y)), h('span', null, fmtDateShort(points[best].x)));
      const tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(W - tw, cx - tw / 2)) + 'px';
      tip.style.top = Math.max(0, cy - 58) + 'px';
      endLabel.setAttribute('visibility', 'hidden');
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      hot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      endLabel.setAttribute('visibility', 'visible');
    };
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    // Bei Touch bleibt der Tooltip nach dem Loslassen stehen; Maus blendet ihn aus.
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); });
    return root;
  }

  const ro = new ResizeObserver(() => draw());
  ro.observe(wrap);
  return wrap;
}

/**
 * Säulendiagramm (z. B. Trainings pro Woche). points: [{x, y}].
 * goal: optionale Ziellinie; tip(p): Text für den Tooltip-Titel; xLabel(p): Achsenbeschriftung.
 */
export function barChart(points, { format = String, tipValue = format, tip = (p) => fmtDateShort(p.x), xLabel = (p) => fmtDateTiny(p.x), goal = null, label = '', integer = false } = {}) {
  const wrap = h('div', { class: 'chart bars', role: 'img', 'aria-label': label });
  const tipEl = h('div', { class: 'chart-tip', hidden: true });
  wrap.append(tipEl);
  const HEIGHT = 180;
  let svg = null;
  let width = 0;

  const draw = () => {
    const w = Math.round(wrap.clientWidth);
    if (!w || w === width) return;
    width = w;
    svg?.remove();
    svg = render(w);
    wrap.prepend(svg);
  };

  function render(W) {
    const pad = { top: 14, right: 6, bottom: 24, left: 30 };
    const iw = W - pad.left - pad.right;
    const ih = HEIGHT - pad.top - pad.bottom;
    const root = s('svg', { viewBox: `0 0 ${W} ${HEIGHT}`, width: W, height: HEIGHT, class: 'chart-svg' });
    const maxY = Math.max(goal || 0, ...points.map((p) => p.y), integer ? 1 : 0.001);
    let ticks = niceTicks(0, maxY, 3);
    if (integer) ticks = ticks.filter((t) => Number.isInteger(t));
    const top = ticks[ticks.length - 1];
    const Y = (v) => pad.top + ih - (v / top) * ih;

    const grid = s('g', { class: 'chart-grid' });
    for (const t of ticks) {
      grid.append(s('line', { x1: pad.left, x2: W - pad.right, y1: Y(t), y2: Y(t) }));
      const txt = s('text', { x: pad.left - 6, y: Y(t) + 4, 'text-anchor': 'end', class: 'chart-axis' });
      txt.textContent = format(t);
      grid.append(txt);
    }
    root.append(grid);

    const slot = iw / points.length;
    const bw = Math.max(2, Math.min(24, slot - 2)); // 2px Abstand zwischen Säulen
    const bars = points.map((p, i) => {
      const x = pad.left + i * slot + (slot - bw) / 2;
      const y = Y(p.y);
      const hgt = pad.top + ih - y;
      if (!(p.y > 0)) return null;
      const r = Math.min(4, bw / 2, hgt);
      const d = `M${x},${pad.top + ih}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${pad.top + ih}Z`;
      const el = s('path', { d, class: 'chart-bar' + (goal != null && p.y >= goal ? ' met' : '') });
      root.append(el);
      return el;
    });

    if (goal != null) {
      const gy = Y(goal);
      root.append(s('line', { x1: pad.left, x2: W - pad.right, y1: gy, y2: gy, class: 'chart-goal' }));
      const gt = s('text', { x: W - pad.right, y: gy - 5, 'text-anchor': 'end', class: 'chart-goal-label' });
      gt.textContent = 'Ziel';
      root.append(gt);
    }

    // x-Achse: bis zu 4 Beschriftungen
    const labelCount = Math.min(4, points.length);
    for (let k = 0; k < labelCount; k++) {
      const i = labelCount === 1 ? 0 : Math.round((k * (points.length - 1)) / (labelCount - 1));
      const cx = pad.left + i * slot + slot / 2;
      const anchor = k === 0 ? 'start' : k === labelCount - 1 ? 'end' : 'middle';
      const t = s('text', { x: k === 0 ? pad.left : k === labelCount - 1 ? W - pad.right : cx, y: HEIGHT - 6, 'text-anchor': anchor, class: 'chart-axis' });
      t.textContent = xLabel(points[i]);
      root.append(t);
    }

    const hit = s('rect', { x: 0, y: 0, width: W, height: HEIGHT, fill: 'transparent' });
    root.append(hit);
    let hot = -1;
    const show = (clientX) => {
      const px = clientX - root.getBoundingClientRect().left;
      const i = Math.max(0, Math.min(points.length - 1, Math.floor((px - pad.left) / slot)));
      if (hot !== -1) bars[hot]?.classList.remove('hot');
      hot = i;
      bars[i]?.classList.add('hot');
      tipEl.hidden = false;
      tipEl.replaceChildren(h('strong', null, tipValue(points[i].y)), h('span', null, tip(points[i])));
      const tw = tipEl.offsetWidth;
      const cx = pad.left + i * slot + slot / 2;
      tipEl.style.left = Math.max(0, Math.min(W - tw, cx - tw / 2)) + 'px';
      tipEl.style.top = Math.max(0, Y(points[i].y) - 54) + 'px';
    };
    hit.addEventListener('pointerdown', (e) => show(e.clientX));
    hit.addEventListener('pointermove', (e) => show(e.clientX));
    hit.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      tipEl.hidden = true;
      if (hot !== -1) bars[hot]?.classList.remove('hot');
    });
    return root;
  }

  new ResizeObserver(draw).observe(wrap);
  return wrap;
}

/** Mini-Verlaufslinie ohne Achsen (für Listen). */
export function sparkline(values, { width = 84, height = 30 } = {}) {
  const root = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'sparkline', 'aria-hidden': 'true' });
  if (values.length < 2) return root;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const P = 4;
  const pts = values.map((v, i) => [
    P + (i / (values.length - 1)) * (width - 2 * P),
    height - P - ((v - min) / span) * (height - 2 * P),
  ]);
  root.append(s('path', { d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(''), class: 'spark-line' }));
  const [lx, ly] = pts[pts.length - 1];
  root.append(s('circle', { cx: lx, cy: ly, r: 3, class: 'spark-dot' }));
  return root;
}
