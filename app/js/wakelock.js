// Bildschirm während des Trainings anlassen (Screen Wake Lock API).
// iOS gibt die Sperre beim App-Wechsel frei – beim Zurückkommen wird sie erneuert.

let sentinel = null;
let wanted = false;

async function acquire() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || sentinel) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null; // nicht erlaubt / nicht unterstützt – kein Problem
  }
}

function release() {
  sentinel?.release().catch(() => {});
  sentinel = null;
}

/** on = true: Bildschirm anlassen, bis keepAwake(false) kommt. */
export function keepAwake(on) {
  wanted = !!on;
  if (wanted) acquire(); else release();
}

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible') acquire();
  });
}
