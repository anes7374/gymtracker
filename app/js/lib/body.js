// Körpergewicht & Körpermaße. Rein, ohne DOM – auch in Node testbar.

export const MEASURES = [
  { key: 'bodyweight', label: 'Körpergewicht', short: 'Gewicht', unit: 'kg', decimals: 1 },
  { key: 'bodyfat', label: 'Körperfett', short: 'KFA', unit: '%', decimals: 1 },
  { key: 'waist', label: 'Bauchumfang', short: 'Bauch', unit: 'cm', decimals: 1 },
  { key: 'chest', label: 'Brustumfang', short: 'Brust', unit: 'cm', decimals: 1 },
  { key: 'arm', label: 'Oberarm', short: 'Arm', unit: 'cm', decimals: 1 },
  { key: 'thigh', label: 'Oberschenkel', short: 'Bein', unit: 'cm', decimals: 1 },
];

const sorted = (entries, key) => entries.filter((e) => e[key] > 0).sort((a, b) => a.date - b.date);

/** Zeitreihe eines Maßes: [{x, y}] aufsteigend. */
export function measureSeries(entries, key, { since = -Infinity } = {}) {
  return sorted(entries, key).filter((e) => e.date >= since).map((e) => ({ x: e.date, y: e[key] }));
}

/** Letzter Eintrag eines Maßes oder null. */
export function latestMeasure(entries, key) {
  const s = sorted(entries, key);
  return s.length ? s[s.length - 1] : null;
}

/**
 * Körpergewicht zu einem Zeitpunkt: letzter Eintrag davor; gibt es keinen
 * davor, der erste Eintrag überhaupt (besser als gar keiner). Sonst null.
 */
export function bodyweightAt(entries, ts) {
  const s = sorted(entries, 'bodyweight');
  if (!s.length) return null;
  let found = s[0];
  for (const e of s) {
    if (e.date <= ts) found = e;
    else break;
  }
  return found.bodyweight;
}

/** Veränderung eines Maßes seit `since` (letzter Wert − erster Wert im Zeitraum). */
export function measureChange(entries, key, since) {
  const s = measureSeries(entries, key, { since });
  if (s.length < 2) return null;
  return s[s.length - 1].y - s[0].y;
}

/**
 * Hinterlegt bei unterstützten Sätzen (Minusgewicht) das Körpergewicht zum
 * Trainingszeitpunkt (Feld `bw`), damit spätere Gewichtsänderungen alte Werte
 * nicht verfälschen. Rückgabe: Liste der geänderten Trainings (neue Objekte).
 */
export function annotateBodyweight(workouts, entries) {
  const changed = [];
  for (const w of workouts) {
    const bw = bodyweightAt(entries, w.startedAt);
    let dirty = false;
    const exercises = w.exercises.map((e) => {
      if (!e.sets.some((s) => s.weight < 0)) return e;
      const sets = e.sets.map((s) => {
        if (!(s.weight < 0)) return s;
        if (bw == null) { if (s.bw == null) return s; dirty = true; const { bw: _, ...rest } = s; return rest; }
        if (s.bw === bw) return s;
        dirty = true;
        return { ...s, bw };
      });
      return sets === e.sets ? e : { ...e, sets };
    });
    if (dirty) changed.push({ ...w, exercises });
  }
  return changed;
}
