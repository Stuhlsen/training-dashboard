# core/

Portierte Rechenlogik aus `assets/js/core/*.js` (Etappe 2a) — **inhaltlich
unverändert**, keine Logikänderung. Die Schichtenregel gilt hier
unverändert weiter: kein `document`, `window`, `localStorage` oder `fetch`.

Seit Etappe 3 gilt die Byte-Gleichheit mit dem Vanilla-Baum nicht mehr für
alle Dateien — siehe „Duplikat auf Zeit" unten.

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

Die Zahlen oben sind der Stand der Etappe-2a-Portierung, kein laufend
gepflegter Zähler — seither kamen weitere, direkt in `app/src/core/`
neu geschriebene Module dazu (u. a. `ladder*.js`, `proposal-*.js`,
`plan-drag.js`, `scenario.js`, `workout-*.js`), jeweils mit eigenem Test.

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
ist gewollt (Konzept G2 — die alte Seite bleibt live).

**Seit Etappe 3 ist der Abgleich einseitig.** Vier Dateien tragen hier
Re-Export-Zeilen, die es im Vanilla-Baum nicht gibt — die radsportspezifischen
Konstanten leben jetzt in `../sports/cycling/` (Konzept G5):

| Datei | Divergenz |
|---|---|
| `zones.js` | `COGGAN_ZONE_UPPER_PCT`, `COGGAN_ZONE_META`, `SWEET_SPOT_PCT`, `IF_BANDS`, `LOW_INTENSITY_TARGET`, `WHATIF_SCALE_HEADROOM_W` re-exportiert statt definiert |
| `plan-config.js` | `TYPE_DEFAULT_TSS`(+`_APPROX_TYPES`), `KNOWN_PLAN_TYPES`, `INTENSITY_CLASS`, `TYPE_EXPECTED_BAND`, `SESSION_CLASSIFY`, `FALLBACK_TSS` re-exportiert |
| `periodization.js` | `PHASE_SIGNATURES` re-exportiert |
| `efficiency.js` | `COMPARABLE` re-exportiert |

Die **Werte** sind in beiden Bäumen identisch, nur ihr Ort unterscheidet sich.
Daraus folgt für die Übergangszeit:

- Inhaltliche Fixes an `assets/js/core/*.js` müssen weiterhin hierher nachgezogen
  werden — bei den vier Dateien oben landet ein geänderter **Wert** dann in
  `sports/cycling/`, nicht in `core/`.
- Umgekehrt gilt das nicht: die Re-Export-Struktur gehört zu Dashboard 3.0 und
  wandert **nicht** in den Vanilla-Baum zurück.
- Alle übrigen Module sind unverändert byte-gleich und bleiben per `diff`
  vergleichbar.

## Ernährung, Zonen-Erklärer, Hero-Layout (neuere Module)

Direkt hier geschrieben, jeweils mit eigenem Test. Alle ohne I/O; Details
und Entscheidungsnummern stehen im Kopfkommentar der Datei.

| Modul | Aufgabe |
|---|---|
| `nutrition.js` | Tagesziel (`estimateDailyTarget`/`estimateDailyGoal`), RED-S-Boden (`redSFloor`), Kohlenhydrat-Ziel, Intoleranz-Filter (`filterByIntolerances`), Hinweise (Training, fehlendes Gewicht) |
| `nutrition-plan.js` | Tageszusammenstellung: `composeDay`, Tausch-Alternativen `swapCandidates`, Tages-Ampel `dayAmpel` |
| `nutrition-taxonomy.js` | Allergen-Taxonomie (14 EU-Hauptallergene + `sonstiges`) — gemeinsame Quelle für `profiles.intolerances` und `recipes.contains_tags`; `allergenLabel` liefert den deutschen Namen für die UI |
| `nutrition-sources.js` | Kuratierte Quellenliste für Ernährungsangaben (`NUTRITION_SOURCES`, `SOURCE_BY_KEY`) |
| `shopping-list.js` | Einkaufsliste aus dem Essensplan: `aggregateShoppingList` (Menge aus `servings` + `extraServings`), `roundAmount`, `formatShoppingAmount` |
| `portions.js` | Portionen im Kochmodus: Halbschritte 0,5–12 (`clampCookPortions`, `stepCookPortions`), Aufteilung in eigene und Gäste-Portionen (`splitPortions`, `totalPortions`), Plan-Eintrag zu einem Rezept (`findPlanEntryForRecipe`) |
| `cook-timer.js` | Kochmodus-Timer als reine Zustandsfunktionen (`startTimer`, `remainingSeconds`, `serializeTimers`/`restoreTimers`); `now` kommt immer von außen |
| `zone-explanations.js` | Erklärtexte je Zone und Sportart (reine Daten), Zonengrenzen stehen in `../sports/` |
| `zone-sources.js` | Quellenliste für die Zonen-Erklärtexte (`ZONE_SOURCES`) |
| `hero-layout.js` | Platzierungslogik der Hero-Kacheln im Raster (`resolveTileLayout`), Speicherung in `api/supabase/hero-layout.ts` |
