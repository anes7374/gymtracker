// Vorlagen & Ablauf: sicheres Aktualisieren, nächstes Training, Supersätze.
// Rein, ohne DOM – auch in Node testbar.

const DAY = 86400000;
const norm = (s) => String(s || '').trim().toLowerCase();

/**
 * Übernimmt neue Übungen und zusätzliche Sätze aus einem Training in die
 * Vorlage – entfernt aber NIE etwas: Übersprungene Übungen oder weniger Sätze
 * (z. B. aus Zeitmangel) lassen die Vorlage unverändert.
 * Neue Übungen werden hinter der zuletzt passenden Übung eingefügt.
 * Rückgabe: { exercises, changed, added: [ids], moreSets: [ids] }
 */
export function mergeTemplate(templateExercises, workoutExercises) {
  const result = templateExercises.map((e) => ({ ...e }));
  const used = new Set();
  const added = [];
  const moreSets = [];
  let insertAt = 0; // Position hinter der zuletzt gefundenen Übung
  for (const we of workoutExercises) {
    const sets = Math.max(1, Math.min(20, (we.sets || []).length || 1));
    const hit = result.find((e) => e.exerciseId === we.exerciseId && !used.has(e));
    if (hit) {
      used.add(hit);
      if (sets > hit.sets) { hit.sets = sets; moreSets.push(we.exerciseId); }
      insertAt = result.indexOf(hit) + 1;
    } else {
      const entry = { exerciseId: we.exerciseId, sets };
      if (we.group) entry.group = we.group;
      result.splice(insertAt, 0, entry);
      used.add(entry);
      insertAt++;
      added.push(we.exerciseId);
    }
  }
  return { exercises: normalizeGroups(result), changed: added.length > 0 || moreSets.length > 0, added, moreSets };
}

/**
 * Nächstes Training in der Rotation: unter den Vorlagen, die in den letzten
 * `activeDays` Tagen genutzt wurden, die am längsten nicht trainierte.
 * Trainings zählen per templateId oder gleichem Namen (z. B. aus Strong).
 * Rückgabe: { template, last } oder null.
 */
export function nextTemplate(templates, workouts, { now = Date.now(), activeDays = 42 } = {}) {
  if (!templates.length) return null;
  const byName = new Map(templates.map((t) => [norm(t.name), t]));
  const byId = new Map(templates.map((t) => [t.id, t]));
  const lastUse = new Map();
  for (const w of workouts) {
    const t = (w.templateId && byId.get(w.templateId)) || byName.get(norm(w.name));
    if (t && (!lastUse.has(t.id) || w.startedAt > lastUse.get(t.id))) lastUse.set(t.id, w.startedAt);
  }
  const used = templates.filter((t) => lastUse.has(t.id));
  if (!used.length) return { template: templates[0], last: null };
  const active = used.filter((t) => lastUse.get(t.id) >= now - activeDays * DAY);
  const pool = active.length >= 2 ? active : used;
  pool.sort((a, b) => lastUse.get(a.id) - lastUse.get(b.id));
  return { template: pool[0], last: lastUse.get(pool[0].id) };
}

/**
 * Supersätze sind aufeinanderfolgende Einträge mit derselben group-ID.
 * Entfernt Gruppen, die (z. B. nach Verschieben) nur noch aus einem Eintrag
 * bestehen oder auseinandergerissen wurden. Gibt eine neue Liste zurück.
 */
export function normalizeGroups(list) {
  const out = list.map((e) => ({ ...e }));
  for (let i = 0; i < out.length; i++) {
    const g = out[i].group;
    if (!g) continue;
    const prevSame = i > 0 && out[i - 1].group === g;
    const nextSame = i < out.length - 1 && out[i + 1].group === g;
    if (!prevSame && !nextSame) delete out[i].group;
  }
  // Eine Gruppe darf nur einen zusammenhängenden Block bilden
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    const g = out[i].group;
    if (!g) continue;
    const startsBlock = i === 0 || out[i - 1].group !== g;
    if (startsBlock && seen.has(g)) {
      const fresh = g + '-' + i;
      for (let j = i; j < out.length && out[j].group === g; j++) out[j].group = fresh;
    } else seen.add(g);
  }
  return out;
}

/** Alle Einträge desselben Supersatzes (in Reihenfolge) – oder nur der Eintrag selbst. */
export function groupMembers(list, entry) {
  if (!entry.group) return [entry];
  return list.filter((e) => e.group === entry.group);
}
