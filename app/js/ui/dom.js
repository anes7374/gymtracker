// Kleine DOM-Helfer. Inhalte werden immer als Text gesetzt (kein innerHTML
// mit Nutzerdaten) – importierte Namen können also nichts einschleusen.

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'readOnly', 'multiple', 'hidden']);

/**
 * h('button', { class: 'btn', onclick: fn }, 'Text', kindElement, [weitere])
 * null/false/undefined-Kinder werden ignoriert.
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

let toastTimer = null;
/** Kurze Meldung am unteren Rand. */
export function toast(message, { duration = 2600, kind = '' } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  clear(root);
  const t = h('div', { class: 'toast ' + kind, role: 'status' }, message);
  root.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}

/** Markiert alle Zeichen beim Fokussieren (schnelles Überschreiben von Zahlen). */
export function selectOnFocus(input) {
  input.addEventListener('focus', () => {
    setTimeout(() => {
      try { input.setSelectionRange(0, input.value.length); } catch { /* nicht unterstützt */ }
    }, 0);
  });
  return input;
}
