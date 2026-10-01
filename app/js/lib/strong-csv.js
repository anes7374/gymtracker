// Import der CSV-Exportdatei der App "Strong".
// Robust gegenüber verschiedenen Strong-Versionen: Spalten werden über ihre
// Namen erkannt (nicht über Positionen), Trennzeichen (, ; Tab) automatisch
// bestimmt, lbs werden in kg umgerechnet, Pausentimer-Zeilen übersprungen.

import { parseNumber, round } from './format.js';
import { normalizeExerciseName, STRONG_NAME_MAP } from './exercises-data.js';
import { uid } from './uid.js';

const LB_IN_KG = 0.45359237;

/** Ermittelt das Trennzeichen anhand der Kopfzeile (außerhalb von Anführungszeichen). */
export function detectDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === '\n' || c === '\r')) break;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  let best = ',';
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d;
  return best;
}

/**
 * CSV-Parser nach RFC 4180: Felder in Anführungszeichen dürfen Trennzeichen,
 * Zeilenumbrüche und verdoppelte Anführungszeichen ("") enthalten.
 * Leere Zeilen werden entfernt.
 */
export function parseCSV(text, delimiter = detectDelimiter(text)) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (c === delimiter) {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

function normHeader(h) {
  return String(h || '').replace(/^﻿/, '').replace(/"/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Reihenfolge ist wichtig: spezifischere Spalten (z. B. "Weight Unit") zuerst.
const COLUMN_RULES = [
  ['workoutNo', (h) => /^workout ?(#|nr\.?|no\.?|number|id)$/.test(h)],
  ['date', (h) => /^(date|datum)\b/.test(h)],
  ['workoutName', (h) => /^(workout name|workout|training|trainingsname|routine)$/.test(h)],
  ['workoutDuration', (h) => /^(workout )?(duration|dauer)\b/.test(h)],
  ['exerciseName', (h) => /^(exercise name|exercise|übung|uebung|übungsname)$/.test(h)],
  ['setOrder', (h) => /^(set order|set|set #|set number|satz|satznummer)$/.test(h)],
  ['weightUnit', (h) => /^(weight unit|gewichtseinheit|einheit)$/.test(h)],
  ['weight', (h) => /^(weight|gewicht)\b/.test(h)],
  ['reps', (h) => /^(reps|repetitions|wiederholungen|wdh)\b/.test(h)],
  ['rpe', (h) => /^rpe\b/.test(h)],
  ['distanceUnit', (h) => /^(distance unit|distanzeinheit)$/.test(h)],
  ['distance', (h) => /^(distance|distanz|strecke)\b/.test(h)],
  ['seconds', (h) => /^(seconds|sekunden|time|zeit)\b/.test(h)],
  ['workoutNotes', (h) => /^(workout notes?|trainingsnotiz(en)?)$/.test(h)],
  ['notes', (h) => /^(notes?|notiz(en)?)$/.test(h)],
];

/** Ordnet Spaltennamen den bekannten Feldern zu: { date: 1, exerciseName: 4, ... } */
export function mapColumns(headerRow) {
  const header = headerRow.map(normHeader);
  const used = new Set();
  const cols = {};
  for (const [key, test] of COLUMN_RULES) {
    const idx = header.findIndex((h, i) => !used.has(i) && test(h));
    if (idx !== -1) { cols[key] = idx; used.add(idx); }
  }
  return { cols, header };
}

function unitHint(header) {
  const m = /\(([^)]+)\)/.exec(header || '');
  return m ? m[1].trim().toLowerCase() : '';
}

const isLbs = (u) => /^(lb|lbs|pound|pounds|pfund)$/.test(String(u || '').trim().toLowerCase());

function distanceFactor(u) {
  u = String(u || '').trim().toLowerCase();
  if (/^(km|kilometers?|kilometres?|kilometer)$/.test(u)) return 1000;
  if (/^(mi|mile|miles|meilen?)$/.test(u)) return 1609.344;
  if (/^(ft|feet|foot)$/.test(u)) return 0.3048;
  if (/^(yd|yards?)$/.test(u)) return 0.9144;
  return 1; // Meter
}

/**
 * Dauer in Sekunden aus "1h 5m", "45m", "1 h 5 min 3 s", "1:05:00" oder Zahlen.
 * `hint` ist der Spaltenname, z. B. "duration (sec)".
 */
export function parseDurationSeconds(value, hint = '') {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s) return null;
  if (/^\d+([.,]\d+)?$/.test(s)) {
    const n = parseNumber(s);
    if (/sec|sek|\(s\)/.test(hint)) return n;
    if (/min/.test(hint)) return n * 60;
    if (/hour|stund|\(h\)/.test(hint)) return n * 3600;
    return n >= 600 ? n : n * 60; // ohne Einheit: große Werte = Sekunden, kleine = Minuten
  }
  let m = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (m) {
    return m[3] != null ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) : (+m[1]) * 3600 + (+m[2]) * 60;
  }
  const re = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|stunden?|std|h|minutes?|minuten?|mins?|m|seconds?|sekunden?|secs?|sek|s)\b/g;
  let total = 0, found = false;
  while ((m = re.exec(s))) {
    const n = parseNumber(m[1]);
    const u = m[2];
    found = true;
    if (/^(h|hrs?|hours?|std|stunden?)$/.test(u)) total += n * 3600;
    else if (/^(m|mins?|minutes?|minuten?)$/.test(u)) total += n * 60;
    else total += n;
  }
  return found ? total : null;
}

/** Datum/Uhrzeit (lokal) aus "2024-01-15 08:30:00", "15.01.2024 08:30", "1/15/2024 8:30 AM" usw. */
export function parseDateTime(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?(.*)$/.exec(s);
  if (m) {
    if (/z|[+-]\d{2}:?\d{2}/i.test(m[7] || '')) {
      const t = Date.parse(s.replace(' ', 'T'));
      return Number.isNaN(t) ? null : t;
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return new Date(y, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let hour = +(m[4] || 0);
    const ampm = (m[7] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return new Date(y, +m[1] - 1, +m[2], hour, +(m[5] || 0), +(m[6] || 0)).getTime();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/** Satzart aus der Spalte "Set Order": Zahl, W (Aufwärmen), D (Drop), F (Versagen), Pausentimer. */
export function parseSetOrder(value) {
  const s = String(value ?? '').trim();
  if (!s || /^\d+$/.test(s)) return { type: 'normal' };
  const u = s.toUpperCase();
  if (u === 'W' || /warm/i.test(s)) return { type: 'warmup' };
  if (u === 'D' || /drop/i.test(s)) return { type: 'drop' };
  if (u === 'F' || /fail/i.test(s)) return { type: 'failure' };
  if (/rest|pause|timer/i.test(s)) return { skip: 'rest' };
  return { skip: 'other' };
}

/**
 * Liest eine Strong-CSV ein. Wirft einen Error mit deutscher Meldung,
 * wenn die Datei nicht als Strong-Export erkennbar ist.
 *
 * Rückgabe: {
 *   workouts: [{ name, startedAt, endedAt, notes, exercises: [{ name, notes, sets: [...] }] }],
 *   exercises: [{ name, sets }],   // erkannte Übungsnamen mit Satzanzahl
 *   stats: { rows, sets, skippedRest, skippedEmpty, skippedInvalid, convertedLbs, from, to },
 *   columns: { feldname: "Originalspaltenname" }
 * }
 */
export function parseStrongCSV(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Die Datei ist leer.');
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('Die Datei enthält keine Datenzeilen.');

  const { cols, header } = mapColumns(rows[0]);
  if (cols.date == null || cols.exerciseName == null) {
    throw new Error(
      'Das sieht nicht wie ein Strong-Export aus: Die Spalten „Date“ und „Exercise Name“ wurden nicht gefunden.\n' +
      'Gefundene Spalten: ' + rows[0].map((h) => h.trim()).join(', '),
    );
  }
  if (cols.weight == null && cols.reps == null) {
    throw new Error('Weder eine Gewichts- noch eine Wiederholungsspalte gefunden.');
  }

  const weightHeaderUnit = cols.weight != null ? unitHint(header[cols.weight]) : '';
  const distanceHeaderUnit = cols.distance != null ? unitHint(header[cols.distance]) : '';
  const durationHint = cols.workoutDuration != null ? header[cols.workoutDuration] : '';

  const stats = { rows: rows.length - 1, sets: 0, skippedRest: 0, skippedEmpty: 0, skippedInvalid: 0, convertedLbs: false, from: null, to: null };
  const byKey = new Map();
  const exerciseCounts = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (k) => (cols[k] == null ? '' : String(row[cols[k]] ?? '').trim());

    const order = parseSetOrder(get('setOrder'));
    if (order.skip === 'rest') { stats.skippedRest++; continue; }
    const exName = get('exerciseName');
    if (!exName) { stats.skippedEmpty++; continue; }
    if (order.skip) { stats.skippedInvalid++; continue; }
    const startedAt = parseDateTime(get('date'));
    if (startedAt == null) { stats.skippedInvalid++; continue; }

    let weight = parseNumber(get('weight'));
    const unit = get('weightUnit') || weightHeaderUnit;
    if (weight != null && isLbs(unit)) { weight = round(weight * LB_IN_KG, 2); stats.convertedLbs = true; }
    if (weight != null && weight <= 0) weight = null;
    let reps = parseNumber(get('reps'));
    reps = reps != null && reps > 0 ? Math.round(reps) : null;
    let distance = parseNumber(get('distance'));
    if (distance != null) distance = distance > 0 ? round(distance * distanceFactor(get('distanceUnit') || distanceHeaderUnit), 2) : null;
    let seconds = parseNumber(get('seconds'));
    if (seconds != null && !(seconds > 0)) seconds = null;
    const rpe = parseNumber(get('rpe'));

    if (reps == null && distance == null && seconds == null) { stats.skippedEmpty++; continue; }

    const workoutName = get('workoutName') || 'Training';
    const key = get('workoutNo') ? 'n:' + get('workoutNo') : 'd:' + get('date') + '|' + workoutName;
    let w = byKey.get(key);
    if (!w) {
      w = { name: workoutName, startedAt, endedAt: null, notes: '', exercises: [], _ex: new Map() };
      byKey.set(key, w);
    }
    if (w.endedAt == null) {
      const d = parseDurationSeconds(get('workoutDuration'), durationHint);
      if (d > 0) w.endedAt = w.startedAt + Math.round(d * 1000);
    }
    if (!w.notes && get('workoutNotes')) w.notes = get('workoutNotes');

    let entry = w._ex.get(exName);
    if (!entry) {
      entry = { name: exName, notes: '', sets: [] };
      w._ex.set(exName, entry);
      w.exercises.push(entry);
    }
    if (!entry.notes && get('notes')) entry.notes = get('notes');

    const set = { weight, reps };
    if (order.type !== 'normal') set.type = order.type;
    if (distance != null) set.distance = distance;
    if (seconds != null) set.seconds = seconds;
    if (rpe != null && rpe > 0) set.rpe = rpe;
    entry.sets.push(set);

    stats.sets++;
    exerciseCounts.set(exName, (exerciseCounts.get(exName) || 0) + 1);
    if (stats.from == null || startedAt < stats.from) stats.from = startedAt;
    if (stats.to == null || startedAt > stats.to) stats.to = startedAt;
  }

  const workouts = [...byKey.values()]
    .filter((w) => w.exercises.length)
    .map(({ _ex, ...w }) => w)
    .sort((a, b) => a.startedAt - b.startedAt);

  const columns = {};
  for (const [k, i] of Object.entries(cols)) columns[k] = rows[0][i].replace(/^﻿/, '').trim();

  return {
    workouts,
    exercises: [...exerciseCounts].map(([name, sets]) => ({ name, sets })).sort((a, b) => b.sets - a.sets),
    stats,
    columns,
  };
}

/**
 * Plant den Import gegen die vorhandenen Daten: ordnet Übungsnamen zu
 * (gleicher Name → vorhandene Übung, bekannter Strong-Name → eingebaute Übung,
 * sonst neue eigene Übung) und überspringt bereits importierte Trainings
 * (gleiche Startzeit ±1 Minute).
 */
export function planStrongImport(parsed, existing, { makeId = uid, now = Date.now() } = {}) {
  const exercises = existing.exercises || [];
  const byName = new Map(exercises.map((e) => [normalizeExerciseName(e.name), e]));
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const mapping = [];
  const idForName = new Map();
  const newExercises = [];

  for (const { name, sets } of parsed.exercises) {
    const n = normalizeExerciseName(name);
    let target = byName.get(n);
    let status = 'existing';
    if (!target) {
      const mappedId = STRONG_NAME_MAP.get(n);
      target = mappedId ? byId.get(mappedId) : null;
      status = 'mapped';
    }
    if (!target) {
      target = { id: makeId(), name: name.trim(), category: 'Sonstige', bodyweight: false, custom: true, createdAt: now };
      newExercises.push(target);
      byName.set(n, target);
      byId.set(target.id, target);
      status = 'new';
    }
    idForName.set(name, target.id);
    mapping.push({ from: name, to: target.name, id: target.id, status, sets });
  }

  const minuteKeys = new Set((existing.workouts || []).map((w) => Math.floor(w.startedAt / 60000)));
  const isDuplicate = (t) => {
    const k = Math.floor(t / 60000);
    return minuteKeys.has(k) || minuteKeys.has(k - 1) || minuteKeys.has(k + 1);
  };

  const workouts = [];
  let duplicates = 0;
  let setCount = 0;
  for (const pw of parsed.workouts) {
    if (isDuplicate(pw.startedAt)) { duplicates++; continue; }
    const w = {
      id: makeId(),
      name: pw.name,
      templateId: null,
      startedAt: pw.startedAt,
      endedAt: pw.endedAt ?? null,
      notes: pw.notes || '',
      source: 'strong',
      exercises: pw.exercises.map((e) => ({
        exerciseId: idForName.get(e.name),
        notes: e.notes || '',
        sets: e.sets.map((s) => ({ ...s })),
      })),
    };
    for (const e of w.exercises) setCount += e.sets.length;
    workouts.push(w);
  }

  return { workouts, newExercises, mapping, duplicates, setCount };
}
