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
npm test         # Vitest
npm run lint     # ESLint
```

## Konventionen

Siehe Projekt-`AGENTS.md`/`CLAUDE.md` (Repo-Root) — gelten unverändert auch
hier (deutsche Commit-Präfixe, PowerShell ohne `&&`, Result-Konvention für
fehlbare Operationen, keine Secrets im Code).
