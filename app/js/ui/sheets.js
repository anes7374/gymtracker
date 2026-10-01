// Bottom-Sheets: Dialoge, Auswahlmenüs, Bestätigungen.

import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Öffnet ein Sheet von unten. Rückgabe: { close(result), el, body }.
 * `full`: nahezu volle Höhe (z. B. Übungsauswahl).
 */
export function openSheet({ title, body, footer, full = false, onClose, headerAction }) {
  const root = document.getElementById('sheet-root');
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 260);
    onClose?.(result);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  const bodyEl = h('div', { class: 'sheet-body' }, body);
  const sheet = h('div', { class: 'sheet' + (full ? ' full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grabber' }),
    h('div', { class: 'sheet-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Schließen', onclick: () => close() }, icon('close')),
      h('h2', null, title),
      headerAction || h('span', { class: 'icon-btn-spacer' }),
    ),
    bodyEl,
    footer ? h('div', { class: 'sheet-foot' }, footer) : null,
  );
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: () => close() });
  const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
  root.append(wrap);
  document.addEventListener('keydown', onKey);
  // Erzwingt Layout, damit die Einblend-Animation greift.
  void wrap.offsetHeight;
  wrap.classList.add('open');
  return { close, el: sheet, body: bodyEl };
}

/** Auswahlmenü. items: [{ label, value, icon?, danger? }] -> Promise<value|null> */
export function actionSheet({ title, items, message }) {
  return new Promise((resolve) => {
    let chosen = null;
    const s = openSheet({
      title,
      body: h('div', { class: 'action-list' },
        message ? h('p', { class: 'sheet-message' }, message) : null,
        items.filter(Boolean).map((it) =>
          h('button', {
            class: 'action-item' + (it.danger ? ' danger' : ''),
            onclick: () => { chosen = it.value; s.close(); },
          }, it.icon ? icon(it.icon) : null, h('span', null, it.label))),
      ),
      onClose: () => resolve(chosen),
    });
  });
}

/** Ja/Nein-Abfrage -> Promise<boolean> */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let ok = false;
    const s = openSheet({
      title,
      body: message ? h('p', { class: 'sheet-message' }, message) : null,
      footer: [
        h('button', { class: 'btn secondary', onclick: () => s.close() }, cancelLabel),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { ok = true; s.close(); } }, confirmLabel),
      ],
      onClose: () => resolve(ok),
    });
  });
}

/** Hinweis mit nur einem Knopf -> Promise<void> */
export function alertDialog({ title, message, confirmLabel = 'OK' }) {
  return new Promise((resolve) => {
    const s = openSheet({
      title,
      body: message ? h('p', { class: 'sheet-message' }, message) : null,
      footer: [h('button', { class: 'btn primary', onclick: () => s.close() }, confirmLabel)],
      onClose: () => resolve(),
    });
  });
}

/** Texteingabe -> Promise<string|null> */
export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Speichern' }) {
  return new Promise((resolve) => {
    let result = null;
    const input = h('input', { class: 'input', type: 'text', value, placeholder, enterkeyhint: 'done', autocomplete: 'off' });
    const submit = () => {
      if (!input.value.trim()) { input.focus(); return; }
      result = input.value.trim();
      s.close();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const s = openSheet({
      title,
      body: h('label', { class: 'field' }, label ? h('span', { class: 'field-label' }, label) : null, input),
      footer: [
        h('button', { class: 'btn secondary', onclick: () => s.close() }, 'Abbrechen'),
        h('button', { class: 'btn primary', onclick: submit }, confirmLabel),
      ],
      onClose: () => resolve(result),
    });
    input.focus();
  });
}
