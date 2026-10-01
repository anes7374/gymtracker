// Einstiegspunkt: Datenbank öffnen, Routen registrieren, Service Worker starten.

import * as repo from './repo.js';
import * as active from './active.js';
import * as timer from './timer.js';
import { route, start, buildTabbar, onRoute, navigate, currentPath } from './router.js';
import { applyTheme } from './theme.js';
import { registerSW, requestPersistence } from './pwa.js';
import { h, clear, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { fmtClock } from './lib/format.js';
import { homeView } from './views/home.js';
import { activeWorkoutView, editWorkoutView } from './views/workout.js';
import { templateView } from './views/template.js';
import { historyView, workoutDetailView } from './views/history.js';
import { exercisesView, exerciseDetailView } from './views/exercises.js';
import { settingsView } from './views/settings.js';

route(/^\/$/, homeView);
route(/^\/workout$/, activeWorkoutView);
route(/^\/template\/([\w-]+)$/, templateView);
route(/^\/history$/, historyView);
route(/^\/history\/([\w-]+)$/, workoutDetailView);
route(/^\/history\/([\w-]+)\/edit$/, editWorkoutView);
route(/^\/exercises$/, exercisesView);
route(/^\/exercises\/([\w-]+)$/, exerciseDetailView);
route(/^\/settings$/, settingsView);

async function boot() {
  try {
    await repo.init();
  } catch (err) {
    console.error(err);
    const main = document.getElementById('view');
    clear(main).append(h('div', { class: 'empty' },
      h('p', null, 'Die Datenbank konnte nicht geöffnet werden.'),
      h('p', { class: 'muted small' }, String(err.message || err)),
      h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Neu laden')));
    return;
  }
  applyTheme((await repo.settings()).theme);
  await active.load();
  await timer.init(document.getElementById('rest-root'));
  buildTabbar();

  onRoute(() => updateActiveBanner());
  active.onChange(() => updateActiveBanner());
  start();

  requestPersistence();
  registerSW();
}

// Hinweis-Leiste "Training läuft", solange man woanders in der App ist.
let bannerTimer = null;
function updateActiveBanner() {
  const root = document.getElementById('active-root');
  const w = active.get();
  // Auf der Startseite zeigt eine Karte das laufende Training bereits an.
  const show = !!w && !['/workout', '/'].includes(currentPath());
  clearInterval(bannerTimer);
  clear(root);
  root.hidden = !show;
  if (!show) return;
  const time = h('span', { class: 'ab-time' });
  const tick = () => { time.textContent = fmtClock((Date.now() - w.startedAt) / 1000); };
  tick();
  bannerTimer = setInterval(tick, 1000);
  root.append(h('button', { class: 'active-banner', onclick: () => navigate('/workout') },
    h('span', { class: 'ab-dot' }),
    h('span', { class: 'ab-text' }, h('strong', null, w.name), ' läuft'),
    time,
    icon('chevron', { size: 20 })));
}

// iOS: Nach dem Schließen der Tastatur bleibt die Seite manchmal verschoben.
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const a = document.activeElement;
    if (!a || !['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) window.scrollTo(0, 0);
  }, 60);
});

// Sheets über die Bildschirmtastatur schieben (Höhe der Tastatur als CSS-Variable).
if (window.visualViewport) {
  const vv = window.visualViewport;
  const updateKb = () => {
    const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb', kb + 'px');
  };
  vv.addEventListener('resize', updateKb);
  vv.addEventListener('scroll', updateKb);
}

addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Fehler: ' + (e.reason?.message || e.reason), { kind: 'error' });
});

boot();
