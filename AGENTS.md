# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard auf GitHub Pages.
Repo: github.com/Stuhlsen/training-dashboard
Live: stuhlsen.github.io/training-dashboard

## Stack

Zwei getrennte Teile im selben Repo, mit eigenen Tests und eigenem CI-Job:

- **Repo-Root** (`scripts/`, `tests/`) — reines Node.js, kein Framework. Liest
  Notion/intervals.icu/Open-Meteo und schreibt `data/*.json` (die Lesedaten-
  Pipeline). `package.json` existiert primär für `"type": "module"` und die
  npm-Scripts — braucht kein `npm install`. Einzige Ausnahme: `fallow` als
  `devDependency` (nur für den lokalen/CI-Codebase-Qualitätscheck, siehe
  „Codebase-Qualität"). Tests laufen mit dem eingebauten `node:test`.
- **`/app/`** — Vite + React + TypeScript. **Die einzige verbliebene
  Oberfläche** (der frühere Vanilla-JS-Zweig unter `assets/js/` wurde mit
  Fahrplan 1 entfernt, s. `docs/fahrplan-1-vanilla-entfernen.md`). Eigenes
  `npm install` gegen `app/package-lock.json`, unabhängig vom Root. Tests mit
  Vitest, zwei Projekte (`core` unter Node, `app` unter jsdom — s.
  `app/vite.config.ts`). Details/Konventionen: `app/README.md`.

Beide Teile teilen sich GitHub Actions (Sync alle 6h, je ein CI-Job pro
Teil — `ci.yml` für den Root, `ci-app.yml` für `/app/`, letzterer nur bei
Änderungen unter `app/**`).

**Versions-Aktualität (seit 22.08.2026):** `.github/dependabot.yml` prüft
wöchentlich npm-Pakete (Root + `/app/`), Docker-Images (Root,
`/app/`, `/scripts/`, `/supabase/` — je eigener Dockerfile-/Compose-Ort)
und GitHub-Actions-Versionen, öffnet bei Veraltung automatisch PRs. Löst
nicht automatisch — jeder PR wird wie jeder andere geprüft/gemergt.
Deckt nur ab, was im Repo selbst gepinnt ist: Tonys eigene Pulls auf
apps01 (Postgres/GoTrue/PostgREST/Caddy laufen dort über sein eigenes
Renovate-Tooling, s. `docs/fahrplan-3-docker-umbau.md`) bleiben davon
unberührt — die `supabase/postgres`-Pins hier in `docker-compose.selfhost.yml`
sind nur die lokale Referenz, kein Deploy an apps01. Anlass: Tony wies
Alex am 22.08.2026 darauf hin, dass der lokale `supabase/postgres`-Pin auf
Version 15 stehengeblieben war, obwohl Supabase seit Juni 2026
standardmäßig auf 17 wechselte — bis dahin gab es keinen Mechanismus, der
das automatisch aufgefallen wäre.

**Warum Node ≥ 24 für den Root-Teil:** `npm test` läuft als
`node --test --experimental-test-module-mocks`. Das Flag (und `mock.module()`)
gibt es zwar bereits ab Node 22.3, aber `mock.module()`-Aufrufe im Repo
nutzten die vereinheitlichte `{ exports: {...} }`-Kurzform — die ist in Node
22.23.1 noch nicht verlässlich unterstützt: `ci.yml` scheiterte damit am
31.07.2026 beim Merge nach `main` reproduzierbar an acht Testdateien
(`SyntaxError: The requested module … does not provide an export named …`),
obwohl dieselben Tests lokal unter Node 24.18.0 anstandslos grün liefen.
`ci.yml`/`ci-app.yml` pinnen seitdem `node-version: 24`. Die damaligen
`mock.module()`-Konsumenten (`state/`-Schicht) sind mit dem Vanilla-Zweig
entfernt worden — Stand 15.08.2026 nutzt keine Datei mehr unter `tests/`
`mock.module()`; das Flag steht trotzdem weiter im Skript. `sync-data.yml`
pinnt seit demselben Anlass ebenfalls `node-version: "24"` (kein Testlauf
dort, aber derselbe `generate-data.js`-Code läuft dort produktiv). Node 22
kommt nur noch im `code-quality`/Fallow-Job in `ci.yml` zum Einsatz.

## Befehle

```powershell
# Repo-Root: Unit-Tests (eingebauter Node-Test-Runner, kein Install nötig)
npm test

# Repo-Root: Datensync lokal ausführen (braucht .env mit Secrets, siehe unten)
npm run sync

# Repo-Root: Syntax-Check einer JS-Datei — PFLICHT vor jedem Commit
node -c scripts/<pfad>/<datei>.js

# Repo-Root: Lint + Formatierung (lädt eslint/prettier on-the-fly via npx)
npm run lint
npm run format

# /app/: Dev-Server (http://localhost:5173), liefert auch data/*.json aus dem Repo-Root aus
cd app
npm install
npm run dev

# /app/: Tests (Vitest, beide Projekte) · nur core: --project core
npm test
npm test -- --project core

# /app/: Typecheck + Produktions-Build nach app/dist/
npm run build

# /app/: Lint
npm run lint

# Codebase-Intelligence-Report (Fallow, Repo-Root): Health Score, Circular Deps,
# Duplication, Dead Code, Complexity Hotspots — läuft auch automatisch non-blocking in CI
npx fallow health --score --hotspots --circular-deps
npx fallow dead-code
npx fallow dupes
```

Lokale `.env` (nicht committen, steht in .gitignore) für `npm run sync`:
`NOTION_API_KEY`, `NOTION_DATABASE_ID`, `INTERVALS_API_KEY`, `INTERVALS_ATHLETE_ID`,
`WEATHER_LAT`, `WEATHER_LON` (+ optional die `_2`-Varianten). `/app/` braucht
keine eigene `.env` — die Supabase-Projekt-URLs/anon-Keys stehen (bewusst,
RLS-geschützt) direkt in `app/src/api/supabase/config.ts`.

## Workflow vor jedem Commit

1. Bei Root-JS-Änderung: `node -c <datei>` — muss ohne Fehler durchlaufen
2. Bei `/app/`-Änderung: `npm run build` (enthält `tsc -b`, deckt Typfehler ab)
3. `npm test` im jeweils betroffenen Teil (Root und/oder `/app/`) — alle Tests
   müssen grün sein (CI prüft beides getrennt)
4. Betroffene Ansicht lokal prüfen — `npm run dev` (`/app/`) für schnelle
   Zwischenstände während der Arbeit, aber als **letzter Check vor dem
   Commit-Vorschlag zwingend zusätzlich gegen den lokalen Docker-Container**
   (`docker compose -f docker-compose.dev.yml up -d`, Frontend auf
   `http://localhost:8080` — Details `docs/docker-lokal-einrichten.md`).
   Grund: nur der Container durchläuft den echten Produktions-Build
   (Vite-Build + nginx + `window.__RUNTIME_CONFIG__`-Laufzeitpfad) — der
   Vite-Dev-Server mit HMR kann Fehler verdecken, die erst im gebauten
   Static-Bundle auftreten.
5. Commit mit Konvention (siehe unten)
6. `git sync`

`data/*.json` NICHT manuell committen — die werden von der Action regeneriert;
manuelle Commits erzeugen Konflikte mit dem Auto-Commit.

## Commit-Konvention

Prefix + knappe Beschreibung — **seit 26.08.2026 auf Englisch** (davor
deutsch, s. Git-Historie, keine rückwirkende Umbenennung). Grund:
`.github/workflows/publish-images.yml` generiert bei jedem `v*`-Tag den
GitHub-Release-Changelog automatisch aus den Commit-Subjects (`git log
--pretty=format:"%s"`, nach Typ gruppiert, Text 1:1 übernommen) — der
Changelog soll für GitHub-/Portfolio-Besucher ohne Übersetzung lesbar sein.
Betrifft NUR Commit-Nachrichten — Code-Kommentare, Doku (README, AGENTS.md,
CLAUDE.md, docs/) und UI-Texte bleiben deutsch, keine Konventionsänderung
dort.
- `fix:`    — Bugfix
- `feat:`   — neues Feature
- `design:` — reine CSS-/Styling-Änderung
- `docs:`   — Dokumentation (README, AGENTS.md)
- `chore:`  — Wartung, Config, Workflow
- `test:`   — Tests hinzugefügt/geändert

## Boot / Modul-Architektur

`/app/` ist eine normale Vite-App: **ein** Einstiegspunkt (`app/src/main.tsx`
→ `App.tsx`), React-Routing/Gates statt Tab-Umschaltung per Hand. Neue
Datei anlegen → per `import` einbinden, kein Script-Tag-Management.

- **Schichtenregel** — gilt unverändert seit der Vanilla-Zeit, nur die Namen
  der I/O-/Orchestrierungs-Schicht haben sich mit dem React-Umbau geändert:
  - `app/src/core/` — reine Berechnung, portiert aus dem früheren `core/`
    (**inhaltlich unverändert**, keine Logikänderung). Greift NIEMALS auf
    `document`, `window`, `localStorage` oder `fetch` zu. Details/Umfang der
    Portierung: `app/src/core/README.md`.
  - `app/src/api/` — I/O-Grenze, ersetzt die frühere `state/*.js`-Schicht
    (bewusst nicht `data/` genannt, um Verwechslung mit `/data/*.json` zu
    vermeiden). Kapselt JSON-Pipeline (`api/pipeline.ts`) und Supabase-Adapter
    (`api/supabase/`, eine Datei je Tabelle), gibt schlichte Domänenobjekte
    zurück. Details: `app/src/api/README.md`.
  - `app/src/hooks/`, `app/src/features/*` — Orchestrierung + Zustand. Lädt
    über `app/src/api/` (React Query), hält Session/Athleten-Zuordnung.
  - `app/src/components/`, `app/src/charts/`, `app/src/features/*` (UI-Teil) —
    DOM/SVG-Rendering, Event-Handler. Ruft `api/`/`hooks/` auf.
  - **Abhängigkeitstabelle** (Default: importiere nie höher):
    | Schicht | darf importieren | darf NICHT |
    |---------|---|---|
    | `core/` | `sports/` (Werte, s. u.) | sonst nichts |
    | `api/` | `core/` (nur Typen) | `features/`, `components/` |
    | `hooks/`, `features/*` (Orchestrierung) | `core/`, `api/` | — |
    | `components/`, `charts/`, `features/*` (UI-Teil) | `core/`, `hooks/`, `features/*` | `api/` direkt (`config`/`auth`/`useActiveAthlete` als schmale, bewusste Ausnahme für globale Chrome-Komponenten — s. `EnvBadge.tsx`/`Layout.tsx`/`ProtectedRoute.tsx`/`Footer.tsx`; `useActiveAthlete` ist ein reiner `localStorage`-Hook ohne I/O, kein Unterschied zur `auth`-Ausnahme in der Sache) |
  - `app/src/sports/` — Multi-Sport-Vorbereitung (G5, bisher nur `cycling/`
    befüllt): austauschbare Zonen-/Metrik-Logik statt hart codiert. Details:
    `app/src/sports/README.md`.
- Typen: **TypeScript** in `app/` (kein `checkJs`/JSDoc mehr nötig, `app/src/core/`
  bleibt JS + JSDoc und wird per `allowJs` eingebunden — s. `app/src/core/README.md`).
  Zentrale Domänentypen in `app/src/api/types.ts` bzw. `app/src/types.js` (die
  reinen JSDoc-Typen aus `core/`).

## Fehlerbehandlung / Result-Konvention

Fehlbare Operationen (Laden, Supabase-Write, intervals.icu-Push) geben einheitlich
`{ ok: true, ... }` oder `{ ok: false, error: { code, message } }` zurück
(Typ `Result`; Codes: HTTP, NETWORK, TOKEN_INVALID, SCHEMA, NO_DATA, UNKNOWN).
In `app/src/api/` gilt die Konvention nach außen weiter, `api/result.ts` ist die
Umschaltstelle zu React Querys wurf-basiertem Fehlerkanal (`unwrap()`/`catchResult()`
— s. Kommentar in der Datei). UI-Aufrufstellen prüfen `result.ok`/`isError` und
zeigen `result.error?.message`. `scripts/lib/log.js` übernimmt das Logging auf der
Sync-Seite (zählt Warnungen/Fehler, bestimmt den Exit-Code). Keine rohen
`console.*`-Aufrufe in neuen Dateien — Stand 15.08.2026 nutzt `app/src/**`
durchgängig keine.

## Schema-Validierung

`app/src/core/validate.js` prüft geladene `rides.json`-Payloads zur Laufzeit
(Stichprobe). **Neues Feld im Datenformat → an DREI Stellen ergänzen:**
1. `scripts/` (Erzeugung), 2. `app/src/core/validate.js` (Schema),
3. `app/src/types.js` (JSDoc-Typ). Abweichungen werden als Warnung geloggt;
fehlende/leere `rides` sind fatal.

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
  direkt die Schichtenregel (`features/components → hooks/api → core`) verletzen kann.
- **Skill**: unter `.claude/skills/fallow` (repo) und optional global unter
  `~/.claude/skills/fallow` — erlaubt Anfragen wie "check code health" oder
  "find circular dependencies" direkt in Claude Code.
- Baseline-Score (09.07.2026, vor erstem gezielten Cleanup): 79 (B).
  Größte Deductions: Unit Size (−10.0), Circular Deps (−7.0).

## Supabase — Dev/Prod-Trennung

**Historie:** Der Umbau lief auf einem langlebigen `dashboard-2.0`-Branch
(Auth → Befinden → Planungstab → … in Phasen), danach auf `dashboard-3.0`
(React-Neubau). Beide sind inzwischen nach `main` gemerged — Fahrplan 1 hat
den Vanilla-Zweig entfernt, `main` ist seither die einzige aktive Linie.
Die alten Branches bleiben remote als Historie stehen, sind aber nicht mehr
in Arbeit. Was aus dieser Zeit **weiter aktiv gilt**, steht unten.

### Supabase-Projekte
**Free Tier:** max. 2 Projekte — dev/prod-Trennung bleibt bestehen.

| Projekt | Zweck | Keep-Alive |
|---------|---|---|
| `dashboard-dev` | Entwicklung, Tests, RLS-Testaccounts | nein (pausiert nach 1 Woche ist ok) |
| `dashboard-prod` | echte Daten, echte Accounts | ja (in `sync-data.yml`, 6h-Ping wie die Datensync-Action) |

**Hostname-basierte Config:**
```typescript
// app/src/api/supabase/config.ts
const PROJECT_CONFIG: Record<string, ProjectEntry> = {
  localhost: { env: "dev", projectUrl: "https://<dev-id>.supabase.co", anonKey: "…" },
  "stuhlsen.github.io": { env: "prod", projectUrl: "https://<prod-id>.supabase.co", anonKey: "…" },
};
// beide anon-Keys sind öffentlich (per Design, RLS schützt), Ports (5173, 3000)
// fallen unter den bare-Hostname-Eintrag — s. app/src/api/supabase/config.test.ts
```
Das ist die einzige Stelle mit einer fest im Quellcode hinterlegten env-abhängigen Config. Kein Build-Schritt, kein Secret-Management — Prod-Key ist sichtbar, ist aber per RLS wirkungslos ohne Login. Seit Fahrplan 3 DKR1 gibt es zusätzlich einen Laufzeit-Pfad für den Docker-Betrieb: `window.__RUNTIME_CONFIG__` (von `index.html` aus einer vom Container geschriebenen `config.json` befüllt) hat in `config.ts::resolveEntry()` Vorrang vor dieser Tabelle — Details dort im Kommentar und in `docs/docker-lokal-einrichten.md`.

### Migrations-Workflow
SQL-Migrationsskripte sind **Quellcode** und liegen im Repo unter `supabase/migrations/`
(zeitstempel-/laufnummeriert, `0001_initial_schema.sql` — Tabellen, RLS, Trigger für
User-Onboarding — bis Stand 15.08.2026 `0017_ladder_locked_until.sql`; neue Migration
bei jeder Schema-Erweiterung anhängen, nie eine bestehende nachträglich ändern).

**Einspielen (Sequence):**
1. Lokal gegen `dashboard-dev`: `supabase db push` (wenn supabase-cli installiert ist)
   oder manuell: Supabase-UI → SQL-Editor → Migration kopieren + ausführen.
2. Nach jedem Merge nach `main`, der das Schema erweitert: dieselbe Migration in
   `dashboard-prod` einspielen (oder später: CI-Job, der das automatisiert).
3. Migration wird commits — Versionshistorie, Portfolio-Dokumentation, reproduzierbar.

### Test-Sicherheit
`tests/supabase-rls.test.js` läuft echt (kein Mock) gegen das `dashboard-dev`-Projekt und prüft:
- `wellbeing_shared`: anon sieht nur bei aktivem `wellbeing_public`-Toggle, nie `note`
- `proposals`: nur der zugehörige Trainer/Athlet liest/schreibt, keine fremde `athlete_id`
- `trainer_view_prefs`: nur der jeweilige Trainer liest/ändert seine eigene Zeile
- anon ohne Login: `proposals`/`trainer_view_prefs` komplett zu (kein GRANT)

Das ist der laufende Sicherheits-Review-Prüfpunkt für RLS. Läuft nur mit Live-Credentials in `.env`,
sonst überspringt sich die Datei selbst (kein Fehlschlag in CI, wo diese Secrets nicht existieren):

```
SUPABASE_URL                              SUPABASE_ANON_KEY
SUPABASE_ATHLETE1_EMAIL / _PASSWORD       (Account "Stuhlsen")
SUPABASE_TRAINER_EMAIL / _PASSWORD        (Account "Trainer-ST", coacht Stuhlsen)
```

Diese beiden Accounts sind die einzige in `dashboard-dev` bereits real verknüpfte Coach-Athlet-
Beziehung (`profiles.coach_id`) — dashboard-dev spiegelt zwei Paare (Trainer-ST↔Stuhlsen,
Trainer-DZ↔hc_diZee), keine generischen "athlet-test"/"trainer-test"-Accounts wie ursprünglich
in Phase 0 skizziert. `SUPABASE_ATHLETE2_EMAIL`/`_PASSWORD` (hc_diZee, für
`scripts/migrate-plan-to-supabase.js`) bleibt unabhängig davon bestehen.

Jede Testzeile räumt sich selbst wieder auf (`cleanupTasks` im `after()`-Hook, inkl. Wieder-
herstellen von `wellbeing_public`/`trainer_view_prefs` auf den vorgefundenen Ausgangszustand) —
schlägt ein Aufräumschritt fehl, wirft der Hook mit einer Liste der Reste, statt es zu verschlucken.
Lokal ausführen: `npm test` (läuft mit, sobald obige Vars gesetzt sind) oder gezielt
`node --test --experimental-test-module-mocks tests/supabase-rls.test.js`.

### Datenquellen-Mix (lesen/schreiben)
- **Lesedaten** (`data/rides-*.json`, `data/wellbeing*.json`, RHR, HRV, Wetter) → JSON-Pipeline wie heute
  (Action alle 6h, `scripts/generate-data.js`).
- **Schreibdaten** (Ziele, Events, Befinden-Check-ins, Trainingskarten, Vorschläge, Feedback)
  → Supabase (RLS, Session-basiert).
- **Die Linie ist NICHT mehr scharf** (seit `effectivePlan`/`ftpAt()` in `scripts/generate-data.js`):
  der Sync-Job selbst liest inzwischen lesend aus Supabase (`plan_cards`, `ftp_history`, nur
  Athlet 1) zurück in die JSON-Pipeline, damit `rides.json` den echten Plan-Stand statt der
  eingefrorenen `adjustments.json` widerspiegelt. Ohne die vier `SUPABASE_*`-Sync-Secrets (s.
  „GitHub Secrets" unten) degradiert das unbemerkt auf den alten JSON-Stand bzw. `DEFAULT_FTP` —
  kein Fehler, nur ein stiller Fallback (s. `docs/offene-punkte.md`). `app/src/api/pipeline.ts`
  bleibt trotzdem der alleinige JSON-Loader im Frontend; `app/src/hooks/`/`features/` fragen
  weiterhin nur abstrakt "gib mir Athletendaten".
- **Athlet 4 geht noch einen Schritt weiter:** der Sync liest für ihn auch die
  **intervals.icu-Zugangsdaten** aus Supabase (`intervals_credentials`,
  `scripts/lib/intervals-credentials-fetch.js`) statt aus einem GitHub Secret —
  der Athlet trägt Key + Athlete-ID selbst in Settings ein. Ohne diese Zeile
  schreibt `generate-data.js` `rides-4.json` trotzdem (nur die Plan-Baseline aus
  `scripts/lib/plan-athlete4.js`, keine Fahrten), `source: "plan-only"`.

## Dateistruktur

Tiefe Details stehen bewusst NICHT hier, sondern in READMEs direkt im
jeweiligen Verzeichnis (bleiben so beim Ändern des Codes automatisch näher
dran als eine Kopie in AGENTS.md). Diese Übersicht zeigt nur die Form.

```
app/                       → Vite + React + TypeScript, s. app/README.md
  src/
    main.tsx, App.tsx      → Einstiegspunkt + Routing/Gates
    config.ts              → Athleten-Stammdaten, Phasen/Farben (phaseColor)
    types.js                → Reine JSDoc-Typen, aus der Vanilla-core-Schicht portiert
    core/                   → Reine Berechnung, aus dem früheren `core/` portiert
                              (PMC, Belastungswächter, Readiness, Briefing,
                              Intensitätsverteilung, EF-/Decoupling-Trend,
                              FTP-Prognose, Body, Periodisierung, Konsistenz,
                              Records, Validate, Konflikte/Vorschlags-Validierung, …)
                              — Details/Umfang: src/core/README.md
    api/                    → I/O-Grenze (ersetzt frühere `state/*.js`)
      pipeline.ts             JSON-Loader (data/*.json)
      supabase/                Adapter, eine Datei je Tabelle (auth, goals,
                                events, wellbeing, plan-cards, proposals, …)
      intervals/                intervals.icu-Push (Workout → Wahoo)
      hooks/                    React-Query-Hooks — die eigentliche Aufrufstelle
                              — Details: src/api/README.md
    sports/cycling/         → Multi-Sport-Vorbereitung: austauschbare Zonen-/
                              Metrik-/Session-Typ-/Klassifikations-Logik
                              — Details: src/sports/README.md
    charts/                 → Chart-Engine + alle Einzel-Charts (SVG/Canvas),
                              Details: src/charts/README.md
    components/             → Layout, GlassCard, AthleteToggle, ProgressRing, …
    hooks/                  → generische UI-Hooks (nicht datenbezogen)
    features/               → ein Verzeichnis je Tab/Bereich: hero, logbook,
                              planning, analysis, explorer, events, auth, settings
    styles/tokens.css       → Design-Tokens (abgeglichen mit docs/chart-grundlagen.md,
                              archiviert — Werte selbst bleiben aktuell)

data/                     → generierte JSON-Dateien (rides*.json, wellbeing*.json, …),
                            von scripts/generate-data.js geschrieben, NICHT manuell committen

supabase/
  migrations/             → SQL-Migrationen, laufnummeriert (Stand 15.08.2026: 0001–0017)

scripts/
  generate-data.js         → Dünner Orchestrator (läuft in der Action + `npm run sync`)
  delete-rest-day-cards.js, backtest-ladder.js, migrate-plan-to-supabase.js,
  preset-suggestion-check.js, report-derived-workout-structure.js,
  generate-jwt-keys.js    → einzelne Betriebs-/Migrations-/Analyse-Skripte
                             (delete-rest-day-cards.js: Einmal-Aufräumskript
                             Fahrplan 6 RUH6 — entfernt migrierte
                             `workout_type="Ruhetag"`-Zeilen aus plan_cards)
  Dockerfile, docker-entrypoint.sh → Container-Build für den Sync-Job (Fahrplan 3)
  lib/                     → von generate-data.js verwendete Module: env, log, http,
                             plan2 (Athlet 1), plan-athlete2 (Athlet 2, GFNY Bremen),
                             notion, intervals, weather, map-activity, wellness,
                             compliance, coverage, ftp-history, interval-blocks,
                             formats-fetch, plan-cards-fetch, plan-to-cards, output
    core/                  → zur app/src/core/-Schicht parallele Portierung auf der
                             Sync-Seite (aggregate, briefing, plan2-schedule, projection,
                             readiness, workout-math/-validator/-structure-derive,
                             zones, ladder-progression u.a.)

tests/                    → node:test-Suiten für scripts/lib/* + supabase-rls.test.js
                             (npm test, Repo-Root — s. Stack-Abschnitt)

.github/workflows/
  sync-data.yml            → Cron alle 6h; Jobs: sync (JSON generieren, app/dist
                             bauen, committen, Artefakt-Upload) → deploy (Pages)
  ci.yml                   → Push/PR (Repo-Root): npm test + ESLint + Fallow code-quality
  ci-app.yml                → Push/PR (nur bei Änderungen unter app/**): Vitest,
                             ESLint, Build (tsc -b + vite build) für /app/

.claude/skills/
  fallow/                  → Agent Skill für Fallow (Codebase Intelligence), repo-versioniert
                             — übersetzt Anfragen wie "check code health" in fallow-Befehle
```

## Athleten

- **Athlet 1** (`athlete1`) — eigener Trainingsplan (Plan 1 + Plan 2), Primärnutzer
  FTP: 193W (`ftpMeasured` in `app/src/config.ts`; `DEFAULT_FTP` in `scripts/lib/map-activity.js`)
- **Athlet 2** (`athlete2`) — Vergleichsathlet, weiterhin read-only (kein Befinden,
  keine Schreibaktionen), hat aber seit GFNY Bremen 2026 einen eigenen Planungstab
  (`scripts/lib/plan-athlete2.js`) — Anzeige-only, s. "Bekannte Eigenheiten".
  Read-only-Gate seit dem Athlet-4-Umbau über `readOnly: true` in
  `app/src/config.ts` (`isReadOnlyAthlete()`), nicht mehr über einen
  hartkodierten `=== PRIMARY_ATHLETE_ID`-Vergleich im Planungstab.
  FTP: 265W (ATHLETE_2_FTP in scripts/generate-data.js, letzter Ramp Test),
  FTP-Ziel 280W (Notion-Korridor 275–285W)
- **Athlet 4** (`athlete4`, „bentastiic") — Renn-/Trainings-Einsteiger. Volles
  Modell wie Athlet 1 (eigener Login, Befinden, editierbare `plan_cards`,
  Wahoo-Push), aber Lesedaten-Pipeline wie Athlet 2 (intervals.icu + Supabase,
  **kein Notion**). Der intervals.icu-Key/-Athlete-ID trägt der Athlet selbst
  in **Settings → intervals.icu** ein (Tabelle `intervals_credentials`), der
  Sync liest ihn über `scripts/lib/intervals-credentials-fetch.js` — es gibt
  **kein** `INTERVALS_API_KEY_4`-Secret. Fehlt die Zeile, schreibt der Sync
  `rides-4.json` trotzdem (nur Plan, keine Fahrten). **Fährt vorerst
  überwiegend in Zwift:** Die 12-Wochen-Einsteigervorlage
  (`scripts/lib/plan-athlete4.js`, KW36–KW47 ab 2026-08-31, 4 Einheiten/Woche,
  generiert) trägt für jede Fahr-Einheit ein vollständiges `workout`-Objekt
  mit **`pct` (% FTP)** wie Athlet 1 (kein `watts` — es gibt noch keine echte
  FTP), damit die Karten per `.zwo` nach Zwift/MyWhoosh exportierbar sind
  (`app/src/core/zwo-export.js`). `ftpMeasured`/`eFTP`/`ftpGoal` in `config.ts`
  bleiben trotzdem `null` (die %FTP-Ziele rechnet Zwift gegen die im
  Zwift-Profil hinterlegte FTP) → `output4.ftp = null`, die Hero-FTP-Widgets
  (Leistungsskala, Ringe) blenden sich datengetrieben aus. Nach dem 20-Min-Test
  (Vorlage-KW47) kann eine erste FTP gesetzt und die Vorlage um `watts` ergänzt
  werden. Die interne ID `athlete3` ist reserviert, aber bewusst noch nicht
  verdrahtet — daher die Lücke in der Nummerierung.

FTP-Dreiklang pro Athlet in `app/src/config.ts` → `athletes[]`: `ftpMeasured`/`ftpMeasuredDate`
(Ramp-Test) und `ftpGoal` (Ziel) — im Analyse-Tab strikt getrennt von der laufend
geschätzten eFTP. `seasonStartFtp` (Saison-Start-FTP für Fortschrittsring/Meilenstein
— nur bei Athlet 1 gesetzt, Athlet 2 → `null`) und `dataSources` (Untertitel-Anzeige,
z.B. `["intervals.icu", "Apple Health"]`) leben ebenfalls dort.

Interne IDs sind `athlete1`/`athlete2`/`athlete4`, Anzeigenamen sind die
selbstgewählten Pseudonyme (GitHub-Handles) "Stuhlsen"/"hc_diZee"/"bentastiic"
(einzige Quelle: `app/src/config.ts` → `athletes[].name` — nicht hartkodiert
duplizieren). Athleten-Toggle persistent via
`localStorage("active_athlete")` (`app/src/api/hooks/useActiveAthlete.ts`); unbekannte/
alte IDs werden beim Start verworfen.
Bei Athlet 2: Planungs-Tab read-only sichtbar (kein Verschieben/Ausfallen/Wahoo-Push),
keine Befinden-Spalte, keine Ziellinien — Gate über `canWriteForAthlete()`/
`isSelfAthlete()` in `app/src/api/write-authorization.ts`.

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
Basis→Aufbau→Rennhärte→Taper. Ruhetage werden seit dem 05.08.2026 für beide
Athleten im Planungstab angezeigt (s. "Bekannte Eigenheiten"). Read-only im
Frontend, FTP-Ziel 280W.

## Equipment (Athlet 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3

## Design — Konzept 5 (Kachel-Anatomie × Zonen-Farbsystem)

Tokens in `app/src/styles/tokens.css` (Namen stabil halten):
- Hintergrund: `#0b0e13` Anthrazit-Blau mit fixierten Zonen-Gradienten (Z2-Schimmer oben rechts, Sweet-Spot-Glut unten links)
- Kacheln: Glas — `rgba(255,255,255,0.045)` + 1px-Hauchrand, Radius 22/28px; Tooltip/Dropdowns deckend via `--card-solid`
- **Zonen-Skala als Farbsystem** (Farbe = Bedeutung, nie Deko):
  `--z1 #4a9a6e` (Recovery/positiv) · `--z2 #4a7fa8` (Grundlage/Plan 1) · `--z3 color-mix(in oklch, var(--ss) 75%, black 25%)` (Tempo, Hero-Leistungsskala — abgeleitetes Token, keine neue Basisfarbe; ein Mix aus `--z2`+`--ss` kippt in sRGB/OKLab auf Grau/Taupe, weil Blau/Orange nahezu komplementär sind, deshalb stattdessen ein abgedunkelter `--ss`-Ton) · `--ss #e08a3c` (Sweet Spot/Akzent/Plan 2) · `--thr #d94f4f` (Schwelle/Warnung) · `--vo2 #a24ad0`
- Typografie: **Sora** (Display/Zahlen, `--font-disp`) · **IBM Plex Mono** (Labels/Meta, `--font-mono`) · **Inter** (Fließtext, `--font-body`) — seit der Typeset-Etappe 2026-08-19 selbst gehostet über `@fontsource/*` (Import in `app/src/main.tsx`, nur die tatsächlich genutzten Gewichte: Sora 400/600/700, IBM Plex Mono 400/500/600, Inter 400/500/600), keine Google-Fonts-CDN-Anfrage. Zuvor lief die App faktisch auf System-Fallbacks (kein Font-Link in `app/index.html`) — dieser Zustand ist damit behoben, nicht mehr offen.
- Pills überall interaktiv (`--pill`): Tabs (aktiv = SS-Fill mit dunklem Text `#17110a`), Athleten-Toggle (aktiv = Z2), Unit-/Plan-Toggle
- Hero-Signaturen: **interaktive Leistungsskala** (Coggan-Zonen Z1–Z5 aus `app/src/core/zones.js::computeZones`, Sweet-Spot-Overlay `sweetSpotBand` statt eigenem Segment, Skalenmax `scaleMaxWatts` = Z5-Ende, What-if-Slider für die Ziel-FTP-Vorschau, Pins FTP/eFTP/Ziel via `app/src/core/ftp-progress.js::pinPercent`), **FTP-Fortschrittsring** (Z2→SS-Gradient, Fortschritt `ringProgress(eFTP, athleteCfg.seasonStartFtp ?? ftpMeasured, athleteCfg.ftpGoal)` — athletenagnostisch aus `athleteConfig(id)` in `app/src/config.ts`), **Meilensteinliste** (`buildMilestones`, nur vorhandene Werte) und **Session-Karte** (nächste Einheit via `nextPlannedSession`, Watt-Ziel/Dauer/TSS-Schätzung nur bei strukturiertem `workout` via `workoutWattRange`/`workoutDurationMinutes`/`estimateSessionTSS`)
- Anders als in der Vanilla-Fassung ist keine JS-gespiegelte Farbpalette mehr nötig:
  React rendert echtes DOM-SVG, `var(--token)` funktioniert dort direkt in `stroke`/`fill`
  (s. `app/src/charts/*.tsx`) — ein Palettenwechsel ändert nur noch `tokens.css`.
- `prefers-reduced-motion` wird respektiert (globale CSS-Regel + Ring-Transition)

## Wichtige Konventionen

**Datenschutz (HÖCHSTE Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
- Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, WEATHER_LAT_2, WEATHER_LON_2
- Wetter-Forecast wird serverseitig in der Action berechnet → nur Wetterwerte in rides.json
- Keine echten Namen von Athleten in Code, Kommentaren, Config, Templates oder Commit-Messages —
  intern `athlete1`/`athlete2`, in der UI die selbstgewählten Pseudonyme
  (GitHub-Handles) "Stuhlsen"/"hc_diZee" (`app/src/config.ts` → `athletes[].name`)

**Git-Workflow:**
```powershell
git add <dateien>
git commit -m "..."
git sync   # nur von main aus laufen lassen — s. Warnung unten
```
- PowerShell: KEIN `&&` zwischen Befehlen — jeweils eigene Zeile
- Bei Konflikten mit Action-Auto-Commits: `git fetch origin` dann `git push --force-with-lease origin main`
- Zeilenenden: `.gitattributes` erzwingt LF im Repo (`* text=auto eol=lf`)
- **Versions-Tag für Docker-Images:** Nach einem Push nach `main`, der
  `app/`, `scripts/` oder `supabase/` ändert (löst `publish-images.yml`
  aus), zusätzlich einen `vX.Y.Z`-Tag setzen und pushen
  (`git tag vX.Y.Z` / `git push origin vX.Y.Z`) — Patch bei Bugfixes, Minor
  bei neuen Features, Major bei Breaking Changes. Grund: Der Produktivserver
  zieht bewusst nie `:latest` (`docs/fahrplan-3-docker-umbau.md`, Fenster
  DKR4), sondern eine feste Version — ohne neuen Tag bleibt ein Fix dort
  unsichtbar, auch wenn `main` längst aktualisiert ist. Bleibt ein manueller
  Schritt mit Rückfrage bei Alex (welche Versionsstufe) — kein automatisches
  Taggen ohne Bestätigung, ein neuer Tag ist ein sichtbarer, kaum
  rückholbarer Schritt (löst einen echten Image-Build/-Push aus). Derselbe
  `v*`-Tag löst in `publish-images.yml` zusätzlich einen `release`-Job aus,
  der per `gh release create --generate-notes` automatisch ein GitHub
  Release mit Auto-Notes anlegt — kein separater manueller Schritt nötig.

**`git sync` — was der Alias wirklich tut (nicht nur fetch+push):**
```
git fetch origin
git checkout origin/main -- data/adjustments.json
git checkout origin/main -- data/subjective.json
git add data/adjustments.json data/subjective.json
git diff --staged --quiet || git commit -m 'chore: preserve browser-written data'
git push --force-with-lease=main:<lokaler main-HEAD vor dem Fetch> origin main
```
Holt zuerst die beiden Dateien, die die Action bewusst vor Überschreiben schützt
(s. „Bekannte Eigenheiten"), aus `origin/main` in den aktuellen Arbeitsbaum, committet
sie bei Bedarf mit der festen Message „chore: preserve browser-written data", und
pusht danach die lokale `main`-Branch-Referenz — **unabhängig davon, welcher Branch
gerade ausgecheckt ist**.

**Zwingend nur von `main` aus laufen lassen.** Der Alias weigert sich (Branch-Guard),
wenn `HEAD` nicht `main` ist — das ist kein Stilhinweis, sondern eine echte Sicherung:
am 25.07.2026 lag lokales `main` wochenlang veraltet herum (seit Einführung des
`dashboard-2.0`-Branches nie wieder ausgecheckt/aktualisiert), `git sync` wurde versehentlich
von `dashboard-2.0` aus aufgerufen und hätte damit `origin/main` um ~70 Commits (u. a. echte
Befinden-/Plan-Einträge) zurückgesetzt. `--force-with-lease=main:<erwarteter Wert>` (statt
dem bloßen `--force-with-lease` ohne Erwartungswert) lässt den Push zusätzlich hart fehlschlagen,
wenn lokales `main` seinerseits hinter `origin/main` zurückliegt — bloßes `--force-with-lease`
prüft nur gegen den `origin/main`-Tracking-Stand direkt nach dem vorangegangenen Fetch-Schritt
im selben Alias-Lauf, das schützt gerade NICHT vor einem seit längerem veralteten lokalen `main`.
Vorfall + Wiederherstellung: s. Commit-Historie um den 25.07.2026, kein separates Dokument.

**JavaScript/TypeScript:**
- Es gibt kein globales `Data`-Singleton mehr (Vanilla-Ära). Zustand lebt in
  React-Query-Caches, Aufrufstellen sind die Hooks unter `app/src/api/hooks/`
  (z. B. `useActiveAthlete`, `useRides`, `usePlanCards`) statt eines
  gemeinsamen Objekts, das jedes Modul direkt liest.
- ISO-Kalenderwochen-Aggregation für beide Athleten läuft weiter über
  `app/src/core/aggregate.js` (portiert, unverändert). Athlet 2s Rides tragen
  weiterhin bewusst kein `week`/`phase` (s. "Bekannte Eigenheiten") — das
  betrifft nur den Plan-Bezug einzelner Ride-Objekte, nicht die Wochen-Aggregation selbst.
- Chart-Erklärtexte sind athletenabhängig, leben jetzt als Teil der jeweiligen
  Feature-Komponente statt einer zentralen `updateChartExplainers()`-Funktion.
- Berechnung gehört nach `app/src/core/` (mit Test), Rendering nach
  `app/src/charts/`, `app/src/components/` bzw. dem UI-Teil von `app/src/features/*`
  — nicht mischen.

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
WEATHER_LAT_4           WEATHER_LON_4
SYNC_PUSH_TOKEN
SUPABASE_URL                       SUPABASE_ANON_KEY
SUPABASE_ATHLETE1_EMAIL            SUPABASE_ATHLETE1_PASSWORD
SUPABASE_ATHLETE4_EMAIL            SUPABASE_ATHLETE4_PASSWORD
```

Athlet 4 („bentastiic"): **kein** `INTERVALS_API_KEY_4` — der intervals.icu-Key
kommt aus der Supabase-Tabelle `intervals_credentials` (vom Athleten in Settings
eingetragen), der Sync liest ihn über den `SUPABASE_ATHLETE4_*`-Login. Fehlen
`SUPABASE_ATHLETE4_EMAIL/PASSWORD`, wird der Athlet-4-Block komplett übersprungen.

`SYNC_PUSH_TOKEN` (seit 22.08.2026): Fine-grained PAT von Alex statt des
Standard-`GITHUB_TOKEN` — `main` hat Branch Protection, der Bot-Token allein
kann seitdem nicht mehr pushen. Die vier `SUPABASE_*`-Einträge sind für den
Sync-Job selbst (Prod-Supabase, nur Athlet 1, s. „Datenquellen-Mix" oben) —
nicht zu verwechseln mit den athletengebundenen `SUPABASE_ATHLETE1/2_*` bzw.
`SUPABASE_TRAINER_*`-Testvars aus dem RLS-Testabschnitt weiter oben, die nur
lokal in `.env` für `tests/supabase-rls.test.js` gebraucht werden. Details zu
allen dreien: `.github/workflows/sync-data.yml` (Kopfkommentar).

## Chart-Label-Konvention (Überlappungsschutz)

X-Achsen- und Wert-Labels NIEMALS pro Datenpunkt/Balken ohne Ausdünnung
zeichnen — bei Athlet 2 (30+ Kalenderwochen) überlappt sonst die Achse.
Pflicht für jedes Chart mit variabler Datenmenge:
- `pickLabelIndices(xs, minPx)` aus `app/src/core/chart-scale.js` (pure,
  getestet in `chart-scale.test.js`): Mindestabstand, letzter Punkt garantiert
  und kollisionsfrei. Richtwerte: 40px für Wochen-Balken, 55–60px für Datums-Labels.
- Wochen-Keys über `weekDisplayLabels()` (`app/src/core/week-labels.js` bzw.
  `aggregate.js`) kürzen ("2026-KW27" → "KW27", Jahreswechsel wird markiert,
  Monate → "MM/JJ").
- Wert-Labels auf Balken bei Pitch < ~22px nur auf den Label-Indizes zeichnen;
  In-Balken-Labels zusätzlich per Balkenbreite gaten (siehe Wetter-Chart).
- Keine "Modulo-Step + letzter immer"-Guards mehr — die erzeugen End-Kollisionen.
- Segment-/Phasen-Labels an Divider-Linien zentriert im eigenen Segment
  zeichnen, nie an den Rändern der Divider-Linie (zwei benachbarte Rand-Labels
  kollidieren, sobald ein Segment schmal wird — z. B. eine kurze Übergangswoche).
  Die Vanilla-Fassung hatte dafür ein `fitsLabel(spanPx, text)` in `ui/charts/base.js`
  — **nicht mit nach `app/src/core/chart-scale.js` portiert** (`CompareChart.tsx`
  verzichtet laut eigenem Kommentar bewusst auf eine `fitsLabel()`-Segment-
  beschriftung mitten in der Kurve). Vor einer Änderung an Divider-Labels im
  React-Code prüfen, ob das Kollisionsproblem dort überhaupt noch auftreten kann
  (z. B. weil die Divider selbst mit dem Umbau „Plan 1/2 → Kalenderwoche"
  entfallen sind) und ggf. neu entscheiden, statt eine nicht vorhandene Funktion
  vorauszusetzen.
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

Einheitlich **DD.MM** für Achsen-/Label-Text (`fmtDate(iso)`, `app/src/core/format.js`)
und **DD.MM.JJJJ** für Tooltips, wo das Jahr zur Eindeutigkeit gebraucht wird
(`fmtDateFull(iso)`, `app/src/core/format.js`) — DD.MM ist die Mehrheitskonvention im
restlichen Dashboard (Fahrtenbuch, `normalizeRide`/`normalizeWellness`).
Achsenlabels über `fmtDate()` erzeugen, nicht `iso.split("-")`/`iso.slice(5)`
selbst zusammensetzen — das bleibt gültig, auch wenn die einzelnen Charts
seit dem React-Umbau eigene `<text>`-Elemente statt einer gemeinsamen
`xLabel()`-Zeichenfunktion verwenden (Font-Größe/-Ausrichtung über gemeinsame
Konstanten in `app/src/charts/`, nicht mehr über einen einzigen Helper).

## Chart-Merge-Konvention

Neue Auswertungen möglichst in bestehende Charts integrieren statt neue Boxen
anzulegen (Chart-Masse begrenzen): Belastungswächter lebt IM TRIMP-Chart
(`TrimpLoadChart.tsx`, Ramp-Linie + ⚠), EF-Trend IM Effizienz-Chart
(`EfficiencyChart.tsx`), Blockvergleich IM Power-Curve-Chart (`PowerCurveChart.tsx`,
Toggle), Kadenz-Coach als Chips ÜBER dem Kadenz-Chart (`CadenceChart.tsx`). Der
Konsistenzkalender (`ConsistencyCalendar.tsx`) hat die Wochentags-Heatmap ERSETZT
(Wochentagszähler in den Zeilenlabels). Explainer-Texte bei Chart-Änderungen immer
mitziehen — sie leben jetzt als Teil der jeweiligen Feature-Komponente
(`app/src/features/*`, für beide Athleten-Varianten prüfen), nicht mehr zentral
in `index.html`/`app.js`.

## Bekannte Eigenheiten

**Gilt weiter unverändert (Datensync, `scripts/`/`.github/workflows/` — vom
React-Umbau nicht berührt):**

- `subjective.json` und `adjustments.json` werden vom Action-Workflow vor
  Überschreiben geschützt (immer Remote-Stand holen vor Commit)
- Fahrten am selben Datum werden nach `startTime` (start_date_local) sortiert;
  Plan-1-Fahrten (Notion) haben kein startTime → dort kein Tiebreaker
- Athlet 2 hat aus intervals.icu nur Fahrten mit gültiger Distanz erfasst;
  distanzlose/unklassifizierte Aktivitäten werden bewusst ausgeschlossen
- intervals.icu `/power-curves`: `oldest`/`newest` allein grenzen die
  Kurve NICHT auf den Zeitraum ein — ohne `curves`-Parameter liefert die
  API ein Preset (beobachtet: `id: "1y"`, ein Jahr rückwärts ab `newest`,
  `oldest` wird ignoriert). Für eine zeitraumgebundene Kurve (Power-Curve-
  Blockvergleich, `getPlan2Blocks()`) ist `curves=r.<von>.<bis>` (intervals.icu-
  Range-Spezifizierer) zwingend, s. `powerCurveQuery()` in
  `scripts/lib/intervals.js`. Ohne diesen Parameter sind alle Blockkurven
  praktisch identisch zur Gesamtkurve (nur der Anker-Zeitpunkt unterscheidet
  sich) — der Blöcke-Toggle im Power-Curve-Chart zeigt dann keine sinnvoll
  unterscheidbaren Kurven.
- Pages-Deploy: `sync-data.yml` hat GETRENNTE Jobs `sync` (Daten generieren,
  `app/dist` bauen, Artefakt-Upload) und `deploy` (`deploy-pages`, `needs: sync`).
  NICHT wieder zusammenlegen — Upload + Deploy im selben Job dupliziert bei
  einem Re-Run das `github-pages`-Artefakt („Multiple artifacts… count is 2").
  Getrennt re-runnt „Re-run failed jobs" nur den Deploy, kein zweiter Upload.
- `zoneTimes`/`eftp` kommen aus intervals.icu-Feldern (`icu_zone_times`,
  `icu_eftp`) — beide Formate werden normalisiert, mit Degradation samt
  Hinweistext, falls sie in der API-Antwort fehlen. Aktuellen Verifikationsstand
  in `docs/offene-punkte.md` prüfen, nicht hier — der ändert sich mit jedem
  echten Sync-Lauf.
- eFTP-Historie mergt `icu_eftp` (je Fahrt) mit dem Wellness-Tageswert aus `sportInfo`
  (`scripts/lib/wellness.js`). Wellness trägt zusätzlich Gewicht/Kalorien/Hydration/
  Körperfett; welche Felder real befüllt sind, zeigt `logWellnessCoverage` im
  Sync-Log — die „Regeneration & Körper"-Sektion (`app/src/core/body.js::availability()`)
  blendet sich datengetrieben ein (≥5 Punkte / 30 Tage).
- `mapActivity2()` (`scripts/lib/map-activity.js`) setzt für Athlet-2-Fahrten
  bewusst `week: null, phase: null` — der Plan-Bezug läuft ausschließlich über
  die eigenständigen `plannedSessions`/`adjustments`-Felder in rides-2.json,
  NICHT über `ride.week`.
- `npm install` (für Fallow) bzw. der Skills-Installer legen `.agents/`, `agent/`,
  `data/skills/` und `skills-lock.json` an — generierte Tooling-Artefakte, kein
  Quellcode, bewusst in `.gitignore` (nicht committen, auch nicht bei `git add -A`).

**Ported/angepasst mit dem React-Umbau (Pfad hat sich geändert, Konzept meist gleich):**

- Die frühere Race Condition (Frontend committed per-Fahrt-Befinden direkt via
  GitHub-API in `subjective.json`, parallel zum Sync-Workflow) betrifft
  `app/src` nicht mehr: das editierbare Befinden-/Feel-Dropdown im Fahrtenbuch
  gab es laut Kopfkommentar in `app/src/features/logbook/LogbookPage.tsx`
  schon im letzten Vanilla-Stand nicht mehr (bewusst nicht portiert, kein
  GitHub-API-Code irgendwo unter `app/src`). `sync-data.yml` schützt
  `subjective.json`/`adjustments*.json` trotzdem weiter vor Überschreiben
  (Rebase-Retry-Schleife, 3 Versuche) — harmlose Vorsichtsmaßnahme für reinen
  Archivbestand, kein aktiver Schreibpfad mehr dahinter.
- Phase-Key `"Taper"` wird zwischen Plan 2 (Athlet 1) und Athlet 2s Plan geteilt
  (identische Farbe) — `phaseColor()` in `app/src/config.ts` ist die einzige
  Stelle, die `PHASES[phase].color` liest; verwendet u. a. in
  `app/src/features/planning/PlanningPage.tsx`. Deshalb brauchen "Basis"/
  "Aufbau"/"Rennhärte" (Athlet 2, keine Namensüberschneidung mit Plan 1/2)
  auch kein Präfix.
- Athlet-2-Workout-Objekte (`scripts/lib/plan-athlete2.js`) tragen nur `watts`,
  kein `pct` (% FTP) wie bei Athlet 1 — die Planungstab-Kartenkomponente in
  `app/src/features/planning/PlanningPage.tsx` fällt für die
  Intervall-Beschriftung auf `watts` zurück, wenn `pct` fehlt.
- Athlet 2s Planungstab (GFNY Bremen 2026) ist read-only: Gate über
  `canWriteForAthlete()`/`isSelfAthlete()` in `app/src/api/write-authorization.ts`
  statt eines lokalen `_canEdit()` in einem UI-Modul. Die Trainingskarten selbst
  leben inzwischen in der Supabase-Tabelle `plan_cards` (RLS-geschützt) —
  `data/adjustments.json`/`adjustments-2.json` sind seit dieser Migration nur
  noch read-only Archiv der alten Planungsdaten, keine aktive Datenquelle mehr.
- Ruhetage sind seit Fahrplan 6 (`docs/fahrplan-6-ruhetag-planwochen-modell.md`,
  RUH1–RUH6) **abgeleitet, keine `plan_cards`-Zeilen mehr**: Ein Ruhetag ist
  „Tag in einer aktiven Planwoche, der laut Plan-Wochen-Modell
  (`app/src/core/plan-week-model.js` + `scripts/lib/core/`-Kopie) kein
  Trainings-Slot ist und keine aktive Karte trägt". Die Erzeugung
  (`plan-rest-days.js`, `fillRestDays()`, `add-rest-day-cards.js`) ist
  entfallen, die migrierten Alt-Zeilen sind aus dev + prod gelöscht
  (`scripts/delete-rest-day-cards.js`, RUH6). Angezeigt werden Ruhetage
  weiterhin für BEIDE Athleten im Planungstab (Mi/So), jetzt datengetrieben
  aus dem Modell; sie zählen nie als „verpasst" (ein nicht gefahrener Ruhetag
  ist Erfüllung, kein Ausfall — `isNonTrainingCard`/`isRestSlot`-Konvention).
  Athlet 2s „Ausrüstung checken" ist bewusst `typ:"Notiz"` (echte Aufgabe,
  kein freier Tag) und bleibt eine Karte.

**Nicht mehr zutreffend, ersatzlos entfallen mit dem React-Umbau:** die frühere
gegenseitige Import-Beziehung zwischen `ui/table.js` und `ui/planned.js` sowie
alle Verweise auf das globale `Data`-Objekt (s. „Wichtige Konventionen").

## Playwright-MCP — Nutzungskonvention

> **Hintergrund:** Playwright-MCP wurde in Phase 3 projektlokal eingerichtet (`.mcp.json`)
> für echte Browser-Verifikationen, die sich nicht durch Unit-Tests abdecken lassen
> (Pointer-Gesten, Timing-Races, CSS-Rendering). Diese Regel schreibt fest, was seitdem
> nur als Absicht existierte, aber nie dokumentiert wurde.

### Grundsatz: Unit-Test vor Browser

Playwright ist das **letzte Mittel**, nicht der Standard-Reflex beim Prüfen einer
Änderung. Vor jedem Playwright-Einsatz gilt die Frage: *Lässt sich das auch als reine
Funktion in Vitest (`app/src/**/*.test.ts(x)`) oder `tests/*.test.js` (Repo-Root) prüfen?*
Fast immer lautet die Antwort ja — dieses Projekt hat für genau diesen Zweck eine große,
schnelle Testsuite in `app/src/core/` und `app/src/api/`.

**Playwright ist gerechtfertigt für:**
- echte mehrstufige Pointer-Gesten (Drag & Drop, Brush-Ziehen) — nicht als Ein-Schritt-Kurzschluss simulierbar
- Race Conditions, die nur im echten Browser-Timing auftreten
- CSS-/Layout-Rendering, das sich nicht durch eine reine Funktion abbilden lässt
- End-zu-Ende-Verifikation eines abgeschlossenen Features gegen `dashboard-dev`, **einmalig am Ende**, nicht iterativ währenddessen

**Playwright ist NICHT gerechtfertigt für:**
- "mal schauen ob es geklappt hat" nach jeder kleinen Code-Änderung
- Dinge, die ein Unit-Test genauso beweist (Berechnungen, Zustandsübergänge, Datenformate)
- wiederholtes Nachprüfen während des Bauens — ein Playwright-Lauf am Ende eines
  abgeschlossenen Schritts ersetzt zehn während des Schritts

### Snapshot statt Screenshot

**`browser_snapshot` verwenden, nicht `browser_screenshot`**, wo immer die Aufgabe es
zulässt. Der Accessibility-Snapshot ist ein Text-/Baum-Artefakt und typischerweise eine
Größenordnung kleiner im Kontext als ein gerendertes Bild. Screenshot nur, wenn es
tatsächlich um visuelles Aussehen geht (Farben, Layout-Politur), das der Snapshot nicht
abbilden kann — nicht standardmäßig für Funktionsprüfungen.

### Session-Disziplin

Eine Playwright-Session pro Verifikationsschritt, danach schließen. Nicht über viele
Chat-Turns hinweg offen halten und wiederholt abfragen — jeder zusätzliche Turn in einer
offenen Session trägt den bisherigen Seitenzustand im Kontext mit.

### Bei Unklarheit: fragen

Wenn nicht klar ist, ob eine Prüfung Playwright braucht oder ein Unit-Test reicht: fragen,
nicht vorsichtshalber beides machen.