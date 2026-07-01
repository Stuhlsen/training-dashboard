# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard auf GitHub Pages.
Repo: github.com/Stuhlsen/training-dashboard
Live: stuhlsen.github.io/training-dashboard

## Stack

Vanilla HTML/CSS/JS · SVG-Charts (kein Framework, kein Build-Step)
Node.js für Datensync · GitHub Actions (alle 6h automatisch)

## Dateistruktur

```
assets/css/
  main.css          → Design-Tokens, Reset, Layout
  components.css    → Hero, Tabs, Cards, Metric-Cards, Tags
  charts.css        → Chart-Boxen, Unit-Toggle, Scrollbalken, Plan-Compare-Slider
  table.css         → Fahrtenbuch, Filter, Suche, Tabelle
  planned.css       → Planungs-Tab, Session-Karten, Workout-Badges

assets/js/
  app.js            → Einstiegspunkt, Tab-Navigation, Athleten-Toggle, renderAll()
  data.js           → Datenladen, byDate(), weekly(), ftpValue(), athleteFtp
  config.js         → Athleten-Config, historicalVolume, weekIndex()
  charts.js         → Alle SVG-Chart-Render-Funktionen
  overview.js       → Übersicht-Tab, Hero, KPIs, Meilensteine
  table.js          → Fahrtenbuch-Render, Subjective GitHub-Write
  planned.js        → Planungs-Tab, Forecast aus Data.forecast, Workout-Push
  analysis.js       → Analyse-Tab

scripts/
  generate-data.js  → Node.js, läuft in GitHub Action:
                      Notion (Plan 1) + intervals.icu (Plan 2 + Athlete 2)
                      + Open-Meteo Wetter → data/rides.json + data/rides-2.json

.github/workflows/
  sync-data.yml     → Cron alle 6h, generiert JSON, committed, deployt Pages

data/
  rides.json        → Athlete 1 (generiert, nicht manuell bearbeiten)
  rides-2.json      → Athlete 2 (generiert, nicht manuell bearbeiten)
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

## Trainingspläne

**Plan 1** — Notion-Daten (manuell eingetragen), März–Juni 2026, FTP 166→193W
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

**Datenschutz (höchste Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
- Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, WEATHER_LAT_2, WEATHER_LON_2
- Wetter-Forecast wird serverseitig in der Action berechnet → nur Wetterwerte in rides.json
- Keine echten Namen von Athleten in Code, Kommentaren oder Config

**Git-Workflow:**
```powershell
git add <dateien>
git commit -m "..."
git sync   # Alias für git push --force-with-lease origin main
```
Bei Konflikten mit Action-Auto-Commits:
```powershell
git fetch origin
git push --force-with-lease origin main
```

**JavaScript:**
- `Data.activeAthleteId` — aktuell aktiver Athlet ("alex" oder "siggi" intern)
- `hasOwnPlan()` — true wenn Athlete 1 aktiv
- `Data.ftpValue()` — liest aus athleteFtp (Athlete 2) oder CONFIG.ftp (Athlete 1)
- `Data.forecast` — 16-Tage-Forecast, serverseitig befüllt, kein API-Call im Frontend
- `Data.weekly()` — Plan-Wochen bei Athlete 1, Kalenderwochen-Fallback bei Athlete 2

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
- Fahrten am selben Datum werden nach `startTime` (start_date_local) sortiert
- HRV/Ruhepuls bei Athlete 2 direkt aus `Data.wellness` (alle Tage),
  nicht aus Ride-Objekten (nur 8 Fahrten mit Distanz)
- `AGENTS.md` niemals echte Athletennamen, Koordinaten oder sensible Daten
