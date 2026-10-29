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

# Repo-Root: lokaler Demo-Stack (fiktive Daten, Standard für den Vor-Commit-Check)
npm run demo:init        # einmalig: .env.demo
npm run demo:up          # http://localhost:8080
npm run demo:down        # anhalten · leeren: npm run demo:down -- -v
npm run demo:generate    # data-demo/*.json für npm run dev

# /app/: Dev-Server (http://localhost:5173) im Demo-Modus gegen den Demo-Stack,
# liefert /data aus data-demo/ · echte Daten nur bewusst: npm run dev:real
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
   Commit-Vorschlag zwingend zusätzlich gegen den lokalen Demo-Stack**
   (`npm run demo:up`, Frontend auf `http://localhost:8080`, Demo-Login —
   s. „Demo-Stack" unten). Grund: nur der Container durchläuft den echten
   Produktions-Build (Vite-Build + nginx + `window.__RUNTIME_CONFIG__`-
   Laufzeitpfad) — der Vite-Dev-Server mit HMR kann Fehler verdecken, die
   erst im gebauten Static-Bundle auftreten. `docker-compose.dev.yml` (echte
   Daten) nur noch bewusst, z. B. zum Debuggen eines Sync-Fehlers.
5. Commit mit Konvention (siehe unten)
6. `git sync`

`data/*.json` NICHT committen (`.gitignore`) — der apps01-Sync-Container
schreibt sie direkt ins mit dem Frontend geteilte Volume.

## Tests (TDD)

Neue oder geänderte Logik in `app/src/core/`, `scripts/lib/` und `admin-api/`
entsteht testgetrieben: erst ein fehlschlagender Test, dann die
Implementierung, dann aufräumen. Ziel sind mindestens 80 % Abdeckung für den
geänderten Code. Fehlende Tests in diesen Bereichen werden ergänzt, nicht nur
benannt — reine UI-/CSS-Änderungen sind davon ausgenommen.

## Demo-Stack (lokal, Standard)

Lokal wird gegen **fiktive Daten** gearbeitet, nicht gegen echte (Fahrplan 31).
`docker-compose.demo.yml` ist ein eigenes Compose-Projekt
(`training-dashboard-demo`) mit Selfhost-Supabase (Proxy `:8000`), Frontend
(`:8080`, `RUNTIME_ENV=demo`) und dem Dienst `demo-seed` (erzeugt beim Start
und dann alle 24 h Demo-JSON + Demo-DB-Zeilen, ergänzt nur).

- **Logins** (nur lokal gültig, kein Geheimnis): `lena.rides@demo.local`
  (Rad), `tri_jonas@demo.local` (Triathlon), `coach.mara@demo.local`
  (Trainer beider), Passwort für alle `demo-lokal-2026`.
- **Start/Stopp nur über `npm run demo:up` / `demo:down`.** Die Skripte
  setzen `--env-file .env.demo`. Ohne diese Option liest Compose die echte
  `.env` im Repo-Ordner — der Stack nutzt darum nur `DEMO_*`-Variablen als
  Pflichtwerte und bricht ohne `.env.demo` laut ab.
- **`.env.demo`** erzeugt `npm run demo:init` einmalig (gitignored, eigene
  lokale Schlüssel). Neu anfangen: `npm run demo:down -- -v`, dann
  `.env.demo` löschen.
- **Regel Nr. 1:** echte Daten verschwinden nie. Der Demo-Stack hat nur
  eigene Volumes (`training-dashboard-demo_demo_*`); `down -v` nie für ein
  anderes Projekt. Sperren in `scripts/demo/lib/guards.js` (nur localhost,
  nie `data/`, nur `@demo.local`) werden nicht gelockert.
- **`npm run dev`** (`/app/`) läuft im Demo-Modus gegen denselben Stack,
  liest `data-demo/` von der Platte → vorher `npm run demo:generate`.
- Nichts davon kommt nach `publish-images.yml` oder auf apps01.

## Commit-Konvention

Prefix + knappe Beschreibung, **auf Englisch**. Grund: `publish-images.yml`
generiert bei jedem `v*`-Tag den GitHub-Release-Changelog automatisch aus den
Commit-Subjects — soll für GitHub-/Portfolio-Besucher ohne Übersetzung lesbar
sein. Gilt für **alles, was auf GitHub landet**: Commit-Nachrichten, PR-Titel
und -Beschreibung, Issues, Kommentare, Release-Notes. Code-Kommentare, Doku und
UI-Texte bleiben deutsch (zitierte UI-Texte stehen im PR im deutschen Original).
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
VALIDATION, NOT_CONFIGURED, UNKNOWN). In `app/src/api/` gilt die Konvention nach außen weiter,
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

CI-Job `code-quality` in `ci.yml` ist bewusst **non-blocking** (Schwellwerte
noch nicht kalibriert). Circular Deps können direkt die Schichtenregel
verletzen; für PRs ist `fallow audit --base <ref>` aussagekräftiger als der
Vollrepo-Score. Bedienung: Skill `.claude/skills/fallow`.

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

**Fahrpläne: ein Branch, ein Commit pro Etappe, ein PR am Ende.** Alle
Etappen eines Fahrplans laufen nacheinander auf **einem** gemeinsamen Branch
(`feat/f<nr>-<thema>`), je Etappe genau **ein** Commit (Fixture-/Golden-
Master-Updates gehören in den Commit ihrer Etappe). PR und `git merge-tag`
erst nach der letzten Etappe — ein Release pro Fahrplan, Migrationen gehen
gemeinsam raus. Jede neue Etappe holt zuerst den aktuellen `origin/main`
in den Branch, damit er nicht wegdriftet. Ausnahme nur auf Alex' Ansage:
ein dringender Fix darf vorab als eigener PR + Tag raus.

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

## Dateistruktur

Layout ergibt sich aus den Ordnern; Details stehen in den READMEs je
Verzeichnis (`app/README.md`, `app/src/{core,api,sports,charts}/README.md`)
und in den Kopfkommentaren unter `scripts/lib/`. Nicht aus dem Code
ersichtlich: `planning/` ist **gitignored** und ein eigenes privates Git-Repo
(Ideen + Fahrpläne, `planning/ideen-backlog.md`, `planning/README.md` = Wegweiser) — das
öffentliche Repo behält nur `docs/README.md`.

## Equipment (Athlet 1)

Cube Nuroad Race Gravel · Favero Assioma PRO MX-1 Power Meter · Wahoo ELEMNT Roam v3
