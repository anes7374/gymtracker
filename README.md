# GymTracker

Gym-Tracking-Web-App (PWA) fürs iPhone: Workouts schnell loggen und sehen, ob man Fortschritt macht.
Läuft komplett offline, ohne Account und ohne Server. Alle Daten bleiben auf dem Gerät (IndexedDB).

## Funktionen

- **Vorlagen**: unbegrenzt anlegen, bearbeiten, duplizieren, löschen, Reihenfolge ändern. Training aus Vorlage oder leer starten.
- **Training loggen**: Sätze mit kg × Wiederholungen, Abhaken mit einem Tipp. Pro Übung „Letztes Mal: …“ und eine
  „Vorher“-Spalte (antippen = übernehmen). Leere Felder werden beim Abhaken mit dem Vorschlag (grau) gefüllt.
  Aufwärm-/Dropsätze über die Satznummer markieren.
  **+/−-Knöpfe** unter dem aktuellen Satz: Wiederholungen in 1er-Schritten, Gewicht im Schritt, der aus dem
  Verlauf der Übung gelernt wird (z. B. 2,5 kg an der Maschine, 2 kg bei Kurzhanteln) – antippen zum Ändern, halten wiederholt.
- **Übungen**: ~90 eingebaute Übungen (Deutsch) plus eigene. Eigene Übungen lassen sich umbenennen und mit anderen
  zusammenführen; der Verlauf jeder Übung lässt sich in eine andere übertragen.
- **Unterstützte Übungen** (Klimmzug-/Dip-Maschine, Band): Hilfe wird als **Minusgewicht** gespeichert (30 kg Hilfe =
  −30 kg). Getippt wird nur die Zahl von der Maschine. Weniger Hilfe zählt als Fortschritt/Rekord. Mit Körpergewicht
  (unter „Mehr“) rechnet die App mit der effektiven Last (Körpergewicht − Hilfe) für 1RM, Volumen und Kraftentwicklung.
- **Pausentimer**: startet nach jedem abgehakten Satz, ±15 s, Dauer einstellbar. Zeitstempelbasiert, läuft also nach
  Bildschirmsperre und App-Wechsel korrekt weiter.
- **Fortschritt**: Diagramme für geschätztes 1RM (Epley), schwersten Satz und Volumen pro Training, persönliche Rekorde,
  PR-Markierung direkt beim Loggen.
- **Fortschritt-Tab** mit Zeitraumwahl (4 W / 3 M / 6 M / 1 J / Alle):
  - **Kraftentwicklung**: Index über alle aktiven Übungen. Jede Übung zählt gleich viel und wird nur mit sich selbst
    verglichen; Push/Pull-Wechsel, neue Übungen und einzelne leichte Tage verfälschen ihn nicht.
  - **Trainings pro Woche** mit Wochenziel-Linie und **Wochen-Serie**.
  - **Sätze pro Muskelgruppe und Woche** mit Richtwert 10–20.
  - **Übungen im Trend** (▲ besser / → gleich / ▼ schwächer) mit Mini-Verlauf.
  - Kennzahlen im Vergleich zum vorherigen Zeitraum und neueste Rekorde.
- **Verlauf** als **Kalender** (Trainingstage, Rekordtage, Trainings pro Woche, Wischen zum Monatswechsel) oder Liste.
  Trainings für vergangene Tage **nachtragen**. Details, bearbeiten, löschen, erneut trainieren, als Vorlage speichern.
- **Wochenziel** (Einstellungen) für Serie, Kalender und Startseite.
- **Split teilen**: Trainingstage mit Übungen (optional Satzanzahl, Trainingsfrequenz) als Text für den Coach –
  ohne Gewichte. Quelle: Vorlagen oder die letzten Trainings; aus dem Verlauf auch als Vorlagen übernehmbar.
- **Backup**: Export als JSON über das iOS-Teilen-Menü (z. B. in iCloud Drive), Import mit „Zusammenführen“ oder „Ersetzen“.
- **Import aus Strong**: CSV-Export von Strong einlesen. Spalten werden über Namen erkannt, Vorschau vor dem Import,
  Duplikate werden übersprungen (erneuter Import ist gefahrlos).

## Technik – und warum so

**Vanilla JavaScript mit ES-Modulen, ohne Build-Schritt.** Safari auf iOS kann ES-Module nativ. Ohne Bundler gibt es
keine `node_modules`, keine Build-Konfiguration und keinen `base`-Pfad, der für GitHub Pages stimmen muss. Alle Pfade
sind relativ (`./`). Diagramme sind ein kleines eigenes SVG-Modul, es gibt also keine Fremdbibliothek und kein CDN.

```
app/                    ← das ist die App (wird 1:1 veröffentlicht)
  index.html, manifest.webmanifest, sw.js, css/, icons/
  js/main.js            Start, Routen
  js/router.js          Hash-Router + App-Hülle
  js/db.js, repo.js     IndexedDB + Datenzugriff
  js/active.js          laufendes Training (übersteht App-Neustart)
  js/timer.js           Pausentimer
  js/pwa.js             Service Worker, Update-Hinweis, persist()
  js/lib/               reine Logik (getestet): calc, stats, split, strong-csv, backup, format, exercises-data
  js/ui/                DOM-Helfer, Icons, Sheets, Übungsauswahl, Diagramm
  js/views/             Bildschirme
tests/                  Tests (node --test)
tools/                  build.mjs (Deploy), serve.mjs (lokal), make-icons.mjs
.github/workflows/      Deploy auf GitHub Pages
```

### Datenmodell (IndexedDB `gymtracker`)

| Store | Inhalt |
|---|---|
| `exercises` | `{id, name, category, bodyweight, custom}` – eingebaute Übungen haben feste IDs `b-…` |
| `templates` | `{id, name, order, exercises:[{exerciseId, sets}]}` |
| `workouts` | `{id, name, templateId, startedAt, endedAt, notes, exercises:[{exerciseId, notes, sets:[{weight, reps, type?}]}]}` |
| `meta` | Einstellungen, laufendes Training, Pausentimer (`endsAt`), Datum des letzten Backups |

1RM, PRs und Volumen werden nicht gespeichert, sondern immer aus den Sätzen berechnet.

### Updates

`app/sw.js` enthält `VERSION = '__BUILD__'`. Beim Deploy ersetzt `tools/build.mjs` das durch Datum + Commit.
Dadurch ist jede veröffentlichte `sw.js` neu. Die App prüft beim Öffnen auf Updates und zeigt „Update verfügbar → Neu laden“.

## Am PC ausprobieren und testen

Voraussetzung: [Node.js](https://nodejs.org) (Version 20 oder neuer).

```bash
npm test        # alle Tests
npm start       # App auf http://localhost:5173
```

Neue Datei in `app/` angelegt? Dann muss sie in `ASSETS` in `app/sw.js` eingetragen werden (ein Test prüft das).

## Veröffentlichen (GitHub Pages)

Jeder Push auf `main` testet, baut und veröffentlicht automatisch (`.github/workflows/deploy.yml`).
Einmalig in GitHub: **Settings → Pages → Source: „GitHub Actions“**.

## Bekannte Grenzen (iOS)

- Der Ton am Pausenende kommt nur, wenn die App offen ist und das iPhone nicht auf lautlos steht. Web-Apps können
  ohne Server keine geplanten Benachrichtigungen senden. Der Timer selbst stimmt aber immer.
- Die Homescreen-App hat einen eigenen Speicher, getrennt von Safari. Daten also in der installierten App eingeben
  und importieren, nicht im Safari-Tab.
