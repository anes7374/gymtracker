// Pausentimer – zeitstempelbasiert: Gespeichert wird nur der Endzeitpunkt
// (endsAt). Die Restzeit wird bei jeder Anzeige aus Date.now() berechnet,
// deshalb läuft der Timer nach Bildschirmsperre, App-Wechsel oder sogar
// Neustart der App korrekt weiter. Das Intervall aktualisiert nur die Anzeige.

import * as repo from './repo.js';
import { h, clear } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { fmtClock } from './lib/format.js';

const KEY = 'restTimer';
let state = null;        // { endsAt, duration }
let el = null;
let interval = null;
let doneUntil = 0;       // "Pause vorbei"-Hinweis bis zu diesem Zeitpunkt zeigen
let audioCtx = null;
let refs = null;

export async function init(container) {
  el = container;
  state = await repo.getMeta(KEY, null);
  if (state && state.endsAt <= Date.now()) { state = null; persist(); }
  render();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
  // iOS gibt Audio erst nach einer Berührung frei.
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
}

export function isRunning() {
  return !!state;
}

export function remaining() {
  return state ? Math.max(0, (state.endsAt - Date.now()) / 1000) : 0;
}

export function start(seconds) {
  state = { endsAt: Date.now() + seconds * 1000, duration: seconds };
  doneUntil = 0;
  persist();
  render();
}

export function adjust(deltaSeconds) {
  if (!state) return;
  state.endsAt += deltaSeconds * 1000;
  state.duration = Math.max(1, state.duration + deltaSeconds);
  if (state.endsAt <= Date.now()) { stop(); return; }
  persist();
  update();
}

export function stop() {
  state = null;
  doneUntil = 0;
  persist();
  render();
}

function persist() {
  repo.setMeta(KEY, state).catch(() => {});
}

function ensureInterval(on) {
  if (on && !interval) interval = setInterval(tick, 250);
  if (!on && interval) { clearInterval(interval); interval = null; }
}

function tick() {
  if (state) {
    if (Date.now() >= state.endsAt) finish();
    else update();
  } else if (doneUntil && Date.now() > doneUntil) {
    doneUntil = 0;
    render();
  }
}

function finish() {
  // Nur piepen, wenn das Ende "live" miterlebt wird – nicht verspätet nach
  // der Rückkehr aus dem Hintergrund.
  const late = Date.now() - state.endsAt;
  const live = document.visibilityState === 'visible' && late < 1500;
  state = null;
  persist();
  doneUntil = Date.now() + (live ? 5000 : 2500);
  if (live) {
    if (repo.settingsSync().restSound) beep();
    navigator.vibrate?.([200, 100, 200]);
  }
  render();
}

function render() {
  if (!el) return;
  clear(el);
  refs = null;
  if (state) {
    const time = h('span', { class: 'rest-time' });
    const bar = h('div', { class: 'rest-bar' });
    el.append(
      h('div', { class: 'rest-timer', role: 'timer' },
        h('div', { class: 'rest-track' }, bar),
        h('button', { class: 'rest-btn', 'aria-label': '15 Sekunden weniger', onclick: () => adjust(-15) }, '−15'),
        h('div', { class: 'rest-center' }, icon('timer', { size: 20 }), time),
        h('button', { class: 'rest-btn', 'aria-label': '15 Sekunden mehr', onclick: () => adjust(15) }, '+15'),
        h('button', { class: 'rest-btn skip', onclick: stop }, 'Weiter'),
      ),
    );
    refs = { time, bar };
    update();
    ensureInterval(true);
  } else if (doneUntil) {
    el.append(h('div', { class: 'rest-timer done', onclick: () => { doneUntil = 0; render(); } },
      icon('check'), h('span', null, 'Pause vorbei – nächster Satz!')));
    ensureInterval(true);
  } else {
    ensureInterval(false);
  }
  el.hidden = !state && !doneUntil;
}

function update() {
  if (!refs || !state) return;
  const rem = remaining();
  refs.time.textContent = fmtClock(Math.ceil(rem));
  refs.bar.style.transform = `scaleX(${Math.max(0, Math.min(1, rem / state.duration))})`;
}

// --- Ton ---------------------------------------------------------------------

function unlockAudio() {
  if (!repo.settingsSync().restSound) return;
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      // Stiller Puffer innerhalb der Geste schaltet Audio auf iOS frei.
      const src = audioCtx.createBufferSource();
      src.buffer = audioCtx.createBuffer(1, 1, 22050);
      src.connect(audioCtx.destination);
      src.start(0);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* Audio nicht verfügbar */ }
}

function beep() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = i === 2 ? 1175 : 880;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = t0 + i * 0.28;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t);
      o.stop(t + 0.25);
    }
  } catch { /* ignorieren */ }
}
