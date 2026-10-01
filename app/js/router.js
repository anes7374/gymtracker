// Hash-Router (funktioniert auf GitHub Pages ohne Server-Konfiguration)
// und Rendering der App-Hülle (Kopfzeile, Inhalt, Tab-Leiste).

import { h, clear, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';

const routes = [];
const scrollPos = new Map();
const stack = [];          // besuchte Pfade (für "Zurück")
let current = null;        // aktuelle View (für cleanup)
let renderToken = 0;
const listeners = new Set();

/**
 * Eine View-Funktion liefert ein Objekt:
 * { title, body, back?: Pfad|true, onBack?, actions?: [Elemente], tab?, hideTabbar?, cleanup? }
 * oder null, wenn sie selbst weitergeleitet hat.
 */
export function route(pattern, view) {
  routes.push([pattern, view]);
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

export function navigate(path, { replace = false } = {}) {
  const hash = '#' + path;
  if (location.hash === hash) { refresh(); return; }
  if (replace) {
    stack.pop();
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

/** Zurück in der App-Historie, sonst zum angegebenen Elternpfad. */
export function back(fallback = '/') {
  if (stack.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

export function onRoute(fn) {
  listeners.add(fn);
}

export function refresh({ keepScroll = true } = {}) {
  return render({ keepScroll });
}

export function start() {
  addEventListener('hashchange', () => render());
  render();
}

async function render({ keepScroll = false } = {}) {
  const path = currentPath();
  const main = document.getElementById('view');
  const token = ++renderToken;

  // Navigationsstapel pflegen (Zurück erkennen)
  let isBack = false;
  if (!keepScroll) {
    if (stack.length > 1 && stack[stack.length - 2] === path) { stack.pop(); isBack = true; }
    else if (stack[stack.length - 1] !== path) stack.push(path);
    if (stack.length > 50) stack.shift();
  }

  let match = null;
  for (const [pattern, view] of routes) {
    const m = pattern.exec(path);
    if (m) { match = [view, m.slice(1).map(decodeURIComponent)]; break; }
  }
  if (!match) { navigate('/', { replace: true }); return; }

  const prevScroll = main.scrollTop;
  if (current?.path) scrollPos.set(current.path, prevScroll);

  let view;
  try {
    view = await match[0](...match[1]);
  } catch (err) {
    console.error(err);
    toast('Fehler: ' + (err.message || err), { kind: 'error' });
    return;
  }
  if (token !== renderToken || !view) return; // inzwischen weiter navigiert

  current?.cleanup?.();
  current = { ...view, path };

  // Kopfzeile
  const left = document.querySelector('.topbar-left');
  const right = document.querySelector('.topbar-right');
  clear(left); clear(right);
  if (view.back) {
    left.append(h('button', {
      class: 'icon-btn back', 'aria-label': 'Zurück',
      onclick: () => (view.onBack ? view.onBack() : back(typeof view.back === 'string' ? view.back : '/')),
    }, icon('back'), view.backLabel ? h('span', null, view.backLabel) : null));
  }
  for (const a of view.actions || []) right.append(a);
  document.querySelector('.topbar-title').textContent = view.title || '';
  document.title = view.title ? `${view.title} – GymTracker` : 'GymTracker';

  // Inhalt
  clear(main);
  main.append(view.body);
  main.scrollTop = keepScroll ? prevScroll : (isBack ? (scrollPos.get(path) || 0) : 0);

  // Tab-Leiste
  document.getElementById('tabbar').hidden = !!view.hideTabbar;
  document.body.classList.toggle('no-tabbar', !!view.hideTabbar);
  for (const t of document.querySelectorAll('.tab')) {
    t.classList.toggle('active', t.dataset.tab === view.tab);
  }
  for (const fn of listeners) fn(path, view);
}

export function buildTabbar() {
  const tabs = [
    ['train', '/', 'dumbbell', 'Training'],
    ['history', '/history', 'history', 'Verlauf'],
    ['progress', '/progress', 'chart', 'Fortschritt'],
    ['exercises', '/exercises', 'list', 'Übungen'],
    ['settings', '/settings', 'sliders', 'Mehr'],
  ];
  const nav = document.getElementById('tabbar');
  clear(nav);
  for (const [id, path, ic, label] of tabs) {
    nav.append(h('a', {
      class: 'tab', href: '#' + path, dataset: { tab: id },
      onclick: (e) => {
        // Tab-Wechsel setzt den Zurück-Stapel zurück
        e.preventDefault();
        stack.length = 0;
        navigate(path, { replace: false });
      },
    }, icon(ic), h('span', null, label)));
  }
}
