// Training loggen – für das laufende Training und zum Bearbeiten im Verlauf.

import { h, clear, toast, selectOnFocus } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { actionSheet, confirmDialog } from '../ui/sheets.js';
import { pickExercises } from '../ui/picker.js';
import { navigate, back } from '../router.js';
import * as repo from '../repo.js';
import * as active from '../active.js';
import * as timer from '../timer.js';
import { uid } from '../lib/uid.js';
import {
  lastPerformance, bestsForExercise, detectSetPRs, computeAllPRs, prLabel, setMetrics, inferWeightStep, WEIGHT_STEPS,
  matchPrevious, setSuggestions,
} from '../lib/calc.js';
import {
  parseNumber, fmtNum, fmtSet, fmtWeightInput, fmtClock, fmtDateTiny, toDateTimeLocal, fromDateTimeLocal, round,
} from '../lib/format.js';

export async function activeWorkoutView() {
  const w = active.get();
  if (!w) { navigate('/', { replace: true }); return null; }
  return editorView(w, 'active');
}

export async function editWorkoutView(id) {
  const orig = await repo.getWorkout(id);
  if (!orig) { navigate('/history', { replace: true }); return null; }
  return editorView(active.toEditable(orig), 'edit');
}

const SET_LABEL = { warmup: 'W', drop: 'D', failure: 'F' };

/** Vergessenes Training für einen vergangenen Tag nachtragen (day = "2026-10-01"). */
export async function addWorkoutView(day) {
  const [y, m, d] = day.split('-').map(Number);
  const startedAt = new Date(y, m - 1, d, 18, 0).getTime();
  if (Number.isNaN(startedAt) || startedAt > Date.now() + 86400000) { navigate('/history', { replace: true }); return null; }
  const w = { id: uid(), name: 'Training', templateId: null, startedAt, endedAt: startedAt + 3600000, notes: '', exercises: [] };
  return editorView(w, 'edit', { isNew: true });
}

async function editorView(w, mode, { isNew = false } = {}) {
  const isActive = mode === 'active';
  let settings = await repo.settings();
  const history = (await repo.workouts()).filter((x) => x.id !== w.id);
  const beforeTs = isActive ? Infinity : w.startedAt;
  let dirty = false;
  const changed = () => { dirty = true; if (isActive) active.changed(); };

  // Letztes Mal + bisherige Bestwerte je Übung (einmal berechnet)
  const infoCache = new Map();
  const info = (exerciseId) => {
    if (!infoCache.has(exerciseId)) {
      infoCache.set(exerciseId, {
        last: lastPerformance(history, exerciseId, { beforeTs }),
        bests: bestsForExercise(history, exerciseId, { beforeTs }),
        autoStep: inferWeightStep(history, exerciseId),
      });
    }
    return infoCache.get(exerciseId);
  };

  // --- Kopfbereich ------------------------------------------------------------
  const nameIn = h('input', {
    class: 'title-input', type: 'text', value: w.name, 'aria-label': 'Name des Trainings', enterkeyhint: 'done',
    oninput: () => { w.name = nameIn.value; changed(); },
  });
  const notesIn = h('textarea', {
    class: 'input notes', rows: 1, placeholder: 'Notiz zum Training …',
    oninput: () => { w.notes = notesIn.value; changed(); autoGrow(notesIn); },
  });
  notesIn.value = w.notes || '';

  let elapsedEl = null, interval = null, dateIn = null, durIn = null;
  const meta = h('div', { class: 'workout-meta' });
  if (isActive) {
    elapsedEl = h('span', { class: 'elapsed' });
    const tickElapsed = () => { elapsedEl.textContent = fmtClock((Date.now() - w.startedAt) / 1000); };
    tickElapsed();
    interval = setInterval(tickElapsed, 1000);
    meta.append(icon('timer', { size: 18 }), elapsedEl);
  } else {
    dateIn = h('input', { class: 'input', type: 'datetime-local', value: toDateTimeLocal(w.startedAt), oninput: changed });
    durIn = h('input', {
      class: 'input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', placeholder: '–',
      value: w.endedAt ? String(Math.round((w.endedAt - w.startedAt) / 60000)) : '', oninput: changed,
    });
    meta.classList.add('edit');
    meta.append(
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Beginn'), dateIn),
      h('label', { class: 'field short' }, h('span', { class: 'field-label' }, 'Dauer (min)'), durIn));
  }

  // --- Übungen ----------------------------------------------------------------
  const list = h('div', { class: 'ex-list' });
  // Der „aktuelle Satz“ bekommt die +/−-Knöpfe. Es gibt genau einen im ganzen
  // Training; nach dem Abhaken springt er zum nächsten offenen Satz.
  const cardApis = new Map(); // entry -> Steuerung der Karte
  let current = null;         // { entry, idx }

  function activate(entry, idx) {
    if (current && current.entry !== entry) cardApis.get(current.entry)?.deactivate();
    const api = cardApis.get(entry);
    if (!api || idx < 0) { current = null; return; }
    current = { entry, idx };
    api.activate(idx);
  }

  /** Nächster offener Satz in dieser Übung, sonst in den folgenden Übungen. */
  function advanceFrom(entry) {
    const start = Math.max(0, w.exercises.indexOf(entry));
    for (let k = 0; k < w.exercises.length; k++) {
      const e = w.exercises[(start + k) % w.exercises.length];
      const i = e.sets.findIndex((s) => !s.done);
      if (i !== -1) { activate(e, i); return; }
    }
    if (current) cardApis.get(current.entry)?.deactivate();
    current = null;
  }

  function renderAll() {
    const keep = current;
    clear(list);
    cardApis.clear();
    current = null;
    if (!w.exercises.length) {
      list.append(h('div', { class: 'empty' }, h('p', null, 'Noch keine Übungen. Füge die erste hinzu.')));
    }
    for (const entry of w.exercises) list.append(makeCard(entry));
    if (keep && w.exercises.includes(keep.entry) && keep.idx < keep.entry.sets.length) activate(keep.entry, keep.idx);
    else if (isActive && w.exercises.length) advanceFrom(w.exercises[0]);
  }

  /** Gewichtsschritt einer Übung: eigene Einstellung, sonst aus dem Verlauf gelernt. */
  const weightStep = (exerciseId) => settings.weightSteps?.[exerciseId] ?? info(exerciseId).autoStep;

  async function chooseWeightStep(entry) {
    const id = entry.exerciseId;
    const cur = weightStep(id);
    const auto = info(id).autoStep;
    const manual = settings.weightSteps?.[id] != null;
    const choice = await actionSheet({
      title: 'Gewichtsschritt für +/−',
      message: `${repo.exerciseName(id)} · aus deinem Verlauf: ${fmtNum(auto)} kg`,
      items: [
        ...WEIGHT_STEPS.map((v) => ({ label: `${fmtNum(v)} kg${v === cur ? '  ✓' : ''}`, value: v })),
        manual ? { label: 'Automatisch (aus Verlauf)', value: 'auto', icon: 'restart' } : null,
      ],
    });
    if (choice == null) return;
    const steps = { ...(settings.weightSteps || {}) };
    if (choice === 'auto') delete steps[id]; else steps[id] = choice;
    settings = await repo.setSetting('weightSteps', steps);
    cardApis.get(entry)?.refreshStepper();
  }

  function makeCard(entry) {
    const ex = repo.exercise(entry.exerciseId);
    // Unterstützte Übung (Maschine/Band): Hilfe = negatives Gewicht. Getippt wird
    // die Zahl von der Maschine (iOS-Zahlenfeld hat kein Minus), gespeichert −Zahl.
    const assisted = !!ex?.assisted;
    // 0 bleibt 0 (= ganz ohne Hilfe) und ist damit kein leeres Feld.
    const storeW = (n) => (n == null ? null : assisted ? (n === 0 ? 0 : -Math.abs(n)) : n);
    const { last, bests } = info(entry.exerciseId);
    const prevSets = last ? last.entry.sets : [];
    // Vorwerte zuordnen: Aufwärmsatz zu Aufwärmsatz, Arbeitssatz zu Arbeitssatz.
    const prevMatched = matchPrevious(entry.sets, prevSets);
    const rows = [];
    const card = h('section', { class: 'card ex-card' });
    const prLine = h('div', { class: 'pr-line', hidden: true });

    const rerender = () => {
      const wasIdx = current?.entry === entry ? current.idx : -1;
      const fresh = makeCard(entry);
      card.replaceWith(fresh);
      if (wasIdx === -1) return;
      const s = entry.sets[wasIdx];
      if (s && !s.done) activate(entry, wasIdx);
      else advanceFrom(entry);
    };

    // +/−-Knöpfe: Antippen = ein Schritt, Halten wiederholt
    const repeatBtn = (label, aria, fn) => {
      let t = null, repeated = false;
      const stop = () => { clearTimeout(t); clearInterval(t); t = null; };
      return h('button', {
        class: 'stp-btn', 'aria-label': aria,
        onpointerdown: () => {
          repeated = false;
          stop();
          t = setTimeout(() => { repeated = true; fn(); t = setInterval(fn, 110); }, 450);
        },
        onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
        onclick: () => { if (!repeated) fn(); repeated = false; },
        oncontextmenu: (e) => e.preventDefault(),
      }, label);
    };
    let activeIdx = -1;
    const stepLabel = h('button', { class: 'stp-label', 'aria-label': 'Gewichtsschritt ändern', onclick: () => chooseWeightStep(entry) });
    const stepper = h('div', { class: 'set-stepper' },
      h('div', { class: 'stp-group' },
        repeatBtn('−', 'Gewicht verringern', () => bump('weight', -1)),
        stepLabel,
        repeatBtn('+', 'Gewicht erhöhen', () => bump('weight', 1))),
      h('div', { class: 'stp-group' },
        repeatBtn('−', 'Eine Wiederholung weniger', () => bump('reps', -1)),
        h('span', { class: 'stp-label static' }, '1 Wdh.'),
        repeatBtn('+', 'Eine Wiederholung mehr', () => bump('reps', 1))));
    const refreshStepper = () => {
      stepLabel.replaceChildren(`${fmtNum(weightStep(entry.exerciseId))} kg`, icon('down', { size: 14, cls: 'stp-caret' }));
    };

    function bump(field, dir) {
      const i = activeIdx;
      if (i < 0) return;
      const s = entry.sets[i];
      const r = rows[i];
      const ph = placeholders()[i];
      if (field === 'weight') {
        const v = round((s.weight ?? ph.weight ?? 0) + dir * weightStep(entry.exerciseId), 2);
        // + = schwerer (bei Unterstützung: weniger Hilfe, höchstens bis 0 = ohne Hilfe)
        s.weight = assisted ? Math.min(v, 0) || 0 : (v > 0 ? v : null);
        r.wIn.value = fmtWeightInput(s.weight);
        r.wIn.classList.remove('invalid');
      } else {
        const v = (s.reps ?? ph.reps ?? 0) + dir;
        s.reps = v > 0 ? v : null;
        r.rIn.value = s.reps ?? '';
        r.rIn.classList.remove('invalid');
      }
      changed();
      refreshStatus();
    }

    cardApis.set(entry, {
      activate(i) {
        activeIdx = i;
        rows.forEach((r, j) => r.row.classList.toggle('active', j === i));
        refreshStepper();
        rows[i].row.after(stepper);
      },
      deactivate() {
        activeIdx = -1;
        rows.forEach((r) => r.row.classList.remove('active'));
        stepper.remove();
      },
      refreshStepper,
    });

    // Kopf
    card.append(h('div', { class: 'ex-head' },
      h('button', {
        class: 'ex-name', onclick: () => { if (isActive) navigate('/exercises/' + entry.exerciseId); },
      }, repo.exerciseName(entry.exerciseId)),
      h('button', { class: 'icon-btn', 'aria-label': 'Übungsmenü', onclick: () => exerciseMenu(entry) }, icon('more'))));

    // Letztes Mal
    if (last) {
      const work = last.entry.sets.filter((s) => s.type !== 'warmup');
      const shown = work.slice(0, 6).map((s, i) => fmtSet(s, { unit: i === 0 })).join(' · ');
      card.append(h('div', { class: 'ex-last' },
        h('span', { class: 'muted' }, `Letztes Mal (${fmtDateTiny(last.workout.startedAt)}): `),
        shown + (work.length > 6 ? ' …' : '')));
    } else {
      card.append(h('div', { class: 'ex-last muted' }, 'Erstes Mal – noch keine Vorwerte'));
    }

    // Notiz
    if (entry.notes != null && (entry.notes !== '' || entry.showNotes)) {
      const ta = h('textarea', {
        class: 'input notes', rows: 1, placeholder: 'Notiz zur Übung …',
        oninput: () => { entry.notes = ta.value; changed(); autoGrow(ta); },
      });
      ta.value = entry.notes;
      card.append(ta);
      requestAnimationFrame(() => autoGrow(ta));
    }

    // Satz-Tabelle
    card.append(h('div', { class: 'set-head' },
      h('span', null, 'Satz'), h('span', null, 'Vorher'), h('span', { title: assisted ? 'Unterstützung (Minusgewicht)' : null }, assisted ? '−kg' : 'kg'), h('span', null, 'Wdh.'),
      h('span', { class: 'set-head-check' }, icon('check', { size: 18 }))));

    entry.sets.forEach((set, i) => {
      const prev = prevMatched[i];
      const num = h('button', { class: 'set-num', 'aria-label': 'Satzoptionen', onclick: () => setMenu(i) });
      const prevBtn = h('button', {
        class: 'set-prev', disabled: !prev, 'aria-label': 'Vorwerte übernehmen',
        onclick: () => {
          set.weight = prev.weight ?? null;
          set.reps = prev.reps ?? null;
          wIn.value = fmtWeightInput(set.weight);
          rIn.value = set.reps ?? '';
          changed(); refreshStatus();
        },
      }, prev ? fmtSet(prev, { unit: false }) : '–');
      const wIn = selectOnFocus(h('input', {
        class: 'set-input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
        'aria-label': assisted ? 'Unterstützung in kg' : 'Gewicht in kg', value: fmtWeightInput(set.weight),
      }));
      const rIn = selectOnFocus(h('input', {
        class: 'set-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'done',
        'aria-label': 'Wiederholungen', value: set.reps ?? '',
      }));
      wIn.addEventListener('input', () => {
        const n = parseNumber(wIn.value);
        set.weight = storeW(n);
        wIn.classList.toggle('invalid', wIn.value.trim() !== '' && n == null);
        changed(); refreshStatus();
      });
      wIn.addEventListener('blur', () => { if (set.weight != null) wIn.value = fmtWeightInput(set.weight); });
      wIn.addEventListener('focus', () => activate(entry, i));
      rIn.addEventListener('focus', () => activate(entry, i));
      rIn.addEventListener('input', () => {
        const n = parseNumber(rIn.value);
        set.reps = n != null && n >= 0 ? Math.round(n) : null;
        rIn.classList.toggle('invalid', rIn.value.trim() !== '' && set.reps == null);
        changed(); refreshStatus();
      });
      const check = h('button', { class: 'set-check', 'aria-label': 'Satz abhaken', onclick: () => toggleDone(i) }, icon('check'));
      const row = h('div', { class: 'set-row' }, num, prevBtn, wIn, rIn, check);
      rows.push({ row, num, wIn, rIn, check });
      card.append(row);
    });

    card.append(prLine);
    card.append(h('button', {
      class: 'btn ghost block add-set',
      onclick: () => { entry.sets.push(active.newSet()); changed(); rerender(); },
    }, icon('plus', { size: 20 }), 'Satz hinzufügen'));

    // Graue Platzhalter: der passende Satz vom letzten Mal; nur wenn es den
    // nicht gibt, der vorherige Satz dieses Trainings.
    const placeholders = () => setSuggestions(entry.sets, prevSets);

    function refreshStatus() {
      const prs = detectSetPRs(entry.sets, bests);
      const ph = placeholders();
      let n = 0;
      rows.forEach((r, i) => {
        const s = entry.sets[i];
        r.row.classList.toggle('done', !!s.done);
        r.row.classList.toggle('warmup', s.type === 'warmup');
        r.row.classList.toggle('pr', prs[i].length > 0);
        r.num.textContent = SET_LABEL[s.type] || String(++n);
        r.wIn.placeholder = ph[i].weight != null ? fmtWeightInput(ph[i].weight) : (assisted ? '−kg' : ex?.bodyweight ? '+kg' : 'kg');
        r.rIn.placeholder = ph[i].reps != null ? String(ph[i].reps) : '0';
        r.check.setAttribute('aria-pressed', s.done ? 'true' : 'false');
      });
      const found = [];
      prs.forEach((types, i) => {
        for (const t of types) found.push(`${prLabel(t, ex)} ${fmtPR(t, entry.sets[i])}`);
      });
      prLine.hidden = !found.length;
      prLine.replaceChildren(icon('trophy', { size: 18 }), h('span', null, 'Neuer Rekord: ' + found.join(' · ')));
      return { prs, ph };
    }

    function toggleDone(i) {
      const s = entry.sets[i];
      const r = rows[i];
      const before = detectSetPRs(entry.sets, bests)[i].length;
      if (!s.done) {
        const ph = placeholders()[i];
        if (s.weight == null && ph.weight != null) { s.weight = ph.weight; r.wIn.value = fmtWeightInput(s.weight); }
        if (s.reps == null && ph.reps != null) { s.reps = ph.reps; r.rIn.value = String(s.reps); }
        if (!(s.reps > 0)) {
          toast('Bitte Wiederholungen eintragen');
          r.rIn.focus();
          return;
        }
        s.done = true;
        if (isActive && settings.restAuto) timer.start(settings.restSeconds);
      } else {
        s.done = false;
      }
      changed();
      const { prs } = refreshStatus();
      if (s.done) advanceFrom(entry);
      else activate(entry, i);
      if (s.done && prs[i].length && !before) {
        toast('🏆 Neuer PR: ' + prs[i].map((t) => prLabel(t, ex)).join(', '), { kind: 'pr' });
      }
    }

    async function setMenu(i) {
      const s = entry.sets[i];
      const choice = await actionSheet({
        title: `Satz ${i + 1}`,
        items: [
          s.type === 'warmup'
            ? { label: 'Als Arbeitssatz markieren', value: 'normal' }
            : { label: 'Als Aufwärmsatz markieren (W)', value: 'warmup' },
          s.type === 'drop' ? null : { label: 'Als Dropsatz markieren (D)', value: 'drop' },
          s.type === 'drop' || s.type === 'failure' ? { label: 'Als normalen Satz markieren', value: 'normal' } : null,
          { label: 'Satz löschen', value: 'delete', icon: 'trash', danger: true },
        ],
      });
      if (!choice) return;
      if (choice === 'delete') entry.sets.splice(i, 1);
      else if (choice === 'normal') delete s.type;
      else s.type = choice;
      changed();
      rerender();
    }

    refreshStatus();
    return card;
  }

  function fmtPR(type, set) {
    const m = setMetrics(set);
    if (type === 'reps') return `(${m.reps} Wdh.)`;
    const decimals = { weight: 2, e1rm: 1, volume: 0 }[type];
    return `(${fmtNum(m[type], decimals)} kg)`;
  }

  async function exerciseMenu(entry) {
    const idx = w.exercises.indexOf(entry);
    const choice = await actionSheet({
      title: repo.exerciseName(entry.exerciseId),
      items: [
        idx > 0 ? { label: 'Nach oben', value: 'up', icon: 'up' } : null,
        idx < w.exercises.length - 1 ? { label: 'Nach unten', value: 'down', icon: 'down' } : null,
        { label: entry.notes ? 'Notiz bearbeiten' : 'Notiz hinzufügen', value: 'note', icon: 'note' },
        { label: 'Übung ersetzen', value: 'replace', icon: 'restart' },
        isActive ? { label: 'Fortschritt ansehen', value: 'progress', icon: 'trophy' } : null,
        { label: 'Übung entfernen', value: 'remove', icon: 'trash', danger: true },
      ],
    });
    if (choice === 'up' || choice === 'down') {
      const j = idx + (choice === 'up' ? -1 : 1);
      [w.exercises[idx], w.exercises[j]] = [w.exercises[j], w.exercises[idx]];
      changed(); renderAll();
    } else if (choice === 'note') {
      entry.showNotes = true;
      entry.notes = entry.notes || '';
      renderAll();
      const ta = list.children[idx]?.querySelector('textarea');
      ta?.focus();
    } else if (choice === 'replace') {
      const [id] = await pickExercises({ title: 'Übung ersetzen', multi: false });
      if (id) { entry.exerciseId = id; changed(); renderAll(); }
    } else if (choice === 'progress') {
      navigate('/exercises/' + entry.exerciseId);
    } else if (choice === 'remove') {
      const doneSets = entry.sets.filter((s) => s.done).length;
      if (doneSets && !(await confirmDialog({
        title: 'Übung entfernen?', message: `${doneSets} abgehakte Sätze gehen verloren.`, confirmLabel: 'Entfernen', danger: true,
      }))) return;
      w.exercises.splice(idx, 1);
      changed(); renderAll();
    }
  }

  async function addExercises() {
    const ids = await pickExercises();
    if (!ids.length) return;
    for (const id of ids) {
      const last = info(id).last;
      const count = last ? Math.min(10, last.entry.sets.length) : 3;
      w.exercises.push(active.newEntry(id, count));
    }
    changed();
    renderAll();
    const card = list.children[w.exercises.length - ids.length];
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // --- Abschließen / Verwerfen / Speichern ------------------------------------
  const countSets = () => {
    const all = w.exercises.flatMap((e) => e.sets);
    const done = all.filter((s) => s.done).length;
    return { done, open: all.length - done };
  };

  async function finish() {
    document.activeElement?.blur();
    const { done, open } = countSets();
    if (!done && isNew) {
      toast('Füge eine Übung hinzu und hake mindestens einen Satz ab.');
      return;
    }
    if (!done) {
      if (await confirmDialog({
        title: 'Keine Sätze abgehakt', message: 'Es wurde noch kein Satz abgehakt. Möchtest du das Training verwerfen?',
        confirmLabel: 'Verwerfen', danger: true,
      })) await discard(true);
      return;
    }
    const ok = await confirmDialog({
      title: 'Training beenden?',
      message: open
        ? `${open} nicht abgehakte${open === 1 ? 'r Satz wird' : ' Sätze werden'} nicht gespeichert.`
        : 'Alle Sätze sind abgehakt. Starke Leistung!',
      confirmLabel: 'Beenden',
    });
    if (!ok) return;
    w.endedAt = Date.now();
    const stored = active.toStored(w);
    await repo.saveWorkout(stored);
    timer.stop();
    await active.clear();
    await maybeUpdateTemplate(stored);
    const prCount = computeAllPRs(await repo.workouts()).get(stored.id)?.count || 0;
    toast(prCount ? `Training gespeichert – ${prCount} neue${prCount === 1 ? 'r' : ''} PR${prCount === 1 ? '' : 's'}! 🏆` : 'Training gespeichert 💪', { kind: prCount ? 'pr' : '' });
    navigate('/history/' + stored.id, { replace: true });
  }

  async function maybeUpdateTemplate(stored) {
    if (!stored.templateId) return;
    const t = await repo.getTemplate(stored.templateId);
    if (!t) return;
    const now = stored.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length }));
    const same = now.length === t.exercises.length &&
      now.every((e, i) => e.exerciseId === t.exercises[i].exerciseId && e.sets === t.exercises[i].sets);
    if (same) return;
    if (await confirmDialog({
      title: `Vorlage „${t.name}“ aktualisieren?`,
      message: 'Übungen oder Satzanzahl weichen von der Vorlage ab. Soll die Vorlage an dieses Training angepasst werden?',
      confirmLabel: 'Aktualisieren', cancelLabel: 'Nein',
    })) {
      await repo.saveTemplate({ ...t, exercises: now });
      toast('Vorlage aktualisiert');
    }
  }

  async function discard(skipConfirm = false) {
    if (!skipConfirm && !(await confirmDialog({
      title: 'Training verwerfen?', message: 'Alle Eingaben dieses Trainings werden gelöscht.', confirmLabel: 'Verwerfen', danger: true,
    }))) return;
    timer.stop();
    await active.clear();
    navigate('/', { replace: true });
  }

  async function saveEdit() {
    document.activeElement?.blur();
    const startedAt = fromDateTimeLocal(dateIn.value) ?? w.startedAt;
    const minutes = parseNumber(durIn.value);
    const endedAt = minutes > 0 ? startedAt + Math.round(minutes * 60000) : null;
    const { done, open } = countSets();
    if (!done) {
      if (await confirmDialog({
        title: 'Keine Sätze mehr', message: 'Das Training enthält keine abgehakten Sätze. Training löschen?', confirmLabel: 'Löschen', danger: true,
      })) {
        await repo.deleteWorkout(w.id);
        toast('Training gelöscht');
        navigate('/history', { replace: true });
      }
      return;
    }
    if (open && !(await confirmDialog({
      title: 'Nicht abgehakte Sätze', message: `${open} nicht abgehakte Sätze werden entfernt.`, confirmLabel: 'Speichern',
    }))) return;
    await repo.saveWorkout(active.toStored({ ...w, startedAt, endedAt }));
    dirty = false;
    if (isNew) {
      toast('Training nachgetragen ✓');
      navigate('/history/' + w.id, { replace: true });
    } else {
      toast('Änderungen gespeichert');
      back('/history/' + w.id);
    }
  }

  async function cancelEdit() {
    if (dirty && !(await confirmDialog({
      title: 'Änderungen verwerfen?', confirmLabel: 'Verwerfen', danger: true,
    }))) return;
    back(isNew ? '/history' : '/history/' + w.id);
  }

  // --- Zusammenbauen ----------------------------------------------------------
  renderAll();
  const body = h('div', { class: 'page workout' },
    h('div', { class: 'workout-top' }, nameIn, meta, notesIn),
    list,
    h('button', { class: 'btn secondary block big', onclick: addExercises }, icon('plus'), 'Übung hinzufügen'),
    isActive ? h('button', { class: 'btn danger-text block', onclick: () => discard() }, 'Training verwerfen') : null,
  );
  requestAnimationFrame(() => autoGrow(notesIn));

  return isActive
    ? {
      title: 'Training',
      back: '/',
      onBack: () => navigate('/'),
      backLabel: 'Minimieren',
      hideTabbar: true,
      actions: [h('button', { class: 'btn primary small', onclick: finish }, 'Beenden')],
      body,
      cleanup: () => { clearInterval(interval); active.flush(); },
    }
    : {
      title: isNew ? 'Nachtragen' : 'Bearbeiten',
      back: true,
      onBack: cancelEdit,
      hideTabbar: true,
      actions: [h('button', { class: 'btn primary small', onclick: saveEdit }, 'Speichern')],
      body,
    };
}

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
