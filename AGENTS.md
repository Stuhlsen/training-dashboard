# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard auf GitHub Pages.
Repo: github.com/Stuhlsen/training-dashboard
Live: stuhlsen.github.io/training-dashboard

## Stack

Vanilla HTML/CSS/JS als **native ES-Module** · SVG-Charts (kein Framework, kein Build-Step, kein Bundler)
Node.js ≥ 20 für Datensync und Tests · GitHub Actions (Sync alle 6h, CI bei jedem Push)
`package.json` existiert NUR für `"type": "module"` und die npm-Scripts — es gibt
keine Dependencies und kein `npm install`. Tests laufen mit dem eingebauten `node:test`.

## Befehle

```powershell
# Lokaler Dev-Server (Dashboard im Browser testen — ES-Module brauchen HTTP, kein file://)
npx serve .

# Unit-Tests (eingebauter Node-Test-Runner, kein Install nötig)
npm test

# Datensync lokal ausführen (braucht .env mit Secrets, siehe unten)
npm run sync

# Syntax-Check einer JS-Datei — PFLICHT vor jedem Commit
node -c assets/js/<pfad>/<datei>.js

# Lint + Formatierung (lädt eslint/prettier on-the-fly via npx, nichts wird installiert)
npm run lint
npm run format
```

Lokale `.env` (nicht committen, steht in .gitignore) für `npm run sync`:
`NOTION_API_KEY`, `NOTION_DATABASE_ID`, `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`,
`WEATHER_LAT`, `WEATHER_LON` (+ optional die `_2`-Varianten).

## Workflow vor jedem Commit

1. Bei JS-Änderung: `node -c <datei>` — muss ohne Fehler durchlaufen
2. `npm test` — alle Tests müssen grün sein (CI prüft das ebenfalls)
3. Betroffene Seite lokal prüfen (`npx serve .`, Browser-Hard-Refresh bei CSS)
4. Commit mit Konvention (siehe unten)
5. `git sync`

`data/*.json` NICHT manuell committen — die werden von der Action regeneriert;
manuelle Commits erzeugen Konflikte mit dem Auto-Commit.

## Commit-Konvention

Prefix + knappe deutsche Beschreibung:
- `fix:`    — Bugfix
- `feat:`   — neues Feature
- `design:` — reine CSS-/Styling-Änderung
- `docs:`   — Dokumentation (README, AGENTS.md)
- `chore:`  — Wartung, Config, Workflow
- `test:`   — Tests hinzugefügt/geändert

## Boot / Modul-Architektur

- **Ein einziges** `<script type="module" src="assets/js/app.js">` in `index.html`.
  Die Ladereihenfolge ergibt sich aus dem Import-Graph — kein Script-Tag-Management.
- **Neue JS-Datei anlegen → per `import` einbinden**, NICHT in index.html eintragen.
- Keine Inline-`onclick`-Handler in index.html (mit Modulen nicht mehr erreichbar) —
  Event-Handler werden in `ui/nav.js` bzw. den jeweiligen UI-Modulen registriert.
  Einzige Ausnahme: der Reload-Button im Error-Screen (`location.reload()`).
- **Schichtenregel:**
  - `core/` — reine Berechnung. Greift NIEMALS auf `document`, `window`,
    `localStorage` oder `fetch` zu. Alles hier ist mit `node:test` testbar.
  - `state/` — Konfiguration + Daten-Store (lädt JSON, hält Zustand).
  - `ui/` — DOM, SVG-Rendering, Event-Handler, GitHub-/intervals.icu-Schreibzugriffe.
  - Importrichtung: `ui → state → core`. `core` importiert nichts aus `state`/`ui`.
- Typen via **JSDoc + jsconfig.json (`checkJs`)** — kein TypeScript, keine Kompilierung.
  Zentrale Typdefinitionen in `assets/js/types.js` (Ride, WellnessDay, Result, …).

## Fehlerbehandlung / Result-Konvention

Fehlbare Operationen (Laden, GitHub-Write, intervals.icu-Push) geben einheitlich
`{ ok: true, ... }` oder `{ ok: false, error: { code, message } }` zurück
(Typ `Result` in types.js; Codes: HTTP, NETWORK, TOKEN_INVALID, SCHEMA, NO_DATA, UNKNOWN).
Aufrufstellen prüfen `result.ok` und zeigen `result.error?.message`.
Logging läuft über `ui/log.js` (Frontend, Prefix `[dashboard]`) bzw.
`scripts/lib/log.js` (Sync — zählt Warnungen/Fehler, bestimmt den Exit-Code).
Keine rohen `console.*`-Aufrufe in neuen Dateien.

## Schema-Validierung

`core/validate.js` prüft geladene `rides.json`-Payloads zur Laufzeit (Stichprobe).
**Neues Feld im Datenformat → an DREI Stellen ergänzen:**
1. `scripts/` (Erzeugung), 2. `core/validate.js` (Schema), 3. `types.js` (JSDoc-Typ).
Abweichungen werden als Warnung geloggt; fehlende/leere `rides` sind fatal.

## Dateistruktur

```
index.html            → Einstiegs-HTML. Hält ALLE Element-IDs, die das JS ansteuert,
                        und das eine Module-Script-Tag. Neue IDs/Charts hier eintragen.

assets/css/           → main / components / charts / table / planned (unverändert)

assets/js/
  app.js              → Einstiegspunkt: Init, Athleten-Toggle, renderAll(),
                        updateChartExplainers(), Period-Toggles
  types.js            → Zentrale JSDoc-Typdefinitionen (kein Laufzeit-Code)
  core/               → REINE Berechnung, kein DOM — vollständig testbar
    format.js         → fmt/fmtInt/fmtDate/fmtDuration, weatherIcon, windDir, …
    stats.js          → sum/avg/max/min, linearTrend (Regression)
    aggregate.js      → isoWeekKey, weeklyFromPlanWeeks, weeklyByCalendar, monthlyFromRides
    pmc.js            → interpolateCtl, tsbOf
    loadguard.js      → Foster-Monotonie/Strain, CTL-Ramp (Belastungswächter);
                        describeWeek() für die Analyse-Wocheneinordnung
    readiness.js      → Tagesform: 7d vs. 42d-Baseline (nur intervals.icu-SDNN!)
    briefing.js       → Status-Briefing: fusioniert readiness+TSB+LoadGuard zu
                        einem Tagesstatus (rotes Erholungssignal schlägt grünen TSB)
    body.js           → Regeneration & Körper: Gewichtstrend, W/kg, Energie-
                        Näherung (kJ≈kcal), Hydration; availability() blendet
                        Kacheln datengetrieben ein (≥5 Punkte / 30 Tage)
    periodization.js  → Periodisierungs-Erfüllung Plan 2: Reizsignatur je Block
                        (Typ ODER IF-Korridor), Quality-Dichte, Erholungswochen
    adherence.js      → Konsistenz: Wochen-Streak, Frequenztrend, Plan-Adhärenz
                        (Adjustments-Matching wie weekreview, über den Zeitraum)
    zones.js          → Time-in-Zone-Normalisierung + Wochenverteilung; Gesamt-
                        verteilung (overallZoneShares), IF-Fallback (overallBandsFromIF
                        mit rideIF-Ableitung NP/FTP), distributionShape
    efficiency.js     → EF-Trend über vergleichbare Z2-Fahrten; decouplingTrend
    cadence.js        → Kadenz-Coach-Kennzahlen
    ftp-forecast.js   → eFTP-Historie (+ aus Wellness-sportInfo) + Retest-Projektion;
                        dateForTarget() = invertierte Prognose (Ziel-Horizont)
    records.js        → Bestwerte mit Ablöse-Historie
    weekreview.js     → Wochenrückblick (letzte abgeschlossene Woche)
    consistency.js    → Jahreskalender-Daten (ersetzt Wochentags-Heatmap)
    powercurve.js     → extractPowerCurve (beide intervals.icu-Formate), buildCurveData
    normalize.js      → normalizeRide/normalizeFeel/normalizeWellness
    validate.js       → Laufzeit-Schema-Prüfung für rides.json
  state/
    config.js         → CONFIG: Athleten, Phasen, FTP-Werte/Ziele, weekIndex()
    static-rides.js   → Fallback-Daten für lokale Entwicklung
    data.js           → Data-Store: load()/switchAthlete()/byDate()/weekly()/ftpValue()
  ui/
    log.js            → Frontend-Logger
    dom.js            → el/els/svgEl, Tooltip
    nav.js            → Tab-Navigation, Chart-Gruppen-Toggle (ersetzt Inline-onclick)
    github-client.js  → Token-Handling + GET-SHA/PUT (Contents-API), fetchRawJson
    charts/           → base (Grid/Labels/Scroll) · training · pmc · power · wellness
                        index.js bündelt alles als Charts.renderXxx-Fassade
    overview.js       → Übersicht-Tab, Hero, KPIs
    table.js          → Fahrtenbuch + Subjective (Befinden-Write via github-client)
    planned.js        → Planungs-Tab + Adjustments (Verschieben/Ausfall) + Workout-Push
    analysis.js       → Analyse-Tab: 8 Sektionen (Briefing · Belastung ·
                        Intensität · Aerob · Leistungsdiagnostik · Regeneration
                        & Körper · Konsistenz · Periodisierung). Plan-Toggle
                        filtert nur bestandsbezogene Sektionen; FTP-Dreiklang
                        (gemessen/geschätzt/Ziel) strikt getrennt. Sektionen
                        Körper + Periodisierung blenden sich datengetrieben aus

scripts/
  generate-data.js    → Dünner Orchestrator (läuft in der Action + `npm run sync`)
  lib/
    env.js            → .env-Loader, ENV-Objekt, requireEnv()
    log.js            → Logger mit Zählern + summary() → Exit-Code
    http.js           → fetchJson mit Timeout (20s) und einem Retry
    plan2.js          → PLAN2_SCHEDULE, PLANNED_SESSIONS, getPlan2WeekPhase
    notion.js         → Plan-1-Abfrage + Property-Getter + parseFtpFromNotes
    intervals.js      → Activities/Wellness/PowerCurves (Athlet 1 + 2)
    weather.js        → Open-Meteo: Archiv, Forecast, 16-Tage-Planungs-Forecast
    map-activity.js   → inferTypFromIF, mapActivity (Plan 2), mapActivity2 (Athlet 2)
    wellness.js       → Wellness-Mapping (beide Athleten): erweiterte Felder
                        (Gewicht/Kalorien/Hydration/Körperfett/eFTP aus sportInfo),
                        mapWellnessList/latestWeight + logWellnessCoverage
                        (Verifikationslog: welche Felder real befüllt sind)
    output.js         → subjective/adjustments laden, rides.json/rides-2.json schreiben

tests/                → node:test-Suiten für core/* und scripts/lib/* (npm test)

.github/workflows/
  sync-data.yml       → Cron alle 6h; Jobs: sync (JSON generieren + committen + Artefakt-Upload) → deploy (Pages, needs: sync)
  ci.yml              → Push/PR: npm test + ESLint (committet nichts)
```

## Athleten

- **Athlet 1** (`athlete1`) — eigener Trainingsplan (Plan 1 + Plan 2), Primärnutzer
  FTP: 193W (CONFIG.ftp; DEFAULT_FTP in scripts/lib/map-activity.js)
- **Athlet 2** (`athlete2`) — Vergleichsdaten read-only, kein eigener Plan, kein Befinden
  FTP: 265W (ATHLETE_2_FTP in scripts/generate-data.js, letzter Ramp Test)

FTP-Dreiklang pro Athlet in `state/config.js` → `athletes[]`: `ftpMeasured`/`ftpMeasuredDate`
(Ramp-Test) und `ftpGoal` (Ziel) — im Analyse-Tab strikt getrennt von der laufend
geschätzten eFTP. Helper: `CONFIG.athleteConfig(id)`.

Interne IDs sind `athlete1`/`athlete2`, Anzeigenamen "Athlet 1"/"Athlet 2"
(anpassbar in `state/config.js` → `athletes[].name`). Athleten-Toggle persistent via
`localStorage("active_athlete")`; unbekannte/alte IDs werden beim Start verworfen
(Fallback auf `CONFIG.primaryAthleteId`).
Bei Athlet 2: Planungs-Tab ausgeblendet, keine Befinden-Spalte, keine Ziellinien.

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

Wochenstruktur (ab W2, Fokus Leistungsaufbau): Mo lockere Z2 (optional) · Di Gruppenfahrt
~65 km · Do strukturierte Intervalle · Fr Recovery (optional) · Sa Sweet-Spot-Ausdauerfahrt
(zweite Qualitätseinheit). Mo/Fr sind die Stoßdämpfer (bei müden Beinen streichen), Do+Sa
die zwei Qualitätstage. Definiert in `scripts/lib/plan2.js` (PLANNED_SESSIONS + PLAN2_SCHEDULE);
die Sa-Sessions haben strukturierte `workout`-Objekte (SS-Blöcke), pushbar zu intervals.icu.
W0/W1 stehen als abgeschlossene Historie unverändert — die Umstellung greift ab W2.
Realistisches FTP-Ziel: 210W (Korridor ~205–213W bis Retest 19.09.).

## Equipment (Athlet 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3

## Design — Konzept 5 (Kachel-Anatomie × Zonen-Farbsystem)

Tokens in `assets/css/main.css` (Namen stabil halten — Chart-JS spiegelt sie):
- Hintergrund: `#0b0e13` Anthrazit-Blau mit fixierten Zonen-Gradienten (Z2-Schimmer oben rechts, Sweet-Spot-Glut unten links)
- Kacheln: Glas — `rgba(255,255,255,0.045)` + 1px-Hauchrand, Radius 22/28px; Tooltip/Dropdowns deckend via `--card-solid`
- **Zonen-Skala als Farbsystem** (Farbe = Bedeutung, nie Deko):
  `--z1 #4a9a6e` (Recovery/positiv) · `--z2 #4a7fa8` (Grundlage/Plan 1) · `--ss #e08a3c` (Sweet Spot/Akzent/Plan 2) · `--thr #d94f4f` (Schwelle/Warnung) · `--vo2 #a24ad0`
- Typografie: **Sora** (Display/Zahlen, `--font-disp`) · **IBM Plex Mono** (Labels/Meta, `--font-mono`) · **Inter** (Fließtext, `--font-body`); Google-Fonts-Link in index.html mit System-Fallbacks
- Pills überall interaktiv (`--pill`): Tabs (aktiv = SS-Fill mit dunklem Text `#17110a`), Athleten-Toggle (aktiv = Z2), Unit-/Plan-Toggle
- Hero-Signaturen: **FTP-Zonen-Band** (Segmente aus `core/ftp-progress.js::zoneSegments`, Pins FTP/eFTP/Ziel) und **FTP-Fortschrittsring** (Z2→SS-Gradient, Fortschritt `ringProgress(eFTP, ftpBase, ftpGoal)`), plus Session-Pill (nächste Einheit via `nextPlannedSession`)
- SVG-Chart-Farben können keine CSS-Variablen nutzen → Palette ist als `CHART_THEME` in `assets/js/ui/charts/base.js` gespiegelt. Bei Palettenwechsel: main.css-Tokens UND CHART_THEME UND die Hex-Literale in `ui/charts/*` per Suchen/Ersetzen anpassen (Mapping-Kommentar in base.js).
- `prefers-reduced-motion` wird respektiert (main.css global + Ring-Transition)

## Wichtige Konventionen

**Datenschutz (HÖCHSTE Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
- Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, WEATHER_LAT_2, WEATHER_LON_2
- Wetter-Forecast wird serverseitig in der Action berechnet → nur Wetterwerte in rides.json
- Keine echten Namen von Athleten in Code, Kommentaren, Config, Templates oder Commit-Messages —
  intern `athlete1`/`athlete2`, in der UI "Athlet 1"/"Athlet 2"

**Git-Workflow:**
```powershell
git add <dateien>
git commit -m "..."
git sync   # Alias für: git fetch origin && git push --force-with-lease origin main
```
- PowerShell: KEIN `&&` zwischen Befehlen — jeweils eigene Zeile
- Bei Konflikten mit Action-Auto-Commits: `git fetch origin` dann `git push --force-with-lease origin main`
- Zeilenenden: `.gitattributes` erzwingt LF im Repo (`* text=auto eol=lf`)

**JavaScript:**
- `Data.activeAthleteId` — aktuell aktiver Athlet (ID aus state/config.js)
- `hasOwnPlan()` — true wenn Athlet 1 aktiv (prüft ob rides eine week haben)
- `Data.ftpValue()` — liest aus athleteFtp (Athlet 2) oder CONFIG.ftp (Athlet 1)
- `Data.forecast` — 16-Tage-Forecast, serverseitig befüllt, kein API-Call im Frontend
- `Data.weekly()` — Plan-Wochen bei Athlet 1, Kalenderwochen-Fallback bei Athlet 2
- `updateChartExplainers(ownPlan, ftp)` — alle Chart-Texte/Legenden athletenabhängig
- Berechnung gehört nach `core/` (mit Test), Rendering nach `ui/` — nicht mischen

**Typ-Inferenz (scripts/lib/map-activity.js):**
`inferTypFromIF(np, min, ftp)` — NP÷FTP = IF, dann Dauer als zweites Kriterium:
IF < 0.75 + ≥120min → "Z2 Lang", ≥60min → "Z2 Dauer", <60min → "Z1 Recovery"
Grenzwerte sind in `tests/typ-inferenz.test.js` festgeschrieben.

## GitHub Secrets (vorhanden, nie im Code)

```
NOTION_API_KEY          NOTION_DATABASE_ID
INTERVALS_API_KEY       INTERVALS_ATHLETE_ID
INTERVALS_API_KEY_2     INTERVALS_ATHLETE_ID_2
WEATHER_LAT             WEATHER_LON
WEATHER_LAT_2           WEATHER_LON_2
```

## Chart-Label-Konvention (Überlappungsschutz)

X-Achsen- und Wert-Labels NIEMALS pro Datenpunkt/Balken ohne Ausdünnung
zeichnen — bei Athlet 2 (30+ Kalenderwochen) überlappt sonst die Achse.
Pflicht für jedes Chart mit variabler Datenmenge:
- `pickLabelIndices(xs, minPx)` aus ui/charts/base.js (pure, getestet in
  tests/chart-layout.test.js): Mindestabstand, letzter Punkt garantiert und
  kollisionsfrei. Richtwerte: 40px für Wochen-Balken, 55–60px für Datums-Labels.
- Wochen-Keys über `weekDisplayLabels()` kürzen ("2026-KW27" → "KW27",
  Jahreswechsel wird markiert, Monate → "MM/JJ").
- Wert-Labels auf Balken bei Pitch < ~22px nur auf den Label-Indizes zeichnen;
  In-Balken-Labels zusätzlich per Balkenbreite gaten (siehe Wetter-Chart).
- Keine "Modulo-Step + letzter immer"-Guards mehr — die erzeugen End-Kollisionen.

## Chart-Merge-Konvention

Neue Auswertungen möglichst in bestehende Charts integrieren statt neue Boxen
anzulegen (Chart-Masse begrenzen): Belastungswächter lebt IM TRIMP-Chart
(Ramp-Linie + ⚠), EF-Trend IM Effizienz-Chart, Blockvergleich IM Power-Curve-
Chart (Toggle), Kadenz-Coach als Chips ÜBER dem Kadenz-Chart. Der Konsistenz-
kalender hat die Wochentags-Heatmap ERSETZT (Wochentagszähler in den Zeilen-
labels). Explainer-Texte bei Chart-Änderungen immer mitziehen — sie werden
teils statisch in index.html, teils via updateChartExplainers (app.js, BEIDE
Athleten-Varianten!) gesetzt.

## Bekannte Eigenheiten

- `subjective.json` und `adjustments.json` werden vom Action-Workflow vor
  Überschreiben geschützt (immer Remote-Stand holen vor Commit)
- Wochenvolumen/TRIMP/Wetter haben Wochen/Monats-Toggle, persistent per Athlet
  in `localStorage("period_<athleteId>_<chartId>")`
- Fahrten am selben Datum werden nach `startTime` (start_date_local) sortiert;
  Plan-1-Fahrten (Notion) haben kein startTime → dort kein Tiebreaker
- HRV/Ruhepuls bei Athlet 2 direkt aus `Data.wellness` (alle Tage),
  nicht aus Ride-Objekten (nur wenige Fahrten mit Distanz erfasst)
- Athlet 2 hat aus intervals.icu nur Fahrten mit gültiger Distanz erfasst;
  distanzlose/unklassifizierte Aktivitäten werden bewusst ausgeschlossen
- Race Condition möglich: Frontend committed direkt (Befinden-Speichern in
  ui/table.js) während der Sync-Workflow läuft → Push kann mit
  `non-fast-forward` fehlschlagen. sync-data.yml pusht daher mit
  Rebase-Retry-Schleife (3 Versuche, siehe Schritt "Commit data if changed").
- `ui/table.js` ↔ `ui/planned.js` importieren sich gegenseitig (Table.highlightByDate
  bzw. Planned.scrollToDate/Subjective). Das ist mit ES-Modulen unproblematisch,
  solange die Nutzung in Funktionen/Handlern bleibt — nichts davon auf Modul-Top-Level
  aufrufen.
- Entfernter Alt-Code (bewusst, bei Bedarf via Git-History): `Tabs`-Objekt (utils.js),
  `renderHRV`/`renderRHF`-Legacy-Stubs (charts.js), `queryNotionPlan1_compat`
  (generate-data.js), `renderHeatmap` (durch renderConsistency ersetzt).
- Pages-Deploy: `sync-data.yml` hat GETRENNTE Jobs `sync` (Daten + Artefakt-Upload) und
  `deploy` (`deploy-pages`, `needs: sync`). NICHT wieder zusammenlegen — Upload + Deploy im
  selben Job dupliziert bei einem Re-Run das `github-pages`-Artefakt („Multiple artifacts…
  count is 2"). Getrennt re-runnt „Re-run failed jobs" nur den Deploy, kein zweiter Upload.
- `zoneTimes`/`eftp` kommen aus intervals.icu-Feldern (`icu_zone_times`,
  `icu_eftp`) — Feldnamen beim ersten echten Sync-Lauf verifizieren; das
  Frontend normalisiert beide bekannten Formate und degradiert mit
  Hinweistext, wenn die Felder fehlen.
- eFTP-Historie mergt `icu_eftp` (je Fahrt) mit dem Wellness-Tageswert aus `sportInfo`
  (`scripts/lib/wellness.js`). Wellness trägt seit dem Analyse-Umbau zusätzlich
  Gewicht/Kalorien/Hydration/Körperfett; welche Felder real befüllt sind, zeigt
  `logWellnessCoverage` im Sync-Log — die „Regeneration & Körper"-Sektion blendet sich
  datengetrieben danach ein (≥5 Punkte / 30 Tage).
