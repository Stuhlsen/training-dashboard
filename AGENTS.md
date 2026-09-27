# Training Dashboard — Projektkontext

Persönliches Radsport-Trainingsdashboard, selbst-gehostet als Container-Verbund
auf apps01 (Tony) — kein GitHub Pages mehr.
Repo: github.com/Stuhlsen/training-dashboard
Live: training-dashboard.clear-solutions-it.com

Produktion (apps01) läuft **Podman**, lokal für den Vor-Commit-Check nutzt Alex
**Docker Desktop**. Beide lesen dieselben OCI-Images; wo unten „Docker-Image"
steht, ist das OCI-Image gemeint.

## Stack

Zwei getrennte Teile im selben Repo, mit eigenen Tests und eigenem CI-Job:

- **Repo-Root** (`scripts/`, `tests/`) — reines Node.js, kein Framework. Liest
  intervals.icu/Open-Meteo (+ die eingefrorene Plan-1-Historie,
  `scripts/lib/plan1-history.js`) und schreibt `data/*.json`. Kein
  `npm install` nötig (einzige Ausnahme: `fallow` als `devDependency`, s.
  „Codebase-Qualität"). Tests mit dem eingebauten `node:test`.
- **`/app/`** — Vite + React + TypeScript, die einzige Oberfläche. Eigenes
  `npm install` gegen `app/package-lock.json`. Tests mit Vitest, zwei Projekte
  (`core` unter Node, `app` unter jsdom — s. `app/vite.config.ts`). Details:
  `app/README.md`.

GitHub Actions: `ci.yml` (Root: npm test + ESLint + Fallow), `ci-app.yml`
(`/app/`, nur bei Änderungen unter `app/**`: Vitest, ESLint, Build),
`publish-images.yml` (baut vier GHCR-Images — frontend, sync, migrate,
admin-api — Push nach `main` = `latest`, `v*`-Tag = versioniert + GitHub
Release, PR = nur Bauen), `check-version-tag.yml` (informational, kein
`exit 1`: warnt, wenn `app/`/`scripts/`/`supabase/`/`admin-api/` ohne neuen
`v*`-Tag auf `main` landen — apps01 deployt nur gepinnte Tags, nie `latest`).
Der Datensync läuft **nicht** in Actions, sondern als Dauer-Container auf
apps01 (`sync-data.yml` ist nur noch `workflow_dispatch`-Fallback).

`.github/dependabot.yml` prüft wöchentlich npm-Pakete, Docker-Images und
Actions-Versionen und öffnet PRs — löst nicht automatisch. Deckt nur ab, was
im Repo selbst gepinnt ist; Tonys eigene Pulls auf apps01 laufen über sein
eigenes Tooling.

**Node ≥ 24 für den Root-Teil zwingend:** `npm test` läuft mit
`--experimental-test-module-mocks`; die im Repo genutzte `{ exports: {...} }`-
Kurzform von `mock.module()` ist unter Node 22.23.1 nicht verlässlich
unterstützt (`ci.yml` scheiterte damit reproduzierbar). `ci.yml`/`ci-app.yml`/
`sync-data.yml` pinnen `node-version: 24`.

## Befehle

```powershell
# Repo-Root: Unit-Tests (eingebauter Node-Test-Runner, kein Install nötig)
npm test

# Repo-Root: Datensync lokal ausführen (braucht .env mit Secrets)
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

Lokale `.env` (nicht committen) für `npm run sync`: `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` (anonymer
`session_formats`-Read). Details zum Sync-Credential-Modell, Secrets-Layout
und Datenquellen-Mix: `.claude/skills/sync-pipeline`. `/app/` braucht keine
eigene `.env` — Supabase-URLs/anon-Keys stehen (bewusst, RLS-geschützt) in
`app/src/api/supabase/config.ts`.

## Workflow vor jedem Commit

1. Bei Root-JS-Änderung: `node -c <datei>` — muss ohne Fehler durchlaufen
2. Bei `/app/`-Änderung: `npm run build` (enthält `tsc -b`, deckt Typfehler ab)
3. `npm test` im jeweils betroffenen Teil (Root und/oder `/app/`) — alle Tests
   müssen grün sein (CI prüft beides getrennt)
4. Betroffene Ansicht lokal prüfen — `npm run dev` (`/app/`) für schnelle
   Zwischenstände während der Arbeit, aber als **letzter Check vor dem
   Commit-Vorschlag zwingend zusätzlich gegen den lokalen Docker-Container**
   (`docker compose -f docker-compose.dev.yml up -d`, Frontend auf
   `http://localhost:8080` — Details `planning/docs/docker-lokal-einrichten.md`).
   Grund: nur der Container durchläuft den echten Produktions-Build
   (Vite-Build + nginx + `window.__RUNTIME_CONFIG__`-Laufzeitpfad) — der
   Vite-Dev-Server mit HMR kann Fehler verdecken, die erst im gebauten
   Static-Bundle auftreten.
5. Commit mit Konvention (siehe unten)
6. `git sync`

`data/*.json` NICHT committen (`.gitignore`) — der apps01-Sync-Container
schreibt sie direkt ins mit dem Frontend geteilte Volume.

## Commit-Konvention

Prefix + knappe Beschreibung, **auf Englisch**. Grund: `publish-images.yml`
generiert bei jedem `v*`-Tag den GitHub-Release-Changelog automatisch aus den
Commit-Subjects — soll für GitHub-/Portfolio-Besucher ohne Übersetzung lesbar
sein. Betrifft NUR Commit-Nachrichten — Code-Kommentare, Doku und UI-Texte
bleiben deutsch.
- `fix:`    — Bugfix
- `feat:`   — neues Feature
- `design:` — reine CSS-/Styling-Änderung
- `docs:`   — Dokumentation (README, AGENTS.md)
- `chore:`  — Wartung, Config, Workflow
- `test:`   — Tests hinzugefügt/geändert

## Architektur / Schichtenregel

`/app/` ist eine normale Vite-App: **ein** Einstiegspunkt (`app/src/main.tsx`
→ `App.tsx`), React-Routing/Gates statt Tab-Umschaltung per Hand. Die
Root-Route `/` ist eine öffentliche Landingpage (`app/src/features/landing/`),
das Dashboard liegt unter `/app/*`. Alte Pre-Umbau-Routen (`/login`,
`/planning`, `/log`, …) werden per `LegacyRedirect` transparent umgeschrieben.

**Schichtenregel** (Default: importiere nie höher):
- `app/src/core/` — reine Berechnung, greift NIEMALS auf `document`, `window`,
  `localStorage` oder `fetch` zu. Details: `app/src/core/README.md`.
- `app/src/api/` — I/O-Grenze. Kapselt JSON-Pipeline (`api/pipeline.ts`) und
  Supabase-Adapter (`api/supabase/`, eine Datei je Tabelle). Details:
  `app/src/api/README.md`.
- `app/src/hooks/`, `app/src/features/*` — Orchestrierung + Zustand, lädt über
  `app/src/api/` (React Query).
- `app/src/components/`, `app/src/charts/`, `app/src/features/*` (UI-Teil) —
  DOM/SVG-Rendering, ruft `api/`/`hooks/` auf.
- `app/src/sports/` — austauschbare Zonen-/Metrik-Logik pro Sportart. Details:
  `app/src/sports/README.md`.

| Schicht | darf importieren | darf NICHT |
|---------|---|---|
| `core/` | `sports/` (Werte) | sonst nichts |
| `api/` | `core/` (nur Typen) | `features/`, `components/` |
| `hooks/`, `features/*` (Orchestrierung) | `core/`, `api/` | — |
| `components/`, `charts/`, `features/*` (UI-Teil) | `core/`, `hooks/`, `features/*` | `api/` direkt (schmale, bewusste Ausnahme für globale Chrome-Komponenten: `config`/`auth`/`useActiveAthlete`/`useAthleteSports`/`useEffectiveSport`, s. `EnvBadge.tsx`/`Layout.tsx`/`ProtectedRoute.tsx`/`Footer.tsx`/`AppBackground.tsx`) |

Typen: **TypeScript** in `app/`; `app/src/core/` bleibt JS + JSDoc (per
`allowJs` eingebunden). Zentrale Domänentypen: `app/src/api/types.ts` bzw.
`app/src/types.js`.

## Fehlerbehandlung / Result-Konvention

Fehlbare Operationen (Laden, Supabase-Write, intervals.icu-Push) geben
einheitlich `{ ok: true, ... }` oder `{ ok: false, error: { code, message } }`
zurück (Typ `Result`; Codes: HTTP, NETWORK, TOKEN_INVALID, SCHEMA, NO_DATA,
UNKNOWN). In `app/src/api/` gilt die Konvention nach außen weiter,
`api/result.ts` ist die Umschaltstelle zu React Querys wurf-basiertem
Fehlerkanal. UI-Aufrufstellen prüfen `result.ok`/`isError`. Keine rohen
`console.*`-Aufrufe in neuen Dateien.

## Schema-Validierung

`app/src/core/validate.js` prüft geladene `rides.json`-Payloads zur Laufzeit.
**Neues Feld im Datenformat → an DREI Stellen ergänzen:**
1. `scripts/` (Erzeugung), 2. `app/src/core/validate.js` (Schema),
3. `app/src/types.js` (JSDoc-Typ). Abweichungen werden als Warnung geloggt;
fehlende/leere `rides` sind fatal.

## Codebase-Qualität (Fallow)

`npx fallow` analysiert das Repo als System (Dependency-Graph): Health Score,
Circular Deps, Duplication, Dead Code, Complexity Hotspots. Deterministisch,
keine KI im Analyzer.

- **CI**: eigener Job `code-quality` in `ci.yml`, **non-blocking**
  (`continue-on-error: true`, Schwellwerte noch nicht kalibriert). Report als
  Artefakt (`fallow-report.json`, 30 Tage).
- **Lokal**: `npx fallow health --score` für den schnellen Check, `--hotspots
  --circular-deps` für Details — Circular Deps kann direkt die Schichtenregel
  verletzen.
- **Skill**: `.claude/skills/fallow` — erlaubt Anfragen wie "check code health"
  oder "find circular dependencies" direkt in Claude Code.
- Ein Diff-scoped `fallow audit --base <ref>` ist für die PR-Bewertung
  aussagekräftiger als der Vollrepo-Score; Kalibrierung neuer Schwellwerte
  steht weiter aus.

## Supabase — Dev/Prod (Sicherheitshinweis)

**Zwei „prod"-Backends, nicht verwechseln:** `dashboard-prod` auf
`supabase.co` ist eine Altlast, die Live-Seite nutzt sie **nicht**. Echte
Produktion ist der **apps01-Self-Host-Stack**
(`https://training-dashboard.clear-solutions-it.com`). Migrationen und Seeds
gehören an apps01, nicht an `supabase.co`. `dashboard-dev` bleibt der Test-/
CI-Zielpunkt. Volles Migrations-/RLS-Test-/Secrets-Detail:
`.claude/skills/sync-pipeline`.

## Athleten & Trainingspläne

Vier Athleten (`athlete1`–`athlete4`), Stammdaten/Pseudonyme/FTP-Werte/
Sportarten **ausschließlich** in `app/src/config.ts` → `athletes[]` — hier
nicht duplizieren. Trainingsplan-Definitionen (Plan 1/2, GFNY Bremen,
Einsteiger-Vorlage) leben in `scripts/lib/plan*.js`, jede Datei mit
Kopfkommentar zum jeweiligen Plan. Schreibzugriff im Planungstab hängt für
**alle** Athleten am selben Gate `canWriteForAthlete()`/`isSelfAthlete()`
(`app/src/api/write-authorization.ts`) — kein athletenabhängiger
Sonderfall mehr. Onboarding neuer Athlet: Settings → intervals.icu-Key +
Athlete-ID + Standort eintragen, s. `.claude/skills/sync-pipeline`.

## Design

Konzept 5 (Kachel-Anatomie × Zonen-Farbsystem). Tokens in
`app/src/styles/tokens.css` (Namen stabil halten, Farbe = Bedeutung, nie
Deko). Volltext, Komponenten-Beispiele und die Ghost-Button-Regel für
UI-Elemente über dem Seitenhintergrund: `DESIGN.md`.

## Wichtige Konventionen

**Datenschutz (HÖCHSTE Priorität):**
- Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren. Die groben
  Koordinaten liegen RLS-geschützt und serverseitig auf 2 Nachkommastellen
  gerundet (~1,1 km Unschärfe) in `athlete_sync_config` — owner-only, kein
  anon-Grant, nie über einen Frontend-Lesepfad ausgeliefert.
- Wetter-Forecast wird serverseitig im Sync berechnet → nur Wetterwerte in
  `rides.json`, nie Koordinaten.
- Keine echten Namen von Athleten in Code, Kommentaren, Config, Templates oder
  Commit-Messages — intern `athlete1`–`athlete4`, in der UI die
  selbstgewählten Pseudonyme aus `app/src/config.ts` → `athletes[].name`.

**Git-Workflow:**
```powershell
git add <dateien>
git commit -m "..."
git sync   # nur von main aus laufen lassen — s. Warnung unten
```
- PowerShell: KEIN `&&` zwischen Befehlen — jeweils eigene Zeile
- Bei Konflikten mit `origin/main`: `git fetch origin` dann
  `git push --force-with-lease origin main`
- Zeilenenden: `.gitattributes` erzwingt LF im Repo

**`git sync` — Branch-Guard ist eine echte Sicherung, kein Stilhinweis.** Der
Alias (`git fetch` → `git merge-base --is-ancestor origin/main main` →
`git push --force-with-lease origin main`) weigert sich, wenn `HEAD` nicht
`main` ist, und bricht ab, wenn lokales `main` hinter `origin/main`
zurückliegt. Beides schützt gegen denselben Vorfall: am 25.07.2026 wurde
`git sync` versehentlich von einem veralteten Feature-Branch aus aufgerufen
und hätte `origin/main` um ~70 Commits zurückgesetzt (s. Commit-Historie um
dieses Datum).

**Versions-Tag für Docker-Images:** Ein PR, der `app/`, `scripts/`,
`supabase/` oder `admin-api/` ändert, wird gemergt UND getaggt in einem
Schritt: `git merge-tag <pr-nummer> <version>` (globaler Git-Alias, ruft
`scripts/git-merge-tag.js` auf — echte, versionierte Datei, kein reiner
Alias-Einzeiler). Mergt den PR, holt per `--ff-only` den neuen `main`-Stand
(bricht sauber ab statt zu überschreiben, falls lokal divergiert), setzt
`vX.Y.Z` genau auf diesen Commit und pusht den Tag. Patch/Minor/Major bleibt
Alex' eigene Einschätzung. `check-version-tag.yml` warnt nur (kein
`exit 1`) bei fehlendem Tag — verhindert keinen Merge. Der Produktivserver
zieht bewusst nie `:latest`, sondern eine feste Version.

**JavaScript/TypeScript:**
- Kein globales `Data`-Singleton mehr — Zustand lebt in React-Query-Caches,
  Aufrufstellen sind Hooks unter `app/src/api/hooks/`.
- Berechnung gehört nach `app/src/core/` (mit Test), Rendering nach
  `app/src/charts/`/`app/src/components/`/UI-Teil von `app/src/features/*`
  — nicht mischen.

**Typ-Inferenz (`scripts/lib/map-activity.js`):**
`inferTypFromIF(np, min, ftp)` — NP÷FTP = IF, dann Dauer als zweites
Kriterium: IF < 0.75 + ≥120min → "Z2 Lang", ≥60min → "Z2 Dauer", <60min →
"Z1 Recovery". Grenzwerte sind in `tests/typ-inferenz.test.js` festgeschrieben.

## Skills (`.claude/skills/`)

Vor Rohbefehlen/eigener Recherche prüfen, ob eines dieser Themen zutrifft —
sie laden nur bei Bedarf und halten diese Datei kurz:
- **fallow** — Codebase Intelligence ("check code health", "find circular deps").
- **grilling** — bei Unklarheit in Anforderung/Design/Vorgehen Frage für
  Frage klären statt zu raten oder vorsichtshalber alles zu bauen.
- **chart-labels** — Label-/Datums-/Merge-Konvention für Charts.
- **sync-pipeline** — Datenquellen-Mix, `athlete_sync_config`, Secrets-Layout,
  Supabase-Migrationsworkflow, RLS-Testsuite.
- **playwright-mcp** — wann Playwright MCP statt Unit-Test gerechtfertigt ist.

## Dateistruktur

Tiefe Details stehen bewusst NICHT hier, sondern in READMEs direkt im
jeweiligen Verzeichnis. Diese Übersicht zeigt nur die Form.

```
app/                       → Vite + React + TypeScript, s. app/README.md
  src/
    main.tsx, App.tsx      → Einstiegspunkt + Routing/Gates
    config.ts              → Athleten-Stammdaten, Phasen/Farben
    types.js                → Reine JSDoc-Typen
    core/                   → Reine Berechnung — Details: src/core/README.md
    api/                    → I/O-Grenze — Details: src/api/README.md
    sports/                 → Multi-Sport-Zonen/Metriken — Details: src/sports/README.md
    charts/                 → Chart-Engine — Details: src/charts/README.md
    components/             → Layout, GlassCard, AthleteToggle, ProgressRing, …
    hooks/                  → generische UI-Hooks (nicht datenbezogen)
    features/               → ein Verzeichnis je Tab/Bereich (hero, logbook,
                              planning, analysis, events, auth, settings,
                              bikefit, landing, onboarding)
    styles/tokens.css       → Design-Tokens

admin-api/                → schlanker Node.js-HTTP-Server, Admin-Accountverwaltung
                            gegen GoTrue/PostgREST, eigenes Image/Dockerfile/Tests

data/                     → generierte JSON-Dateien, NICHT manuell committen

supabase/migrations/       → SQL-Migrationen, laufnummeriert

scripts/
  generate-data.js         → Dünner Orchestrator (Sync-Container + `npm run sync`)
  lib/                     → Sync-Module (plan2, plan-athlete2/4, intervals, weather,
                             map-activity, wellness, sync-config-fetch, …) — Details
                             und Einmal-Skripte: Kopfkommentare je Datei
  Dockerfile                → Container-Build für den Sync-Job

tests/                    → node:test-Suiten für scripts/lib/* + supabase-rls.test.js

.github/workflows/         → ci.yml, ci-app.yml, publish-images.yml,
                            check-version-tag.yml, sync-data.yml (s. „Stack")

.claude/skills/             → fallow, grilling, chart-labels, sync-pipeline,
                            playwright-mcp — repo-versioniert (s. „Skills")

planning/                  → GITIGNORED, eigenes privates Git-Repo. Ideen +
                            Fahrpläne (planning/ideen-backlog.md, planning/docs/).
                            Das öffentliche Repo behält nur docs/README.md.
```

## Equipment (Athlet 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3
