# Dashboard 3.0 — `/app/`

Vite + React + TypeScript. Neubau des Trainingsdashboards, siehe
`../docs/dashboard-3.0-konzept-react-umbau.md` für das Gesamtkonzept und den
Etappenplan. Die bestehende Vanilla-JS-Seite (Repo-Root) bleibt bis zur
Umschaltung (Etappe 10) unverändert live.

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
`src/core/README.md` für Umfang und Abgrenzung der core-Portierung und
`src/api/README.md` für die Zugriffsschicht (Etappe 2b).

Der Dev-Server liefert zusätzlich die per Cron erzeugten `/data/*.json` aus
dem Repo-Root aus (`serveRepoData()` in `vite.config.ts`) — die JSON-Pipeline
bleibt unangetastet, siehe Konzept 5.5.

**Zwei getrennte Testsuiten im Repo:** dieses `npm test` (Vitest, nur `/app/`)
und das Root-`npm test` (`node --test`, nur `tests/`). Sie überschneiden sich
nicht und müssen beide grün sein, solange die alte Seite live ist.

## Konventionen

Siehe Projekt-`AGENTS.md`/`CLAUDE.md` (Repo-Root) — gelten unverändert auch
hier (deutsche Commit-Präfixe, PowerShell ohne `&&`, Result-Konvention für
fehlbare Operationen, keine Secrets im Code).
