// Mehr: Pausentimer, Darstellung, Backup (Export/Import), Strong-Import, Speicher, Version.

import { h, clear, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openSheet, actionSheet, confirmDialog, alertDialog } from '../ui/sheets.js';
import { pickExercises } from '../ui/picker.js';
import { navigate, refresh } from '../router.js';
import * as repo from '../repo.js';
import * as active from '../active.js';
import * as timer from '../timer.js';
import { applyTheme } from '../theme.js';
import { checkForUpdate } from '../pwa.js';
import { APP_VERSION } from '../version.js';
import { createBackup, serializeBackup, parseBackup, backupFileName } from '../lib/backup.js';
import { parseStrongCSV, planStrongImport } from '../lib/strong-csv.js';
import { fmtClock, fmtNum, fmtDateShort, fmtRelativeDay, count, parseNumber } from '../lib/format.js';

const REST_PRESETS = [60, 90, 120, 150, 180, 240];

export async function settingsView() {
  const s = await repo.settings();
  const lastBackupAt = await repo.getMeta('lastBackupAt', null);
  const [workouts, templates, exercises] = await Promise.all([repo.workouts(), repo.templates(), repo.exercises()]);
  const body = h('div', { class: 'page settings' });

  // --- Pausentimer -------------------------------------------------------------
  const restVal = h('span', { class: 'step-val big' }, fmtClock(s.restSeconds));
  const presetRow = h('div', { class: 'chips compact' });
  const setRest = async (sec) => {
    sec = Math.max(15, Math.min(600, sec));
    await repo.setSetting('restSeconds', sec);
    restVal.textContent = fmtClock(sec);
    renderPresets(sec);
  };
  const renderPresets = (cur) => {
    clear(presetRow);
    for (const p of REST_PRESETS) {
      presetRow.append(h('button', { class: 'chip' + (p === cur ? ' active' : ''), onclick: () => setRest(p) }, fmtClock(p)));
    }
  };
  renderPresets(s.restSeconds);

  body.append(section('Pausentimer',
    h('div', { class: 'setting-block' },
      h('div', { class: 'stepper wide' },
        h('button', { class: 'step', 'aria-label': '15 Sekunden weniger', onclick: async () => setRest((await repo.settings()).restSeconds - 15) }, '−15'),
        restVal,
        h('button', { class: 'step', 'aria-label': '15 Sekunden mehr', onclick: async () => setRest((await repo.settings()).restSeconds + 15) }, '+15')),
      presetRow),
    toggle('Automatisch starten', 'Nach jedem abgehakten Satz', s.restAuto, (v) => repo.setSetting('restAuto', v)),
    toggle('Ton am Ende', 'Nur hörbar, wenn die App geöffnet und das iPhone nicht stumm ist', s.restSound, (v) => repo.setSetting('restSound', v)),
    h('button', { class: 'row-btn', onclick: () => timer.start(10) }, icon('timer'), h('span', null, 'Timer testen (10 s)')),
    h('p', { class: 'muted small pad' }, 'Eigene Pausenzeit je Übung: im Training auf die Uhr neben der Übung tippen.')));

  body.append(section('Im Training',
    toggle('Bildschirm anlassen', 'Das iPhone sperrt sich während des Trainings nicht', s.keepAwake, (v) => repo.setSetting('keepAwake', v))));

  // --- Wochenziel -------------------------------------------------------------------
  const goalVal = h('span', { class: 'step-val big' }, String(s.weeklyGoal));
  const setGoal = async (delta) => {
    const g = Math.max(1, Math.min(7, (await repo.settings()).weeklyGoal + delta));
    await repo.setSetting('weeklyGoal', g);
    goalVal.textContent = String(g);
  };
  body.append(section('Wochenziel',
    h('div', { class: 'setting-block' },
      h('div', { class: 'stepper wide' },
        h('button', { class: 'step', 'aria-label': 'Ein Training weniger', onclick: () => setGoal(-1) }, '−'),
        h('div', { class: 'goal-val' }, goalVal, h('span', { class: 'muted small' }, 'Trainings pro Woche')),
        h('button', { class: 'step', 'aria-label': 'Ein Training mehr', onclick: () => setGoal(1) }, '+')),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Für Wochen-Serie, Kalender und Startseite.'))));

  // --- Körper ------------------------------------------------------------------------
  const bw = repo.currentBodyweight();
  body.append(section('Körper',
    h('button', { class: 'row-btn', onclick: () => navigate('/body') }, icon('chart'),
      h('span', null, 'Körpergewicht & Maße', h('small', { class: 'muted' }, bw ? `aktuell ${fmtNum(bw, 1)} kg` : 'noch nichts eingetragen')),
      icon('chevron', { size: 20, cls: 'muted' })),
    h('p', { class: 'muted small pad' }, 'Das Körpergewicht nutzt die App auch für unterstützte Übungen (effektive Last = Körpergewicht − Hilfe) – jeweils mit dem Gewicht zum Zeitpunkt des Trainings.')));

  // --- Darstellung ------------------------------------------------------------------
  const seg = h('div', { class: 'segmented' });
  const renderSeg = (cur) => {
    clear(seg);
    for (const [val, label] of [['dark', 'Dunkel'], ['light', 'Hell'], ['system', 'System']]) {
      seg.append(h('button', {
        class: 'seg' + (val === cur ? ' active' : ''),
        onclick: async () => { await repo.setSetting('theme', val); applyTheme(val); renderSeg(val); },
      }, label));
    }
  };
  renderSeg(s.theme);
  body.append(section('Darstellung', h('div', { class: 'setting-block' }, seg)));

  // --- Daten ------------------------------------------------------------------------
  const backupInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => handleBackupFile(backupInput) });
  const strongInput = h('input', { type: 'file', accept: '.csv,text/csv,text/comma-separated-values,text/plain', hidden: true, onchange: () => handleStrongFile(strongInput) });

  body.append(section('Backup',
    h('p', { class: 'muted small pad' },
      lastBackupAt ? `Letztes Backup: ${fmtRelativeDay(lastBackupAt)} (${fmtDateShort(lastBackupAt)})` : 'Noch kein Backup erstellt.',
      ' Speichere die Datei z. B. in iCloud Drive („In Dateien sichern“).'),
    h('button', { class: 'row-btn', onclick: exportBackup }, icon('share'), h('span', null, 'Backup exportieren'), icon('chevron', { size: 20, cls: 'muted' })),
    h('button', { class: 'row-btn', onclick: () => backupInput.click() }, icon('import'), h('span', null, 'Backup importieren'), icon('chevron', { size: 20, cls: 'muted' })),
    backupInput));

  body.append(section('Trainingsplan',
    h('button', { class: 'row-btn', onclick: () => navigate('/split') }, icon('share'), h('span', null, 'Split teilen (z. B. mit Coach)'), icon('chevron', { size: 20, cls: 'muted' }))));

  body.append(section('Aus Strong übernehmen',
    h('p', { class: 'muted small pad' }, 'In Strong: Profil → Einstellungen → „Export Strong Data“ → Datei in „Dateien“ sichern. Dann hier die CSV-Datei auswählen.'),
    h('button', { class: 'row-btn', onclick: () => strongInput.click() }, icon('import'), h('span', null, 'Strong-CSV importieren'), icon('chevron', { size: 20, cls: 'muted' })),
    strongInput));

  // --- Speicher & App ---------------------------------------------------------------
  const persistEl = h('span', { class: 'muted' }, '…');
  const usageEl = h('span', { class: 'muted' }, '…');
  (async () => {
    try {
      const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
      persistEl.textContent = persisted == null ? 'nicht verfügbar' : persisted ? 'aktiv ✓' : 'nicht bestätigt';
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        usageEl.textContent = fmtNum((est.usage || 0) / 1024 / 1024, 1) + ' MB';
      } else usageEl.textContent = '–';
    } catch { persistEl.textContent = '–'; usageEl.textContent = '–'; }
  })();

  body.append(section('Speicher',
    infoRow('Trainings', String(workouts.length)),
    infoRow('Vorlagen', String(templates.length)),
    infoRow('Eigene Übungen', String(exercises.filter((e) => e.custom).length)),
    infoRow('Dauerhafter Speicher', persistEl),
    infoRow('Belegt', usageEl),
    h('p', { class: 'muted small pad' }, 'Alle Daten liegen nur auf diesem Gerät (IndexedDB). Wichtig: Die Homescreen-App hat einen eigenen Speicher, getrennt von Safari.')));

  body.append(section('App',
    infoRow('Version', APP_VERSION.startsWith('__') ? 'Entwicklung' : APP_VERSION),
    h('button', { class: 'row-btn', onclick: checkForUpdate }, icon('restart'), h('span', null, 'Nach Updates suchen')),
    h('button', { class: 'row-btn danger', onclick: deleteAll }, icon('trash'), h('span', null, 'Alle Daten löschen'))));

  return { title: 'Mehr', tab: 'settings', body };
}

function section(title, ...children) {
  return h('section', { class: 'settings-section' }, h('h2', { class: 'section-title' }, title), h('div', { class: 'card list-card' }, children));
}

function infoRow(label, value) {
  return h('div', { class: 'info-row' }, h('span', null, label), value instanceof Node ? value : h('span', { class: 'muted' }, value));
}

function toggle(label, hint, value, onChange) {
  const input = h('input', { type: 'checkbox', checked: !!value, onchange: () => onChange(input.checked) });
  return h('label', { class: 'switch-row' }, h('span', null, label, hint ? h('small', null, hint) : null), input);
}

// --- Backup-Export -------------------------------------------------------------------

async function exportBackup() {
  const data = await repo.exportAll();
  const json = serializeBackup(createBackup(data));
  const name = backupFileName();
  const file = new File([json], name, { type: 'application/json' });
  const canShare = !!navigator.canShare?.({ files: [file] });
  const markDone = async () => { await repo.setMeta('lastBackupAt', Date.now()); };

  // Teilen muss direkt in einem Tipp passieren (iOS verlangt eine frische
  // Nutzergeste) – darum erst die Datei vorbereiten, dann eigener Knopf.
  const s = openSheet({
    title: 'Backup bereit',
    body: h('div', { class: 'form' },
      h('p', { class: 'sheet-message' },
        `${count(data.workouts.length, 'Training', 'Trainings')}, ${count(data.templates.length, 'Vorlage', 'Vorlagen')}, ${count(data.exercises.filter((e) => e.custom).length, 'eigene Übung', 'eigene Übungen')} · ${fmtNum(json.length / 1024, 0)} KB`),
      h('p', { class: 'muted small' }, name),
      canShare ? h('p', { class: 'muted small' }, 'Tipp: Im Teilen-Menü „In Dateien sichern“ wählen und z. B. iCloud Drive als Ziel nehmen.') : null),
    footer: [
      h('button', {
        class: 'btn secondary', onclick: () => {
          const url = URL.createObjectURL(file);
          const a = h('a', { href: url, download: name });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          markDone(); s.close();
        },
      }, 'Herunterladen'),
      canShare ? h('button', {
        class: 'btn primary', onclick: async () => {
          try {
            await navigator.share({ files: [file], title: 'GymTracker-Backup' });
            await markDone();
            toast('Backup gesichert ✓');
            s.close();
            refresh();
          } catch (err) {
            if (err?.name !== 'AbortError') toast('Teilen fehlgeschlagen: ' + err.message);
          }
        },
      }, icon('share'), 'Teilen / Sichern') : null,
    ],
  });
}

// --- Backup-Import ------------------------------------------------------------------

async function handleBackupFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (err) {
    await alertDialog({ title: 'Import nicht möglich', message: err.message });
    return;
  }
  const customCount = parsed.exercises.filter((e) => !repo.BUILTIN_IDS.has(e.id)).length;
  const mode = await actionSheet({
    title: 'Backup importieren',
    message: `${parsed.exportedAt ? 'Backup vom ' + fmtDateShort(parsed.exportedAt) + ': ' : ''}${count(parsed.workouts.length, 'Training', 'Trainings')}, ${count(parsed.templates.length, 'Vorlage', 'Vorlagen')}, ${count(customCount, 'eigene Übung', 'eigene Übungen')}.` +
      (parsed.invalid ? ` ${parsed.invalid} fehlerhafte Einträge werden übersprungen.` : ''),
    items: [
      { label: 'Zusammenführen (vorhandene Daten behalten)', value: 'merge', icon: 'copy' },
      { label: 'Ersetzen (aktuelle Daten löschen)', value: 'replace', icon: 'trash', danger: true },
    ],
  });
  if (!mode) return;
  if (mode === 'replace' && !(await confirmDialog({
    title: 'Alle aktuellen Daten ersetzen?',
    message: 'Dein aktueller Verlauf, deine Vorlagen und eigenen Übungen werden durch das Backup ersetzt.',
    confirmLabel: 'Ersetzen', danger: true,
  }))) return;
  await repo.importBackup(parsed, mode);
  applyTheme((await repo.settings()).theme);
  toast(`Backup importiert: ${count(parsed.workouts.length, 'Training', 'Trainings')}`);
  refresh();
}

// --- Strong-Import ------------------------------------------------------------------

const MAP_STATUS = { existing: 'vorhanden', mapped: 'automatisch', manual: 'manuell', new: 'neu' };

async function handleStrongFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let parsed;
  try {
    parsed = parseStrongCSV(await file.text());
  } catch (err) {
    await alertDialog({ title: 'Import nicht möglich', message: err.message });
    return;
  }

  const st = parsed.stats;
  const overrides = {}; // manuelle Zuordnungen aus der Vorschau
  let plan;
  let importing = false;
  const content = h('div', { class: 'form' });
  const importBtn = h('button', { class: 'btn primary', onclick: doImport });

  async function replan() {
    plan = planStrongImport(parsed, { exercises: await repo.exercises(), workouts: await repo.workouts() }, { overrides });
    render();
  }

  function render() {
    const counts = { existing: 0, mapped: 0, manual: 0, new: 0 };
    for (const m of plan.mapping) counts[m.status]++;
    const skipped = [
      st.skippedRest ? `${fmtNum(st.skippedRest, 0)} Pausen-Zeilen` : null,
      st.skippedEmpty ? `${fmtNum(st.skippedEmpty, 0)} leere Zeilen` : null,
      st.skippedInvalid ? `${fmtNum(st.skippedInvalid, 0)} unlesbare Zeilen` : null,
    ].filter(Boolean);

    clear(content).append(
      h('div', { class: 'stat-row wrap' },
        statBox('Trainings', plan.workouts.length),
        statBox('Sätze', plan.setCount),
        statBox('Übungen', plan.mapping.length)),
      h('ul', { class: 'import-facts' },
        h('li', null, `${count(parsed.workouts.length, 'Training', 'Trainings')} erkannt` + (st.from ? ` (${fmtDateShort(st.from)} – ${fmtDateShort(st.to)})` : '')),
        plan.duplicates ? h('li', null, `${plan.duplicates} bereits vorhanden – werden übersprungen`) : null,
        h('li', null, `Übungen: ${counts.existing + counts.mapped + counts.manual} zugeordnet, ${counts.new} werden neu angelegt`),
        st.convertedLbs ? h('li', null, 'Gewichte in lbs wurden in kg umgerechnet') : null,
        !st.unitKnown ? h('li', null, 'Die Datei nennt keine Gewichtseinheit – Werte werden als kg übernommen.') : null,
        skipped.length ? h('li', { class: 'muted' }, 'Übersprungen: ' + skipped.join(', ')) : null),
      h('h3', { class: 'section-title' }, 'Zuordnung der Übungen'),
      h('p', { class: 'muted small' }, 'Tippe auf eine Übung, um die Zuordnung zu ändern. „Neu“ wird als eigene Übung mit dem Strong-Namen angelegt.'),
      h('div', { class: 'map-list' }, plan.mapping.map((m) =>
        h('button', { class: 'map-row', onclick: () => editMapping(m) },
          h('div', { class: 'map-names' },
            h('span', null, m.from),
            m.from !== m.to ? h('span', { class: 'muted small' }, '→ ' + m.to) : null,
            h('span', { class: 'muted small' }, count(m.sets, 'Satz', 'Sätze'))),
          h('span', { class: 'tag ' + m.status }, MAP_STATUS[m.status]),
          icon('chevron', { size: 18, cls: 'muted' })))));

    importBtn.disabled = importing || !plan.workouts.length;
    importBtn.textContent = plan.workouts.length ? `Importieren (${fmtNum(plan.workouts.length, 0)})` : 'Nichts Neues';
  }

  async function editMapping(m) {
    const choice = await actionSheet({
      title: m.from,
      message: `Wird importiert als: ${m.to}`,
      items: [
        { label: 'Andere Übung wählen …', value: 'pick', icon: 'search' },
        m.status === 'mapped' || m.status === 'manual'
          ? { label: `Als eigene Übung „${m.from}“ anlegen`, value: 'new', icon: 'plus' } : null,
        overrides[m.from] ? { label: 'Automatische Zuordnung', value: 'auto', icon: 'restart' } : null,
      ],
    });
    if (choice === 'pick') {
      const [id] = await pickExercises({ title: `„${m.from}“ zuordnen`, multi: false });
      if (!id) return;
      overrides[m.from] = id;
    } else if (choice === 'new') {
      overrides[m.from] = 'new';
    } else if (choice === 'auto') {
      delete overrides[m.from];
    } else return;
    await replan();
  }

  async function doImport() {
    importing = true;
    importBtn.disabled = true;
    await repo.importStrong(plan);
    s.close();
    toast(`${count(plan.workouts.length, 'Training', 'Trainings')} importiert ✓`);
    navigate('/history');
  }

  await replan();
  const s = openSheet({
    title: 'Strong-Import',
    full: true,
    body: content,
    footer: [h('button', { class: 'btn secondary', onclick: () => s.close() }, 'Abbrechen'), importBtn],
  });
}

function statBox(label, value) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('span', { class: 'stat-value' }, fmtNum(value, 0)));
}

// --- Alles löschen ------------------------------------------------------------------

async function deleteAll() {
  if (!(await confirmDialog({
    title: 'Alle Daten löschen?',
    message: 'Verlauf, Vorlagen, eigene Übungen und Einstellungen werden von diesem Gerät gelöscht. Mach vorher ein Backup!',
    confirmLabel: 'Weiter', danger: true,
  }))) return;
  if (!(await confirmDialog({
    title: 'Wirklich endgültig löschen?', message: 'Das kann nicht rückgängig gemacht werden.', confirmLabel: 'Endgültig löschen', danger: true,
  }))) return;
  timer.stop();
  await active.clear();
  await repo.clearAll();
  applyTheme((await repo.settings()).theme);
  toast('Alle Daten gelöscht');
  navigate('/');
}
