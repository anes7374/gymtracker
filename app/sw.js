// Service Worker: hält alle App-Dateien offline vor.
//
// VERSION wird beim Deploy (GitHub Actions) automatisch durch Datum + Commit
// ersetzt. Dadurch ändert sich diese Datei bei jedem Deploy, der Browser
// erkennt die neue Version und die App zeigt "Update verfügbar".

const VERSION = '__BUILD__';
// Lokal (nicht ersetzter Platzhalter): immer frisch aus dem Netz laden.
// Bewusst ohne den Platzhalter-Text, weil der Build ihn überall ersetzt.
const DEV = VERSION.startsWith('__');
const CACHE = 'gymtracker-' + VERSION;

// Jede Datei der App muss hier stehen (wird per Test geprüft: npm test).
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/router.js',
  './js/db.js',
  './js/repo.js',
  './js/active.js',
  './js/timer.js',
  './js/theme.js',
  './js/pwa.js',
  './js/version.js',
  './js/wakelock.js',
  './js/lib/format.js',
  './js/lib/calc.js',
  './js/lib/strong-csv.js',
  './js/lib/backup.js',
  './js/lib/exercises-data.js',
  './js/lib/uid.js',
  './js/lib/stats.js',
  './js/lib/split.js',
  './js/lib/templates.js',
  './js/lib/body.js',
  './js/lib/summary.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/sheets.js',
  './js/ui/picker.js',
  './js/ui/chart.js',
  './js/ui/exercise-settings.js',
  './js/views/home.js',
  './js/views/workout.js',
  './js/views/template.js',
  './js/views/history.js',
  './js/views/exercises.js',
  './js/views/settings.js',
  './js/views/progress.js',
  './js/views/split.js',
  './js/views/summary.js',
  './js/views/body.js',
  './js/views/year.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' umgeht den HTTP-Cache, damit wirklich die neuen Dateien kommen.
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })));
    // Erstinstallation sofort aktivieren; Updates warten auf "Neu laden".
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('gymtracker-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (DEV) {
    event.respondWith(fetch(req).catch(() => fromCache(req)));
    return;
  }
  event.respondWith(fromCache(req).then((res) => res || fetch(req)));
});

async function fromCache(req) {
  // Nur aus dem eigenen Cache lesen – sonst könnte ein alter Service Worker
  // schon Dateien einer gerade installierten neuen Version ausliefern.
  const cache = await caches.open(CACHE);
  // Navigationen (Start der App, Neuladen) bekommen immer die index.html.
  if (req.mode === 'navigate') return cache.match('./index.html', { ignoreSearch: true });
  return cache.match(req, { ignoreSearch: true });
}
