# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard auf GitHub Pages.
Repo: github.com/Stuhlsen/training-dashboard
Live: stuhlsen.github.io/training-dashboard

## Stack

Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step)
Node.js für Datensync · GitHub Actions (alle 6h automatisch)
Keine automatisierten Tests vorhanden — Verifikation manuell (siehe Workflow).

## Befehle

```powershell
# Lokaler Dev-Server (Dashboard im Browser testen)
npx serve .

# Datensync lokal ausführen (braucht .env mit Secrets, siehe unten)
node scripts/generate-data.js

# Syntax-Check einer JS-Datei — PFLICHT vor jedem Commit
node -c assets/js/<datei>.js
```

Kein `npm install`, kein Build-Step (Vanilla JS).
Lokale `.env` (nicht committen, steht in .gitignore) für `generate-data.js`:
`NOTION_API_KEY`, `NOTION_DATABASE_ID`, `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`,
`WEATHER_LAT`, `WEATHER_LON` (+ optional die `_2`-Varianten).

## Workflow vor jedem Commit

1. Bei JS-Änderung: `node -c <datei>` — muss ohne Fehler durchlaufen
2. Betroffene Seite lokal prüfen (`npx serve .`, Browser-Hard-Refresh bei CSS)
3. Commit mit Konvention (siehe unten)
4. `git sync`

`data/*.json` NICHT manuell committen — die werden von der Action regeneriert;
manuelle Commits erzeugen Konflikte mit dem Auto-Commit.

## Commit-Konvention

Prefix + knappe deutsche Beschreibung:
- `fix:`    — Bugfix
- `feat:`   — neues Feature
- `design:` — reine CSS-/Styling-Änderung
- `docs:`   — Dokumentation (README, AGENTS.md)
- `chore:`  — Wartung, Config, Workflow

## Boot / Ladereihenfolge

- Kein Build, keine ES-Module. Alle JS-Dateien werden als klassische
  `<script>`-Tags in `index.html` geladen, in fester Reihenfolge.
- Globale Objekte zur Laufzeit: `Data`, `CONFIG`, `Charts`, `App`.
- Reihenfolge in `index.html` beachten: erst `config.js` + `data.js`,
  dann die Render-Module (charts/overview/table/planned/analysis),
  zuletzt `app.js` (Einstiegspunkt).
- **Neue JS-Datei anlegen → Script-Tag an passender Stelle in `index.html` ergänzen**,
  sonst ist das globale Objekt zur Laufzeit nicht verfügbar.

## Dateistruktur

```
index.html          → Einstiegs-HTML. Hält ALLE Element-IDs, die das JS ansteuert
                      (Chart-Explainer, Notes, Legenden, Titel, Hero, Tabs) sowie
                      die Script-Ladereihenfolge. Neue IDs/Charts hier eintragen.

assets/css/
  main.css          → Design-Tokens, Reset, Layout
  components.css    → Hero, Tabs, Cards, Metric-Cards, Tags
  charts.css        → Chart-Boxen, Unit-Toggle, Scrollbalken, Plan-Compare-Slider
  table.css         → Fahrtenbuch, Filter, Suche, Tabelle
  planned.css       → Planungs-Tab, Session-Karten, Workout-Badges

assets/js/
  app.js            → Einstiegspunkt, Tab-Navigation, Athleten-Toggle, renderAll(),
                      updateChartExplainers(), initPeriodToggles(), monthlyData()
  data.js           → Datenladen, byDate(), weekly(), _weeklyByCalendar(),
                      ftpValue(), athleteFtp, forecast
  config.js         → Athleten-Config, historicalVolume, weekIndex()
  charts.js         → Alle SVG-Chart-Render-Funktionen
  overview.js       → Übersicht-Tab, Hero, KPIs, Meilensteine
  table.js          → Fahrtenbuch-Render, COLS-Getter, Subjective GitHub-Write
  planned.js        → Planungs-Tab, Forecast aus Data.forecast, Workout-Push
  analysis.js       → Analyse-Tab

scripts/
  generate-data.js  → Node.js, läuft in GitHub Action:
                      Notion (Plan 1) + intervals.icu (Plan 2 + Athlete 2)
                      + Open-Meteo Wetter → data/rides.json + data/rides-2.json

.github/workflows/
  sync-data.yml     → Cron alle 6h, generiert JSON, committed, deployt Pages

data/
  rides.json        → Athlete 1 (generiert, NICHT manuell bearbeiten/committen)
  rides-2.json      → Athlete 2 (generiert, NICHT manuell bearbeiten/committen)
  subjective.json   → Befinden Athlete 1 Plan 2 (via Dashboard geschrieben)
  adjustments.json  → Session-Verschiebungen/Ausfälle (via Dashboard geschrieben)
```

## Athleten

- **Athlete 1** — eigener Trainingsplan (Plan 1 + Plan 2), Primärnutzer
  FTP: 193W (hardcodiert bis W12 Ramp Test in `generate-data.js`)
- **Athlete 2** — Vergleichsdaten read-only, kein eigener Plan, kein Befinden
  FTP: 265W (hardcodiert, letzter Ramp Test in `generate-data.js`)

Athleten-Toggle persistent via `localStorage("active_athlete")`.
Bei Athlete 2: Planungs-Tab ausgeblendet, keine Befinden-Spalte, keine Ziellinien.
Interne IDs in `config.js` `athletes[]`. (Offen: falls IDs noch echte Namen sind,
auf `athlete1`/`athlete2` umstellen — betrifft config.js, app.js, localStorage-Keys.)

## Trainingspläne

**Plan 1** — Notion-Daten (manuell), März–Juni 2026, FTP 166→193W
**Plan 2** — intervals.icu API (automatisch via Wahoo), ab Juni 2026, Ziel FTP ≥210W

Plan-2-Struktur (12 Wochen, pyramidale Periodisierung):
- W1–W3: Sweet Spot (84–97% FTP)
- W4: Erholung (Volumen −50%)
- W5–W7: Schwelle (95–105% FTP)
- W8: Erholung
- W9–W11: VO2max (106–120% FTP)
- W12: Taper + Ramp Test

Wochenstruktur: Di Gruppenfahrt · Do Strukturierte Intervalle · Sa Lange Z2

## Equipment (Athlete 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3

## Design — Konzept 3 Sports-App

CSS-Variablen in `assets/css/main.css`:
- Hintergrund: `#0f172a` (Dunkelblau-Schiefer)
- Karten: `#1e293b`
- Akzent: `#f97316` (sattes Orange)
- Borders: `#2d3f55`
- Pill-Form bei Buttons/Badges: `border-radius: 20px`
- Unit-Toggle: Pill mit solidem Orange-Fill beim aktiven Button

## Wichtige Konventionen

**Datenschutz (HÖCHSTE Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
- Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, WEATHER_LAT_2, WEATHER_LON_2
- Wetter-Forecast wird serverseitig in der Action berechnet → nur Wetterwerte in rides.json
- Keine echten Namen von Athleten in Code, Kommentaren, Config oder Commit-Messages

**Git-Workflow:**
```powershell
git add <dateien>
git commit -m "..."
git sync   # Alias für: git fetch origin && git push --force-with-lease origin main
```
- PowerShell: KEIN `&&` zwischen Befehlen — jeweils eigene Zeile
- Bei Konflikten mit Action-Auto-Commits: `git fetch origin` dann `git push --force-with-lease origin main`

**JavaScript:**
- `Data.activeAthleteId` — aktuell aktiver Athlet (ID aus config.js)
- `hasOwnPlan()` — true wenn Athlete 1 aktiv (prüft ob rides eine week haben)
- `Data.ftpValue()` — liest aus athleteFtp (Athlete 2) oder CONFIG.ftp (Athlete 1)
- `Data.forecast` — 16-Tage-Forecast, serverseitig befüllt, kein API-Call im Frontend
- `Data.weekly()` — Plan-Wochen bei Athlete 1, Kalenderwochen-Fallback bei Athlete 2
- `updateChartExplainers(ownPlan, ftp)` — alle Chart-Texte/Legenden athletenabhängig

**Typ-Inferenz (generate-data.js):**
`inferTypFromIF(np, min, ftp)` — NP÷FTP = IF, dann Dauer als zweites Kriterium:
IF < 0.75 + ≥120min → "Z2 Lang", ≥60min → "Z2 Dauer", <60min → "Z1 Recovery"

## GitHub Secrets (vorhanden, nie im Code)

```
NOTION_API_KEY          NOTION_DATABASE_ID
INTERVALS_API_KEY       INTERVALS_ATHLETE_ID
INTERVALS_API_KEY_2     INTERVALS_ATHLETE_ID_2
WEATHER_LAT             WEATHER_LON
WEATHER_LAT_2           WEATHER_LON_2
```

## Bekannte Eigenheiten

- `subjective.json` und `adjustments.json` werden vom Action-Workflow vor
  Überschreiben geschützt (immer Remote-Stand holen vor Commit)
- Wochenvolumen/TRIMP/Wetter haben Wochen/Monats-Toggle, persistent per Athlet
  in `localStorage("period_<athleteId>_<chartId>")`
- Fahrten am selben Datum werden nach `startTime` (start_date_local) sortiert;
  Plan-1-Fahrten (Notion) haben kein startTime → dort kein Tiebreaker
- HRV/Ruhepuls bei Athlete 2 direkt aus `Data.wellness` (alle Tage),
  nicht aus Ride-Objekten (nur wenige Fahrten mit Distanz erfasst)
- Athlete 2 hat aus intervals.icu nur Fahrten mit gültiger Distanz erfasst;
  distanzlose/unklassifizierte Aktivitäten werden bewusst ausgeschlossen
- Race Condition möglich: Frontend committed direkt (Befinden-Speichern in
  table.js) während der Sync-Workflow läuft → Push kann mit
  `non-fast-forward` fehlschlagen. sync-data.yml pusht daher mit
  Rebase-Retry-Schleife (3 Versuche, siehe Schritt "Commit data if changed").
