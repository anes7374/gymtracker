// Zahlen- und Datumsformatierung (deutsch). Rein, ohne DOM – auch in Node testbar.

/**
 * Wandelt eine Benutzereingabe in eine Zahl um. Akzeptiert Komma und Punkt
 * als Dezimaltrenner ("80,5", "80.5") sowie Tausendertrennzeichen
 * ("1.234,5", "1,234.5"). Gibt null zurück, wenn keine gültige Zahl vorliegt.
 */
export function parseNumber(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input).trim().replace(/[\s ']/g, '');
  s = s.replace(/[−–]/g, '-'); // typografisches Minus / Gedankenstrich
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    // Das zuletzt stehende Zeichen ist der Dezimaltrenner.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma !== -1) {
    if (s.indexOf(',') !== lastComma) return null; // "1,2,3"
    s = s.replace(',', '.');
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Rundet auf n Nachkommastellen (gegen Fließkomma-Artefakte wie 80.49999). */
export function round(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return n;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

const nfCache = new Map();
function nf(decimals, grouping) {
  const key = decimals + '|' + grouping;
  if (!nfCache.has(key)) {
    nfCache.set(key, new Intl.NumberFormat('de-DE', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
      useGrouping: grouping,
    }));
  }
  return nfCache.get(key);
}

/** 1234.5 -> "1.234,5"; null -> "" */
export function fmtNum(n, decimals = 2, grouping = true) {
  if (n == null || !Number.isFinite(n)) return '';
  return nf(decimals, grouping).format(n).replace('-', '−'); // echtes Minuszeichen
}

/** Anzahl mit Einzahl/Mehrzahl: count(1, 'Training', 'Trainings') -> "1 Training" */
export function count(n, one, many) {
  return `${fmtNum(n, 0)} ${n === 1 ? one : many}`;
}

/** Gewicht für Eingabefelder: ohne Tausenderpunkt, z. B. "102,5". */
export function fmtWeightInput(n) {
  return fmtNum(n, 2, false);
}

/** "80 kg × 8" bzw. "× 12" bei Körpergewicht. */
export function fmtSet(set, { unit = true } = {}) {
  if (!set) return '';
  const w = set.weight;
  const r = set.reps;
  const parts = [];
  if (w != null && w !== 0) parts.push(fmtNum(w) + (unit ? ' kg' : ''));
  if (r != null) parts.push((parts.length ? '× ' : '') + fmtNum(r, 0) + (parts.length ? '' : ' Wdh.'));
  if (!parts.length) {
    if (set.distance) return fmtDistance(set.distance);
    if (set.seconds) return fmtClock(set.seconds);
    return '–';
  }
  return parts.join(' ');
}

export function fmtDistance(m) {
  if (m == null) return '';
  return m >= 1000 ? fmtNum(m / 1000, 2) + ' km' : fmtNum(m, 0) + ' m';
}

/** Sekunden -> "1:05" bzw. "1:02:03" */
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Millisekunden -> "1 h 05 min" / "45 min" */
export function fmtDuration(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '–';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

const dateFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const dateShortFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTinyFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('de-DE', { month: 'short' });

export const fmtDate = (ts) => dateFmt.format(ts);           // "Do., 1. Okt. 2026"
export const fmtDateShort = (ts) => dateShortFmt.format(ts); // "01.10.2026"
export const fmtDateTiny = (ts) => dateTinyFmt.format(ts);   // "01.10."
export const fmtTime = (ts) => timeFmt.format(ts);           // "18:30"
export const fmtMonth = (ts) => monthFmt.format(ts);         // "Oktober 2026"
export const fmtMonthShort = (ts) => monthShortFmt.format(ts).replace('.', ''); // "Okt"

/** "heute", "gestern", "vor 3 Tagen", sonst Datum. */
export function fmtRelativeDay(ts, now = Date.now()) {
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86400000);
  if (days === 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days > 1 && days < 7) return `vor ${days} Tagen`;
  if (days >= 7 && days < 14) return 'vor 1 Woche';
  if (days >= 14 && days < 31) return `vor ${Math.floor(days / 7)} Wochen`;
  return fmtDateShort(ts);
}

/** Zeitstempel -> Wert für <input type="datetime-local"> (lokale Zeit). */
export function toDateTimeLocal(ts) {
  const d = new Date(ts);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

/** Für Suche: Kleinbuchstaben, ohne Umlaut-Punkte/Akzente. */
export function normalizeSearch(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}
