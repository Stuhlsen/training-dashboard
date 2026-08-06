# core/

Portierte Rechenlogik aus `assets/js/core/*.js` (Etappe 2a) — **inhaltlich
1:1 unverändert**, keine Logikänderung. Die Schichtenregel gilt hier
unverändert weiter: kein `document`, `window`, `localStorage` oder `fetch`.

## Was portiert wurde

- alle 53 Module aus `assets/js/core/`, unverändert
- `assets/js/types.js` → `../types.js` (reine JSDoc-Typdefinitionen, kein
  Laufzeit-Code; die `@param {import("../types.js")…}`-Verweise in core/
  lösen dadurch ohne Anpassung auf)
- 42 mockfreie core-Tests nach Vitest. Die Portierung ist mechanisch: nur die
  Runner-Importzeile wechselt (`node:test` → `vitest`), die Importpfade werden
  relativ (`../assets/js/core/x.js` → `./x.js`). `node:assert/strict` bleibt —
  Vitest läuft unter Node, und ein Umschreiben auf `expect()` wäre keine
  Portierung mehr, sondern ein Neuschreiben mit Regressionsrisiko.

Einzige inhaltliche Anpassung: `export-briefing-consistency.test.js` löst den
Pfad zur Prompt-Vorlage in `docs/` jetzt über `process.cwd()` auf. Begründung
steht im Kommentar in der Datei.

## Was bewusst NICHT hier ist

- **`state/`-Tests** — sie testen Module, die es in 3.0 nicht mehr gibt
  (`state/*.js` → Hooks). Sie dienen in Etappe 2b als Verhaltens-Spezifikation
  für neu geschriebene Hook-Tests, s. Konzept 3.2 Fall 2. Betrifft auch
  `chart-view-state.test.js`, das trotz core-nahem Namen per dynamischem
  `await import()` gegen `state/chart-view.js` testet.
- **core-Tests mit `mock.module()`** (`block-transition`, `export`,
  `ladder-preset-suggestion`) — sie stubben `state/`/`data-access/` und hängen
  damit an der Zugriffsschicht aus Etappe 2b.
- **`scripts/lib`-Tests** — die Node-Sync-Pipeline bleibt im Repo-Root und ist
  nicht Teil der React-App.

## Duplikat auf Zeit

Bis zur Umschaltung (Etappe 10) existiert `core/` doppelt: das Original unter
`assets/js/core/` treibt weiter die Live-Seite, diese Kopie die neue App. Das
ist gewollt (Konzept G2 — die alte Seite bleibt live). Änderungen an core/
während der Übergangszeit müssen deshalb in **beiden** Bäumen landen.
