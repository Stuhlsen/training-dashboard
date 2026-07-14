# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard auf GitHub Pages.
Repo: github.com/Stuhlsen/training-dashboard
Live: stuhlsen.github.io/training-dashboard

## Stack

Vanilla HTML/CSS/JS als **native ES-Module** · SVG-Charts (kein Framework, kein Build-Step, kein Bundler)
Node.js ≥ 20 für Datensync und Tests · GitHub Actions (Sync alle 6h, CI bei jedem Push)
`package.json` existiert primär für `"type": "module"` und die npm-Scripts — Dashboard
und Datensync brauchen kein `npm install`. Einzige Ausnahme: `fallow` als `devDependency`
(nur für den lokalen/CI-Codebase-Qualitätscheck, siehe Abschnitt „Codebase-Qualität").
Tests laufen mit dem eingebauten `node:test`.

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

# Codebase-Intelligence-Report (Fallow): Health Score, Circular Deps, Duplication,
# Dead Code, Complexity Hotspots — läuft auch automatisch non-blocking in CI
npx fallow health --score --hotspots --circular-deps
npx fallow dead-code
npx fallow dupes
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

## Codebase-Qualität (Fallow)

`npx fallow` analysiert das Repo als System (Dependency-Graph, nicht nur Einzeldateien):
Health Score, Circular Deps, Duplication, Dead Code, Complexity Hotspots.
Deterministisch, keine KI im Analyzer. `fallow` ist als `devDependency` in `package.json`
gepinnt (einzige Ausnahme von „kein npm install nötig") — für reproduzierbare Scores über
die Zeit; `package-lock.json` ist dafür bewusst versioniert.

- **CI**: läuft als eigener Job `code-quality` in `ci.yml`, parallel zu `test` —
  **non-blocking** (`continue-on-error: true`), da Schwellwerte noch nicht kalibriert
  sind. Report als Artefakt (`fallow-report.json`, 30 Tage). Wenn sich der Score
  stabilisiert hat: `continue-on-error` entfernen + `--threshold` setzen für hartes Gate.
- **Lokal**: `npx fallow health --score` für den schnellen Check, `--hotspots
  --circular-deps` für Details. Circular Deps ist hier besonders relevant, weil es
  direkt die Schichtenregel (`ui → state → core`) verletzen kann.
- **Skill**: unter `.claude/skills/fallow` (repo) und optional global unter
  `~/.claude/skills/fallow` — erlaubt Anfragen wie "check code health" oder
  "find circular dependencies" direkt in Claude Code.
- Baseline-Score (09.07.2026, vor erstem gezielten Cleanup): 79 (B).
  Größte Deductions: Unit Size (−10.0), Circular Deps (−7.0).

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
    pmc.js            → interpolateCtl, tsbOf; currentPmc()/projectPmc() schreiben
                        CTL/ATL/TSB lastfrei auf "heute" fort (Ruhetage seit der
                        letzten Fahrt), tsbTrend() liefert den 3-Tage-Trend darauf
    loadguard.js      → Foster-Monotonie/Strain, CTL-Ramp (Belastungswächter);
                        describeWeek() für die Analyse-Wocheneinordnung
    readiness.js      → Tagesform: 7d vs. 42d-Baseline (nur intervals.icu-SDNN!)
    briefing.js       → Belastungsempfehlung (UI-Name; Datei/Funktion heißen
                        weiter briefing.js/buildBriefing): fusioniert readiness+
                        TSB(+Trend)+LoadGuard zu einem Tagesstatus (rotes
                        Erholungssignal schlägt grünen TSB) — Ausnahme: ist TSB
                        die einzige Alert-Quelle UND Trend+HRV zeigen aktive
                        Erholung, kippt rot auf gelb ("Erholung wirkt bereits")
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
    plan2.js          → PLAN2_SCHEDULE, PLANNED_SESSIONS, getPlan2WeekPhase (Athlet 1)
    plan-athlete2.js  → PLANNED_SESSIONS_ATHLETE2 (Athlet 2, GFNY Bremen 2026 —
                        eigener Namensraum, kein Bezug zu plan2.js/Plan 1+2; kein
                        separates Schedule-Array, week/phase stehen pro Session)
    notion.js         → Plan-1-Abfrage + Property-Getter + parseFtpFromNotes
    intervals.js      → Activities/Wellness/PowerCurves (Athlet 1 + 2)
    weather.js        → Open-Meteo: Archiv, Forecast, 16-Tage-Planungs-Forecast
    map-activity.js   → inferTypFromIF, mapActivity (Plan 2, Athlet 1),
                        mapActivity2 (Athlet 2 — Plan-Priorität aus
                        PLANNED_SESSIONS_ATHLETE2, week/phase bleiben bewusst null,
                        s. "Bekannte Eigenheiten")
    wellness.js       → Wellness-Mapping (beide Athleten): erweiterte Felder
                        (Gewicht/Kalorien/Hydration/Körperfett/eFTP aus sportInfo),
                        mapWellnessList/latestWeight + logWellnessCoverage
                        (Verifikationslog: welche Felder real befüllt sind)
    output.js         → subjective/adjustments (Athlet 1) + adjustments-2 (Athlet 2)
                        laden, rides.json/rides-2.json schreiben

tests/                → node:test-Suiten für core/* und scripts/lib/* (npm test)

.github/workflows/
  sync-data.yml       → Cron alle 6h; Jobs: sync (JSON generieren + committen + Artefakt-Upload) → deploy (Pages, needs: sync)
  ci.yml              → Push/PR: npm test + ESLint + Fallow code-quality (committet nichts)

.claude/skills/
  fallow/             → Agent Skill für Fallow (Codebase Intelligence), repo-versioniert
                        — übersetzt Anfragen wie "check code health" in fallow-Befehle
```

## Athleten

- **Athlet 1** (`athlete1`) — eigener Trainingsplan (Plan 1 + Plan 2), Primärnutzer
  FTP: 193W (CONFIG.ftp; DEFAULT_FTP in scripts/lib/map-activity.js)
- **Athlet 2** (`athlete2`) — Vergleichsathlet, weiterhin read-only (kein Befinden,
  keine Schreibaktionen), hat aber seit GFNY Bremen 2026 einen eigenen Planungstab
  (`scripts/lib/plan-athlete2.js`) — Anzeige-only, s. "Bekannte Eigenheiten"
  FTP: 265W (ATHLETE_2_FTP in scripts/generate-data.js, letzter Ramp Test),
  FTP-Ziel 280W (Notion-Korridor 275–285W)

FTP-Dreiklang pro Athlet in `state/config.js` → `athletes[]`: `ftpMeasured`/`ftpMeasuredDate`
(Ramp-Test) und `ftpGoal` (Ziel) — im Analyse-Tab strikt getrennt von der laufend
geschätzten eFTP. Helper: `CONFIG.athleteConfig(id)`.
Zusätzlich für den Hero-Header: `seasonStartFtp` (Saison-Start-FTP für den
Fortschrittsring/die Meilensteinliste — nur bei Athlet 1 gesetzt, Athlet 2 hat
keine Saison-Basis → `null`, Meilenstein entfällt statt Platzhalter) und
`dataSources` (Anzeige im Untertitel, z.B. `["intervals.icu", "Apple Health"]`).
Diese beiden Felder sind unabhängig von den globalen Singletons `CONFIG.ftpBase`/
`ftpGoal`/`retestDate` (weiterhin von `app.js`/`ui/analysis.js` für FTP-Forecast-
Chart bzw. Leistungsdiagnostik genutzt) — bewusst nicht zusammengeführt, um diese
bestehenden Features nicht anzufassen.

Interne IDs sind `athlete1`/`athlete2`, Anzeigenamen sind die selbstgewählten
Pseudonyme (GitHub-Handles) "Stuhlsen"/"hc_diZee" (einzige Quelle: `state/config.js`
→ `athletes[].name`, von dort lesen alle UI-Komponenten — nicht hartkodiert
duplizieren). Athleten-Toggle persistent via
`localStorage("active_athlete")`; unbekannte/alte IDs werden beim Start verworfen
(Fallback auf `CONFIG.primaryAthleteId`).
Bei Athlet 2: Planungs-Tab read-only sichtbar (kein Verschieben/Ausfallen/Wahoo-
Push, s. `_canEdit()` in ui/planned.js), keine Befinden-Spalte, keine Ziellinien.

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

**GFNY Bremen 2026** (Athlet 2, eigenständiger Plan, kein Bezug zu Plan 1/2) —
KW23–KW35 (01.06.–30.08.2026), Renntag So 30.08. (Ziel <3:00h, 100km). Die
Wochenschema-Termine (Ruhetag/Crit/Z2/Intervalle/Rennsim.) waren am
13.07.2026 durchgängig einen Tag zu spät eingetragen und wurden um -1 Tag
korrigiert — der Renntag selbst ist ein fester externer Termin und blieb
unverändert (29.08. bleibt bewusst frei, s. Kopfkommentar in
plan-athlete2.js). Definiert in
`scripts/lib/plan-athlete2.js` (PLANNED_SESSIONS_ATHLETE2), Blöcke
Basis→Aufbau→Rennhärte→Taper. Ruhetage werden im Planungstab nicht angezeigt
(s. "Bekannte Eigenheiten"). Read-only im Frontend, FTP-Ziel 280W.

## Equipment (Athlet 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3

## Design — Konzept 5 (Kachel-Anatomie × Zonen-Farbsystem)

Tokens in `assets/css/main.css` (Namen stabil halten — Chart-JS spiegelt sie):
- Hintergrund: `#0b0e13` Anthrazit-Blau mit fixierten Zonen-Gradienten (Z2-Schimmer oben rechts, Sweet-Spot-Glut unten links)
- Kacheln: Glas — `rgba(255,255,255,0.045)` + 1px-Hauchrand, Radius 22/28px; Tooltip/Dropdowns deckend via `--card-solid`
- **Zonen-Skala als Farbsystem** (Farbe = Bedeutung, nie Deko):
  `--z1 #4a9a6e` (Recovery/positiv) · `--z2 #4a7fa8` (Grundlage/Plan 1) · `--z3 color-mix(in oklch, var(--ss) 75%, black 25%)` (Tempo, Hero-Leistungsskala — abgeleitetes Token, keine neue Basisfarbe; ein Mix aus `--z2`+`--ss` kippt in sRGB/OKLab auf Grau/Taupe, weil Blau/Orange nahezu komplementär sind, deshalb stattdessen ein abgedunkelter `--ss`-Ton) · `--ss #e08a3c` (Sweet Spot/Akzent/Plan 2) · `--thr #d94f4f` (Schwelle/Warnung) · `--vo2 #a24ad0`
- Typografie: **Sora** (Display/Zahlen, `--font-disp`) · **IBM Plex Mono** (Labels/Meta, `--font-mono`) · **Inter** (Fließtext, `--font-body`); Google-Fonts-Link in index.html mit System-Fallbacks
- Pills überall interaktiv (`--pill`): Tabs (aktiv = SS-Fill mit dunklem Text `#17110a`), Athleten-Toggle (aktiv = Z2), Unit-/Plan-Toggle
- Hero-Signaturen: **interaktive Leistungsskala** (Coggan-Zonen Z1–Z5 aus `core/zones.js::computeZones`, Sweet-Spot-Overlay `sweetSpotBand` statt eigenem Segment, Skalenmax `scaleMaxWatts` = Z5-Ende, What-if-Slider für die Ziel-FTP-Vorschau, Pins FTP/eFTP/Ziel via `core/ftp-progress.js::pinPercent`), **FTP-Fortschrittsring** (Z2→SS-Gradient, Fortschritt `ringProgress(eFTP, athleteCfg.seasonStartFtp ?? ftpMeasured, athleteCfg.ftpGoal)` — athletenagnostisch aus `CONFIG.athleteConfig(id)`), **Meilensteinliste** (`buildMilestones`, nur vorhandene Werte) und **Session-Karte** (nächste Einheit via `nextPlannedSession`, Watt-Ziel/Dauer/TSS-Schätzung nur bei strukturiertem `workout` via `workoutWattRange`/`workoutDurationMinutes`/`estimateSessionTSS`)
- SVG-Chart-Farben können keine CSS-Variablen nutzen → Palette ist als `CHART_THEME` in `assets/js/ui/charts/base.js` gespiegelt. Bei Palettenwechsel: main.css-Tokens UND CHART_THEME UND die Hex-Literale in `ui/charts/*` per Suchen/Ersetzen anpassen (Mapping-Kommentar in base.js).
- `prefers-reduced-motion` wird respektiert (main.css global + Ring-Transition)

## Wichtige Konventionen

**Datenschutz (HÖCHSTE Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
- Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, WEATHER_LAT_2, WEATHER_LON_2
- Wetter-Forecast wird serverseitig in der Action berechnet → nur Wetterwerte in rides.json
- Keine echten Namen von Athleten in Code, Kommentaren, Config, Templates oder Commit-Messages —
  intern `athlete1`/`athlete2`, in der UI die selbstgewählten Pseudonyme
  (GitHub-Handles) "Stuhlsen"/"hc_diZee" (`state/config.js` → `athletes[].name`)

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
- `hasOwnPlan()` — true wenn Athlet 1 aktiv (prüft ob rides eine week haben); steuert
  NUR die Plan-1/2-spezifischen Inhalte (HRV/RHF-Split an W0, "Plan 2"/W12-Retest-Text,
  Wochen-Aggregation). Für den Planungstab selbst (auch Athlet 2s GFNY-Plan) gilt
  stattdessen `hasPlanningTab = Data.plannedSessions.length > 0` in app.js — bewusst
  getrennt, damit Athlet-1-exklusive Inhalte nicht in Athlet 2s Ansicht durchschlagen
- `Data.ftpValue()` — liest aus athleteFtp (Athlet 2) oder CONFIG.ftp (Athlet 1)
- `Data.forecast` — 16-Tage-Forecast, serverseitig befüllt, kein API-Call im Frontend
- `Data.weekly()` — Plan-Wochen bei Athlet 1, Kalenderwochen-Fallback bei Athlet 2
  (Athlet 2s Rides tragen bewusst kein `week`/`phase`, s. "Bekannte Eigenheiten")
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
- Segment-/Phasen-Labels an Divider-Linien (z. B. "Plan 1"/"Übergang"/
  "Plan 2" im HRV/RHF-Chart) zentriert im eigenen Segment zeichnen, nie an
  den Rändern der Divider-Linie (zwei benachbarte Rand-Labels kollidieren,
  sobald ein Segment schmal wird — z. B. eine kurze Übergangswoche). Vor
  dem Zeichnen mit `fitsLabel(spanPx, text)` aus ui/charts/base.js prüfen
  (pure, getestet in tests/chart-layout.test.js) und das Label bei zu
  wenig Platz weglassen statt überlappend zu zeichnen. Bisher nur im HRV/
  RHF-Chart (wellness.js) umgesetzt — power.js/pmc.js/training.js zeichnen
  ihre "Plan 1"/"Plan 2"-Divider-Labels noch nach dem alten Rand-Muster;
  bei Berührung dieser Charts auf dasselbe schmale-Segment-Risiko prüfen
  und ggf. auf `fitsLabel`/das segmentLabel-Muster umstellen.
- Mehrzeilige SVG-Texte (z. B. per `wrapText()`) grundsätzlich gegen die
  viewBox-Höhe absichern — der SVG-Root clippt Inhalt außerhalb der
  viewBox standardmäßig, eine zu tief platzierte zweite Zeile ist dann
  unsichtbar statt nur falsch positioniert. Ein Filter wie
  `lines.filter((_, i) => y(i) <= H - 4)` ist nur dann wirklich dynamisch,
  wenn `y(i)` unabhängig von einer Konstante prüfbar bleibt — bei fixer
  Chart-Höhe (`H` lokal hartkodiert) kann so ein Filter unbemerkt zu einem
  festen Zeilenlimit degenerieren. Einfacher und ehrlicher: wenn ohnehin
  nur eine Zeile Platz hat (wie im HRV/RHF-Hinweis), explizit nur die
  erste `wrapText()`-Zeile zeichnen statt mit einer Pseudo-Dynamik zu tun,
  als würde mehr passen.

## Datumsformat (Charts)

Einheitlich **DD.MM** für Achsen-/Label-Text (`fmtDate(iso)`, core/format.js)
und **DD.MM.JJJJ** für Tooltips, wo das Jahr zur Eindeutigkeit gebraucht wird
(`fmtDateFull(iso)`, core/format.js) — DD.MM ist die Mehrheitskonvention im
restlichen Dashboard (Fahrtenbuch, `normalizeRide`/`normalizeWellness`).
Datums-Achsenlabels ausschließlich über `xLabel()` aus ui/charts/base.js
zeichnen (font-size 10, zentriert) statt eigener `<text>`-Elemente — das
hält Schriftgröße/-schnitt über alle Chart-Komponenten konsistent. Kein
Chart-Modul soll `iso.split("-")`/`iso.slice(5)` selbst zusammensetzen.

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
- intervals.icu `/power-curves`: `oldest`/`newest` allein grenzen die
  Kurve NICHT auf den Zeitraum ein — ohne `curves`-Parameter liefert die
  API ein Preset (beobachtet: `id: "1y"`, ein Jahr rückwärts ab `newest`,
  `oldest` wird ignoriert). Für eine zeitraumgebundene Kurve (Power-Curve-
  Blockvergleich, `getPlan2Blocks()`) ist `curves=r.<von>.<bis>` (intervals.icu-
  Range-Spezifizierer) zwingend, s. `powerCurveQuery()` in
  scripts/lib/intervals.js. Ohne diesen Parameter sind alle Blockkurven
  praktisch identisch zur Gesamtkurve (nur der Anker-Zeitpunkt unterscheidet
  sich) — der Blöcke-Toggle im Power-Curve-Chart zeigt dann keine sinnvoll
  unterscheidbaren Kurven.
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
- `npm install` (für Fallow) bzw. der Skills-Installer legen `.agents/`, `agent/`,
  `data/skills/` und `skills-lock.json` an — generierte Tooling-Artefakte, kein
  Quellcode, bewusst in `.gitignore` (nicht committen, auch nicht bei `git add -A`).
- Athlet 2s Planungstab (GFNY Bremen 2026) ist read-only: `ui/planned.js` hat
  einen `_canEdit()`-Gate (`Data.activeAthleteId === CONFIG.primaryAthleteId`),
  der Verschieben/Ausfallen/Wahoo-Push-Buttons nur für Athlet 1 rendert. Eigene
  `data/adjustments-2.json` (analog `adjustments.json`) verhindert Datums-
  Kollisionen zwischen den beiden Plänen; `Adjustments._loadedFor` in
  ui/planned.js merkt sich, für welchen Athleten zuletzt geladen wurde, damit
  ein Athletenwechsel nicht die falsche Datei im Cache behält.
- `mapActivity2()` (scripts/lib/map-activity.js) setzt für Athlet-2-Fahrten
  bewusst `week: null, phase: null` — der Plan-Bezug läuft ausschließlich über
  die eigenständigen `plannedSessions`/`adjustments`-Felder in rides-2.json,
  NICHT über `ride.week`. Würde man das setzen, kippt `hasOwnPlan()` in app.js
  global auf `true` für Athlet 2 und reißt Athlet-1-exklusive Inhalte (Plan-1/2-
  HRV-Split, "Plan 2"/W12-Retest-Text) mit rein.
- Phase-Key `"Taper"` wird zwischen Plan 2 (Athlet 1) und Athlet 2s Plan
  geteilt (identische Farbe in `CONFIG.phases`) — `phaseColor()` ist die
  einzige Stelle, die `CONFIG.phases[phase]` liest (`.color`), `.label` wird
  im UI nirgends gerendert (`ui/planned.js` zeigt den rohen Phase-Key als
  Text). Deshalb brauchen "Basis"/"Aufbau"/"Rennhärte" (Athlet 2, keine
  Namensüberschneidung mit Plan 1/2) auch kein Präfix.
- Athlet-2-Workout-Objekte (`scripts/lib/plan-athlete2.js`) tragen nur `watts`,
  kein `pct` (% FTP) wie bei Athlet 1 — `_renderCard()` in ui/planned.js
  fällt für die Intervall-Beschriftung auf `watts` zurück, wenn `pct` fehlt.
- Ruhetage (Athlet 2, `typ: "Ruhetag"`) werden im Planungstab bewusst nicht
  angezeigt — weder als anstehend noch als "verpasst" (kein Ride zu
  erwarten). Reine Anzeigefilterung in `ui/planned.js::render()`
  (`allSessions`), `Data.plannedSessions` bleibt vollständig für andere
  Konsumenten (z.B. `nextPlannedSession` in der Recovery-Detailkarte).
