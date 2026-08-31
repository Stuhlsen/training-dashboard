# Dashboard 3.0 — `/app/`

Vite + React + TypeScript. **Die einzige Oberfläche** des Trainingsdashboards
seit dem 15.08.2026 — der frühere Vanilla-JS-Zweig (`assets/js/`) wurde mit
Fahrplan 1 entfernt (siehe `../docs/fahrplan-1-vanilla-entfernen.md`).
Konzept/Etappenplan des React-Umbaus: `../docs/dashboard-3.0-konzept-react-umbau.md`.

## Befehle

```powershell
npm install
npm run dev      # Dev-Server, http://localhost:5173
npm run build    # Typecheck (tsc -b) + Produktions-Build nach dist/
npm test         # Vitest (beide Projekte)
npm test -- --project core   # nur die portierte core-Schicht
npm run lint     # ESLint
```

Die Vitest-Läufe sind in zwei Projekte geteilt (`vite.config.ts`): `core`
läuft unter `node` (reine Rechenlogik ohne DOM), `app` unter `jsdom`. Siehe
`src/core/README.md` für Umfang und Abgrenzung der core-Portierung,
`src/api/README.md` für die Zugriffsschicht (Etappe 2b) und
`src/sports/README.md` für die Multi-Sport-Grundstruktur (Etappe 3) —
dort stehen auch die radsportspezifischen Werte, die vorher in `core/`
fest verdrahtet waren.

Der Dev-Server liefert zusätzlich die per Cron erzeugten `/data/*.json` aus
dem Repo-Root aus (`serveRepoData()` in `vite.config.ts`) — die JSON-Pipeline
bleibt unangetastet, siehe Konzept 5.5.

`vite.config.ts::resolveVersion()` schreibt `__APP_VERSION__`/`__BUILD_DATE__`
zur Build-Zeit ein (per `git describe`, Fallback `VITE_APP_VERSION`-Env) —
Grundlage für den Versions-Footer in der App. Braucht im CI einen Checkout
mit voller Tag-Historie (`fetch-depth: 0`), sonst läuft `git describe` ins Leere.

**Zwei getrennte Testsuiten im Repo:** dieses `npm test` (Vitest, nur `/app/`)
und das Root-`npm test` (`node --test`, nur `tests/`, prüft die Datensync-
Pipeline in `scripts/`). Sie überschneiden sich nicht und müssen beide grün sein.

## Konventionen

Siehe Projekt-`AGENTS.md`/`CLAUDE.md` (Repo-Root) — gelten unverändert auch
hier (Commit-Konvention: Prefix + Beschreibung, Subject seit 26.08.2026 auf
Englisch; PowerShell ohne `&&`, Result-Konvention für fehlbare Operationen,
keine Secrets im Code).
