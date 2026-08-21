@AGENTS.md

## Skills

- **fallow** (`.claude/skills/fallow`) — bei Anfragen wie "check code health",
  "find circular deps", "dead code check" dieses Skill nutzen statt Rohbefehle
  zu raten.
- Vor neuer Datei in `assets/js/core|state|ui/…` prüfen, ob ein Skill oder
  bestehendes Modul die Aufgabe schon abdeckt — nicht parallel neu erfinden.

## MCP-Tools

- **Playwright MCP** (`.mcp.json`, projektlokal, `npx @playwright/mcp@latest`,
  bereits eingerichtet und committet) — aktiv nutzen für UI-nahe Bugs, Race
  Conditions und alles, was sich nicht zuverlässig durch reines Code-Lesen
  klären lässt. Nicht erst als letztes Mittel nach mehreren erfolglosen
  Theorien greifen (so verlief der Drag-Grip-Bug im Trainer-Modus, Juli 2026:
  zwei rein code-lesebasierte Fixversuche waren beide in sich logisch
  schlüssig und beide wirkungslos — die Ursache war eine Race Condition
  zwischen zwei Event-Listenern, deren relative Reihenfolge keine im
  Quelltext sichtbare Eigenschaft ist. Erst die Live-Diagnose mit Playwright
  MCP machte sie eindeutig, s. `docs/offene-punkte.md`).
  - **Kann:** echten Browser steuern (Navigation, Klicks, Formulare,
    Drag-Gesten über Pointer-Events), Accessibility-Snapshot statt
    Screenshot bevorzugen (`browser_snapshot`), Konsole und Netzwerk-Requests
    einsehen, Laufzeit-Zustand direkt inspizieren via `browser_evaluate` mit
    dynamischem `import()` der laufenden App-Module (liefert echten
    In-Memory-State aus `state/*.js`, nicht nur den DOM-Ausschnitt).
  - **Bleibt manuell bei Alex:** die finale Bestätigung im echten Browser vor
    jedem `git sync`; echte Multi-Step-Zeigergesten, falls synthetische
    Pointer-Events einen Unterschied machen könnten — beim Drag-Freeze-Bug
    (Juli 2026) ließ sich das Symptom mit einer einfachen Zwei-Schritt-
    Pointer-Simulation nicht reproduzieren, blieb aber ein offener Punkt bis
    zur manuellen Bestätigung.
  - `.playwright-mcp/` (Snapshot-/Konsolen-Dumps aus Diagnose-Sessions) ist
    gitignored — kein Quellcode, nicht committen.

## Vor jeder Aufgabe

Kurz benennen, wie das Ergebnis verifiziert wird, bevor losgeschrieben wird:
`core/`-Logik → welcher Test in `tests/`; UI-Änderung → `npm run build` +
`npm run dev` für schnelle Zwischenstände, **vor dem Commit-Vorschlag
zusätzlich einmal gegen den lokalen Docker-Container** (`docker compose
-f docker-compose.dev.yml up -d`, `http://localhost:8080` — s. „Arbeitsweise"
unten) + zu prüfende Seite/Tab; neues Datenfeld → alle 3 Pflichtstellen
(scripts/, core/validate.js, types.js) einzeln nennen; Standort/Athletennamen
→ explizit gegenprüfen, dass nichts davon in Code/JSON/Commit landet.

## Arbeitsweise

- **Plan Mode** vor Änderungen an `core/*.js`, die mehr als eine Funktion
  betreffen, oder die die Schichtenregel (`ui → state → core`) berühren.
- **TodoWrite** ab 3 Schritten (z. B. die 3 Pflichtstellen bei neuem Datenfeld).
- Nach jeder `.js`-Änderung selbst `node -c <datei>` laufen lassen.
- Vor jedem Commit-Vorschlag: `node -c` → `npm test` → `/code-review` auf den
  Diff (prüft dabei auch gegen Schichtenregel, Result-Konvention und fehlende
  Tests in `core/`) → bei UI-Änderungen zwingend einmal gegen den lokalen
  Docker-Container prüfen (`docker compose -f docker-compose.dev.yml up -d`,
  `http://localhost:8080`) — **nicht nur `npm run dev`**: nur der Container
  läuft durch den echten Produktions-Build (Vite-Build + nginx +
  `window.__RUNTIME_CONFIG__`-Laufzeitpfad), der Vite-Dev-Server mit HMR kann
  Fehler verdecken, die erst im gebauten Static-Bundle auftreten. `npm run dev`
  bleibt für schnelle Zwischenstände während der Arbeit erlaubt, ersetzt aber
  nicht diesen finalen Check. Erst danach Commit-Befehl vorschlagen.
  Testlücken nur benennen, nicht ungefragt auffüllen.
- `data/*.json`, `.agents/`, `agent/`, `data/skills/`, `skills-lock.json`
  **nie** selbst stagen/committen, auch nicht mit `git add -A`.

## Grenzen

- Kein `git push --force` ohne `--force-with-lease`.
- Keine Secrets (WEATHER_LAT/LON, API-Keys) in Bash-Output, Kommentaren oder
  Commit-Messages ausgeben, auch nicht zu Debug-Zwecken.
- PowerShell: ein Befehl pro Zeile, kein `&&`.
- Neue `.md`-Konvention (Commit-Typ, Schicht) → in **AGENTS.md** ergänzen,
  nicht hier — diese Datei bleibt Claude-spezifisch.
- **Immer vorher nachfragen**, nie automatisch ausführen: echter Push/Sync zu
  intervals.icu (nicht nur geloggt/simuliert), Löschen oder Überschreiben von
  `data/*.json` außerhalb des Sync-Workflows, Änderungen an `.gitattributes`
  oder Zeilenenden-Konfiguration.
