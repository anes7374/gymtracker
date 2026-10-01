// Dunkel (Standard) / Hell / System.

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
let currentSetting = 'dark';

export function applyTheme(setting = 'dark') {
  currentSetting = setting;
  const resolved = setting === 'system' ? (media?.matches ? 'light' : 'dark') : setting;
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#f3f4f6' : '#0e1013');
  // Nur als Komfort, damit beim nächsten Start kein Farbblitz entsteht.
  try { localStorage.setItem('gt-theme', setting); } catch { /* egal */ }
}

media?.addEventListener?.('change', () => {
  if (currentSetting === 'system') applyTheme('system');
});
