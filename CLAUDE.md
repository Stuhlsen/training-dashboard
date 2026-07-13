@AGENTS.md

<!--
Alles Projektübergreifende (Stack, Befehle, Architektur, Konventionen, Athleten,
Trainingspläne, Design-Tokens, Bekannte Eigenheiten) steht in AGENTS.md und wird
per Import oben eingelesen. Diese Datei enthält NUR, was spezifisch für Claude
Code ist und in AGENTS.md nichts zu suchen hat (Codex/Cursor/Copilot lesen es
sonst mit und können nichts damit anfangen).
-->

## Skills

- **fallow** (`.claude/skills/fallow`) — bei Anfragen wie "check code health",
  "find circular deps", "dead code check" dieses Skill nutzen statt Rohbefehle
  zu raten. Übersetzt die Anfrage in die passenden `fallow`-Flags.
- Vor jeder neuen Datei aus `assets/js/core|state|ui/…` prüfen, ob ein Skill
  oder ein bestehendes Modul die Aufgabe schon abdeckt (siehe Dateistruktur in
  AGENTS.md) — nicht parallel neu erfinden.

## Verifikation — vor jeder Aufgabe

Bevor eine Änderung begonnen wird: kurz benennen, **wie** das Ergebnis
anschließend verifiziert wird — nicht erst danach überlegen.
Konkret für dieses Repo, je nach Art der Änderung:
- Reine `core/*.js`-Logik → welcher Test in `tests/` deckt das ab bzw. welcher
  neue Test wird ergänzt (`npm test`).
- `ui/*.js` / Chart-/DOM-Änderung → `node -c`, danach `npx serve .` + kurz
  benennen, welche Seite/welcher Tab manuell zu prüfen ist.
- Neues Datenfeld → die 3 Pflichtstellen (scripts/, core/validate.js,
  types.js) einzeln als Verifikationspunkte nennen, nicht nur "Schema
  anpassen".
- Datenschutz-relevante Änderung (Standort, Athletennamen) → explizit
  gegenprüfen, dass nichts davon in Code/JSON/Kommentaren/Commit-Message landet.
Wenn sich vorab kein sinnvoller Verifikationsweg nennen lässt, ist das ein
Signal, die Aufgabe erst zu präzisieren statt einfach loszuschreiben.

## Self-Review — nach substantiellen Änderungen

Bei allem, was mehr als eine kleine Einzeländerung ist (neues Feature, neues
Chart, Änderung an mehreren Dateien/Schichten): am Ende selbstständig einen
Review-Pass machen, nicht nur "Tests grün" als fertig melden. Konkret prüfen
und kurz benennen, was geprüft wurde:
- **Schichtenregel**: keine neuen Importe, die `core → state/ui` verletzen
  (`npx fallow health --circular-deps` bei größeren Änderungen gegenchecken).
- **Result-Konvention**: neue fehlbare Operationen geben `{ ok, ... }` zurück,
  keine rohen `console.*`-Aufrufe, kein stiller Fehlerfall ohne Log.
- **Redundanz/Effizienz**: keine Logik dupliziert, die schon in `core/`
  existiert; neues Chart nach Chart-Merge-Konvention geprüft statt reflexhaft
  eine neue Box angelegt.
- **Vollständigkeit bei Datenfeldern**: alle 3 Pflichtstellen wirklich
  angefasst, nicht nur die naheliegendste.
- **Nichts Neues kaputt**: `npm test` erneut laufen lassen nach dem Review,
  nicht nur einmal vor der ersten Änderung.
Das Ergebnis dieses Checks kurz zusammenfassen (was geprüft wurde, was ggf.
nachgebessert wurde) — nicht stillschweigend durchwinken.

## Arbeitsweise in diesem Repo

- **Plan Mode nutzen**, bevor an `core/*.js` etwas geändert wird, das mehr als
  eine Funktion betrifft, oder bevor die Schichtenregel (`ui → state → core`)
  berührt wird — hier lieber einmal zu viel planen als eine Circular Dependency
  einbauen.
- **TodoWrite** für alles mit mehr als 2 Schritten verwenden (z. B. "neues
  Feld ins Datenformat aufnehmen" = 3 Pflichtstellen it. AGENTS.md → Todo mit
  3 Punkten), damit kein Schritt vergessen wird.
- Nach jeder Änderung an einer `.js`-Datei **selbst** `node -c <datei>` laufen
  lassen, bevor der Turn als abgeschlossen gilt — nicht darauf verlassen, dass
  der Mensch das noch prüft.
- Vor einem Commit-Vorschlag immer: `node -c` (geänderte Dateien) → `npm test`
  → kurzer Hinweis, ob `npx serve .` zum manuellen Check sinnvoll ist. Erst
  danach den Commit-Befehl vorschlagen.
- `data/*.json`, `.agents/`, `agent/`, `data/skills/`, `skills-lock.json`
  **nie** von dir aus stagen oder committen, auch nicht mit `git add -A` —
  siehe "Bekannte Eigenheiten" in AGENTS.md.

## Tool-Nutzung / Grenzen

- Kein `git push --force` ohne `--force-with-lease` — siehe Git-Workflow in
  AGENTS.md, wegen der Auto-Commits der Action.
- Keine Secrets (WEATHER_LAT/LON, API-Keys) in Bash-Ausgaben, Kommentaren oder
  Commit-Messages ausgeben oder loggen, auch nicht zu Debug-Zwecken.
- Bei PowerShell-Befehlen: einen Befehl pro Zeile vorschlagen, kein `&&`
  (siehe AGENTS.md) — das gilt auch für Vorschläge, die du in den Chat
  schreibst, nicht nur für tatsächlich ausgeführte Befehle.

## Claude-spezifische Konventionen

- Bei Unsicherheit, ob ein neues Feature in ein bestehendes Chart integriert
  oder eine neue Box werden soll: erst die Chart-Merge-Konvention (AGENTS.md)
  gegenprüfen, dann fragen statt anzunehmen.
- Wenn eine Aufgabe eine neue `.md`-Konvention nötig macht (z. B. neuer
  Commit-Typ, neue Schicht): Vorschlag machen, aber **AGENTS.md** editieren,
  nicht diese Datei — Claude-spezifisch bleibt nur, was andere Tools nicht
  lesen sollen.

<!--
Persönliche/lokale Overrides (eigener Editor-Pfad, lokale Debug-Shortcuts,
WIP-Notizen) gehören in CLAUDE.local.md (gitignored), nicht hier rein.
-->
