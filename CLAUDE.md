@AGENTS.md

## Skills

- **fallow** (`.claude/skills/fallow`) — bei Anfragen wie "check code health",
  "find circular deps", "dead code check" dieses Skill nutzen statt Rohbefehle
  zu raten.
- Vor neuer Datei in `assets/js/core|state|ui/…` prüfen, ob ein Skill oder
  bestehendes Modul die Aufgabe schon abdeckt — nicht parallel neu erfinden.

## Vor jeder Aufgabe

Kurz benennen, wie das Ergebnis verifiziert wird, bevor losgeschrieben wird:
`core/`-Logik → welcher Test in `tests/`; `ui/`-Änderung → `node -c` +
`npx serve .` + zu prüfende Seite/Tab; neues Datenfeld → alle 3 Pflichtstellen
(scripts/, core/validate.js, types.js) einzeln nennen; Standort/Athletennamen
→ explizit gegenprüfen, dass nichts davon in Code/JSON/Commit landet.

## Arbeitsweise

- **Plan Mode** vor Änderungen an `core/*.js`, die mehr als eine Funktion
  betreffen, oder die die Schichtenregel (`ui → state → core`) berühren.
- **TodoWrite** ab 3 Schritten (z. B. die 3 Pflichtstellen bei neuem Datenfeld).
- Nach jeder `.js`-Änderung selbst `node -c <datei>` laufen lassen.
- Vor jedem Commit-Vorschlag: `node -c` → `npm test` → `/code-review` auf den
  Diff (prüft dabei auch gegen Schichtenregel, Result-Konvention und fehlende
  Tests in `core/`) → ggf. `npx serve .`. Erst danach Commit-Befehl vorschlagen.
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
