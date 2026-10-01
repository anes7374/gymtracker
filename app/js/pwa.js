// Service Worker registrieren und Updates anbieten.
//
// Ablauf nach einem neuen Deploy: Der Browser lädt die neue sw.js (sie hat
// eine neue Versionsnummer), installiert sie im Hintergrund und lässt sie
// "warten". Wir zeigen dann "Update verfügbar – Neu laden". Ein Tipp darauf
// aktiviert die neue Version (SKIP_WAITING) und lädt die Seite neu.

import { h, clear, toast } from './ui/dom.js';
import { icon } from './ui/icons.js';
import * as active from './active.js';

let registration = null;
let reloading = false;
let updateRequested = false;

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  // Ohne bisherigen Controller ist der erste Controllerwechsel nur die
  // Erstinstallation – dafür nicht neu laden.
  const hadController = !!navigator.serviceWorker.controller;
  try {
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
  } catch (err) {
    console.warn('Service Worker konnte nicht registriert werden', err);
    return null;
  }

  if (registration.waiting && navigator.serviceWorker.controller) showUpdateBanner();
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      // "installed" + vorhandener Controller = Update (nicht Erstinstallation)
      if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || (!hadController && !updateRequested)) return;
    reloading = true;
    location.reload();
  });

  // iOS prüft bei Homescreen-Apps selten von selbst – also beim Zurückkehren
  // in die App und stündlich nachsehen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
  setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
  return registration;
}

/** Manuelle Prüfung (Einstellungen). */
export async function checkForUpdate() {
  if (!registration) { toast('Service Worker nicht aktiv (lokale Vorschau?)'); return; }
  try {
    await registration.update();
  } catch {
    toast('Keine Verbindung – Update-Prüfung nicht möglich.');
    return;
  }
  // Kurz warten, ob eine neue Version installiert wird.
  setTimeout(() => {
    if (registration.waiting || registration.installing) showUpdateBanner();
    else toast('Du hast bereits die neueste Version.');
  }, 1500);
}

function showUpdateBanner() {
  const root = document.getElementById('update-root');
  if (!root || root.childElementCount) return;
  root.append(h('div', { class: 'update-banner', role: 'alert' },
    icon('import'),
    h('span', null, 'Update verfügbar'),
    h('button', { class: 'btn primary small', onclick: applyUpdate }, 'Neu laden'),
    h('button', { class: 'icon-btn', 'aria-label': 'Später', onclick: () => clear(root) }, icon('close'))));
}

async function applyUpdate() {
  updateRequested = true;
  await active.flush().catch(() => {});
  const waiting = registration?.waiting;
  if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
  else location.reload();
}

/** Speicher als "dauerhaft" anfragen (Schutz vor automatischem Löschen). */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
