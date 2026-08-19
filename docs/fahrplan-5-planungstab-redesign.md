# Fahrplan 5: Planungstab-Redesign ("Planungstab Live"-Mockup)

**Stand:** 19.08.2026
**Zielablage:** `docs/fahrplan-5-planungstab-redesign.md`
**Herkunft:** Mockup `Planungstab Live.dc.html` aus dem claude.ai-Design-Tool
(Projekt „Rad-Dashboard Hero-Redesign"), in Plan Mode gegen den echten
Code-Stand geprüft und mit Alex abgestimmt (19.08.2026). Eigenständige
Initiative, unabhängig von den vier Fahrplänen aus `fahrplan-0-uebersicht.md`
— braucht keinen davon als Vorbedingung und blockiert keinen.

---

## Ziel

Der Planungstab (`app/src/features/planning/`) bekommt zwei neu gebaute
Kernbereiche statt der heutigen einspaltigen Karten-Listen:

1. Ein kompaktes **Mo–So-Raster** für den Wochenplan (statt Karten-Liste pro
   Woche), mit Klick-Detail je Tag.
2. Eine **Soll/Ist-Vergleichstabelle** „Absolviert" (statt Karten-Liste),
   mit aufklappbarem Detail-Chart je Zeile.

Alles andere am Planungstab (TrainerBar, ProposalBanner, Export/Import,
BlockDialog, DeltaBanner, Header) existiert bereits nahezu deckungsgleich
mit dem Mockup und bekommt nur einen kleinen Politur-Pass.

## Warum das kein reines Re-Styling ist

Die zwei Kernbereiche oben sind **strukturell neue UI**, keine Farb-/
Abstands-Anpassung — die Datengrundlage (Plankarten, Compliance-Matching,
Projektion/Konflikte, Zonenzeiten) existiert bereits vollständig und wird
nur neu zusammengesetzt. Der einzige Punkt mit echtem Neuland ist der
aufklappbare Leistungs-Chart der Soll/Ist-Tabelle (s. Entscheidungen unten).

## Getroffene Entscheidungen (nicht neu verhandeln)

| Thema | Entscheidung | Begründung |
|---|---|---|
| Umfang | Ein Gesamtplan, Umsetzung in Etappen-Commits | wie bei dashboard-3.0 üblich, ein Commit pro Etappe |
| Drag & Drop | bleibt erhalten, ins Raster integriert | aktive Kernfunktion, erst kürzlich Race-Condition-Fix (Drag-Grip, Juli 2026) |
| Trace-Chart (Leistung+Puls) | **kein** Streams-Pipeline-Umbau jetzt; vereinfachter Stufenchart aus vorhandenen Segmentdaten | echte Sekunden-Rohdaten existieren nirgends in der Pipeline (bestätigt: keine Treffer für stream/samples/icu_streams in `app/src`) |
| Streams-Idee | als offener Punkt nach `docs/offene-punkte.md` (Etappe 13i) | eigenes, größeres Datenpipeline-Vorhaben — API-Rate-Limits, Speichergröße, Sync-Zeit |
| Schmale Ansicht | horizontal scrollbares Raster | am wenigsten neue Sonderfälle, kein eigenes Stack-Layout |
| Plantreue-Quote | zählt nur Karten mit vorhandener Compliance-Ampel (Intervall-Workouts) | keine neue Grobregel für Nicht-Intervall-Fahrten erfinden |
| Wochen-Fenster | kein künstliches 3-Wochen-Limit | Raster braucht pro Woche weniger Platz als die heutige Karten-Liste — alle Wochen mit ≥1 Karte werden gezeigt |

Bestehende Etappen-Nummerierung im Code (Kommentare wie „Etappe 6a/7a/11a")
geht bis `12i` → diese Runde läuft als **Etappe 13a–13i**.

## Bereits vorhanden, nur Politur nötig (Etappe 13g)

- `TrainerBar.tsx` — 8 Kacheln (Check-in/Belastungswächter/TSB/Vorschläge/
  Befinden 7 Tage/Letzte Fahrten/Konflikte/CTL-ATL), Kategorien und Texte
  stimmen bereits überein.
- `ExportPanel.tsx`/`export-briefing-view-model.ts` — Presets
  (Allgemein/Event/Prüfen/Entlasten/Aufbau) identisch.
- `ProposalList.tsx`/`ProposalCompare.tsx`, `BlockDialog.tsx` — Struktur
  stimmt bereits weitgehend.
- `Layout.tsx` (Header-Nav, Athleten-Toggle, Abmelden) — **nicht anfassen**,
  1:1 identisch mit dem Mockup.
- Tokens (`app/src/styles/tokens.css`) — exakte Mockup-Palette bereits als
  `--z1/--z2/--ss/--thr/--vo2` etc. vorhanden. Überall Tokens statt Hex
  verwenden.

## Fensterübersicht

```
13a   week-grid-view-model.ts        (reine Ableitung, keine Vorbedingung)
13b   WeekGrid.tsx                   (nach 13a)
13c   WeekGridDetailRow.tsx          (nach 13a, parallel zu 13b möglich)
13d   DoneTable.tsx + view-model     (keine Vorbedingung, parallel zu 13a–13c möglich)
13e   DoneDetailChart.tsx            (nach 13d)
13f   PlanningPage.tsx verdrahten    (nach 13b, 13c, 13d, 13e)
13g   Politur bestehender Komponenten (unabhängig, jederzeit)
13h   Aufräumen (DaySlotRow löschen) (nach 13f)
13i   docs/offene-punkte.md ergänzen (unabhängig, jederzeit)
Abschluss  Gesamt-Review (/code-review)  (nach 13a–13h)
```

**Sofort parallel startbar (eigene Chat-Fenster):** 13a, 13d, 13g, 13i teilen
sich keine Datei mit den anderen zum Startzeitpunkt.

---

## Fenster 13a — `week-grid-view-model.ts` (reine Ableitung)

**Ziel:** `buildWeekGrid(cards, rides, todayIso)` liefert für jede Woche mit
mindestens einer Karte ein `GridWeekRow` mit 7 `GridDayCell` (Status
`done|today|open|missed|cancelled|empty`), ohne künstliches Wochenlimit.
**Vorbedingung:** keine.
**Modell:** `[SO]`

1. Neue Datei `app/src/features/planning/week-grid-view-model.ts`.
2. `doneDatesOf()` aus `planning-view-model.ts` exportieren (statt
   modul-privat) und hier wiederverwenden — nicht duplizieren.
3. Status-Prädikat je Tag: `cancelled` (card.cancelled) → Ruhetag-Sonderfall
   (`isRestDay`: vergangen = `done`, künftig = `open`, nie `missed`) → `done`
   (`doneDatesOf(rides).has(date)`) → `today` → `missed` (vergangen, kein
   `originalDate`) → `open` → `empty`.
4. Mehrere Karten am selben Datum (ausgefallene Original- + verschobene
   Ersatzkarte): Zelle zeigt die nicht-ausgefallene Karte primär, die
   ausgefallene landet in `otherCards` (Grundlage für die Lücken-Chips aus
   13d).
5. `weekDays()` aus `core/plan-drag.js` für die 7-Tage-Spanne,
   `isoWeekKey()` aus `core/aggregate.js` für den Wochenschlüssel,
   `plannedRecoveryWeeks()` aus `core/plan-feedback.js` für das
   Erholungswochen-Flag.
6. `loadPct` relativ zur höchsten `tssSum` unter den zurückgegebenen Wochen
   (kein externes Zielvolumen verfügbar).
7. Tests: `week-grid-view-model.test.ts` — ein Fall je Status,
   Mehrfachkarten-Tag, Wochengrenze (Montag-Start), `tssSum`/`loadPct`,
   Erholungswochen-Flag, leeres Karten-Array.

### Stand

**Umgesetzt und verifiziert** (19.08.2026): `week-grid-view-model.ts` +
`week-grid-view-model.test.ts` (14 Tests) geschrieben, `doneDatesOf()` in
`planning-view-model.ts` exportiert statt modul-privat. `npx vitest run
--project app src/features/planning/week-grid-view-model.test.ts` grün
(14/14 — Datei liegt unter `features/planning/`, läuft im `app`-Projekt,
nicht im `core`-Projekt, das nur `src/core/**` abdeckt), bestehende
`planning-view-model.test.ts` weiterhin grün (52/52), `npx tsc -b --noEmit`
fehlerfrei.

### Abnahme

- [x] Tests grün (`npx vitest run --project app
      src/features/planning/week-grid-view-model.test.ts`)
- [x] `npx tsc -b --noEmit` fehlerfrei
- [ ] Keine Logikduplikation zu `buildPlanningSections()` — geteilte
      Prädikate kommen aus `planning-view-model.ts`

---

## Fenster 13b — `WeekGrid.tsx` (Darstellung + Drag & Drop)

**Ziel:** Das Mo–So-Raster ersetzt den `sections.weeks.map(...)`-Block +
`DaySlotRow`-Einbindung in `PlanningPage.tsx`.
**Vorbedingung:** 13a abgeschlossen.
**Modell:** `[SO]`, bei der DnD-Kollisionslogik ggf. `[OP]`

1. Neue Datei `app/src/features/planning/WeekGrid.tsx`.
2. Jede Tageszelle ist zugleich `useDraggable`-Quelle (wenn `canDragCard()`
   erlaubt, `core/plan-drag.js`) und `useDroppable`-Ziel (wenn
   `isDropAllowed()` erlaubt) — ersetzt die heutige separate `DaySlotRow`,
   die nur während eines aktiven Drags eingeblendet wird.
3. Klick auf eine nicht-leere Zelle klappt eine Detailzeile (13c) unter der
   jeweiligen Wochenzeile auf (`openDate`-State, ein offenes Datum je Woche).
4. Horizontal scrollbar bei schmaler Breite (kein eigenes Stack-Layout,
   Entscheidung s. o.).
5. Tests: `WeekGrid.test.tsx` — Klick öffnet/schließt genau ein Datum je
   Woche, Drag auf vergangene/ausgefallene Zellen deaktiviert, Drop löst
   denselben `resolveDrop()`/`handleMove`-Pfad wie heute aus.

### Stand

**Umgesetzt** (19.08.2026): `WeekGrid.tsx` geschrieben — jede Tageszelle
zugleich `useDraggable`-Quelle (nur bei `canDragCard()` UND Status
`open`/`today`, s. Kommentar dort zur expliziten Statuseingrenzung) und
`useDroppable`-Ziel (nur bei `isDropAllowed()`), Klick auf nicht-leere
Zelle klappt Detailzeile über einen `renderDetail`-Prop-Slot auf (Inhalt
folgt erst in 13c — Interface bewusst so geschnitten, dass beide parallel
entwickelbar bleiben), je Woche höchstens ein offenes Datum.
`WeekGrid.test.tsx` (9 Tests) grün, bestehende Suite weiterhin grün
(1251/1251 im `app`-Teil), `npx tsc -b --noEmit` fehlerfrei, `npm run
build` fehlerfrei. Noch offen: Drag manuell im Dev-Server geprüft,
Verdrahtung in `PlanningPage.tsx` (Etappe 13f).

### Abnahme

- [x] `npm run build` (app/) fehlerfrei
- [x] `npm test` (app/, jsdom-Projekt) grün
- [ ] Drag-Verhalten manuell im Dev-Server geprüft (Verschieben funktioniert
      wie vor dem Umbau)

---

## Fenster 13c — `WeekGridDetailRow.tsx` (Tages-Detail)

**Ziel:** Übernimmt aus `PlanCard.tsx` (nicht-`isDone`-Zweig) 1:1 die
bestehende Logik, nur neu layoutet als aufklappbare Detailzeile.
**Vorbedingung:** 13a abgeschlossen (kann parallel zu 13b laufen, beide
importieren nur aus 13a und bestehenden Modulen).
**Modell:** `[SO]`

1. Neue Datei `app/src/features/planning/WeekGridDetailRow.tsx`.
2. Detail-Text-Priorität unverändert aus `PlanCard.tsx` übernehmen:
   `asWorkoutBlocks` → `LegacyWorkoutTimeline` → `Z2Block` → `RecoveryBlock`
   → Freitext.
3. „Wirkung"-Kachel über `cardImpact()` (`core/plan-feedback.js`), volle
   `WeatherBadge` (reicher als das Mockup — bewusste Beibehaltung).
4. Aktionsknöpfe: Bearbeiten → `onEdit()`/`PlanCardForm` unverändert;
   Verschieben/Ausfallen → gleiche Inline-Formulare wie heute in
   `PlanCard.tsx`, hierher verschoben; Wahoo-Push → `handlePush()`
   unverändert.
5. `HintChip`/`restDayRiddenSignal` bleiben unter dem Detailtext (im
   Mockup ohne Entsprechung, aber unverzichtbar).
6. Tests: `WeekGridDetailRow.test.tsx` — je ein Fall pro Detail-Quelle-Zweig,
   Move/Cancel/Push-Handler-Verdrahtung (Callbacks mocken, Aufrufargumente
   prüfen).

### Stand

**Umgesetzt** (19.08.2026): `WeekGridDetailRow.tsx` geschrieben — 1:1 Port
des bisherigen `!isDone`-Zweigs aus `PlanCard.tsx` (Header, Konflikt-/
Push-Hinweis-Chip, Wirkungsanzeige, Wetter-Badge, Workout-Detailblöcke in
der bestehenden Priorität `asWorkoutBlocks → LegacyWorkoutTimeline →
Z2Block → RecoveryBlock → Freitext`, Verschieben-/Ausfallen-Inline-
Formulare, Push-Button), ohne Drag-Griff (Ziehen bleibt exklusiv Sache der
Zelle in `WeekGrid.tsx`) und ohne Compliance-Tabelle/`DoneCompareBlock`
(bleibt der neuen "Absolviert"-Tabelle aus 13d/13e vorbehalten).
`restDayRiddenSignal` bleibt erhalten, aber verallgemeinert: statt des
bisherigen hartkodierten `true` (nur im `isDone`-Zweig aufrufbar) berechnet
die Komponente `doneDatesOf(rides).has(card.date)` selbst — die Zelle kennt
nur den Status `"done"`, nicht ob dieser Tag speziell ein trotzdem
gefahrener Ruhetag war. Passt sich damit an, dass das Raster (anders als
die bisherige Karten-Liste) Zellen aller Status zeigt, nicht nur
anstehende. `WeekGridDetailRow.test.tsx` (12 Tests: 5× Detail-Zweig-
Priorität, 3× Verschieben/Ausfallen/Rückgängig, 2× Push, 2× Ruhetag-
gefahren-Hinweis) grün, bestehende Suite weiterhin grün (541/541 im
`app`-Projekt), `npm run build` (`tsc -b` + `vite build`) fehlerfrei.
Verdrahtung in `WeekGrid.tsx`s `renderDetail`-Slot folgt erst in Etappe 13f.

### Abnahme

- [x] `npm run build` (app/) fehlerfrei
- [x] `npm test` (app/) grün, inkl. neuer `WeekGridDetailRow.test.tsx`

---

## Fenster 13d — `DoneTable.tsx` + `done-table-view-model.ts`

**Ziel:** Die „Absolviert"-Sektion wird eine Soll/Ist-Tabelle mit
Spaltenkopf (Tag/Einheit/Soll-Ist-Balken/Dauer/TSS/Ø Watt/Compliance/Caret)
statt einer Karten-Liste.
**Vorbedingung:** keine (nutzt nur bestehende `buildDoneCompareRows()`/
`visibleCompliance()` aus `planning-view-model.ts` und
`buildPlanningSections()`s `done`/`missed`/`cancelled`-Arrays).
**Modell:** `[SO]`

1. Neue Dateien `app/src/features/planning/DoneTable.tsx` und
   `done-table-view-model.ts`.
2. `buildDoneRows(done, doneRides, canEdit)` — dünne Tabellen-Projektion,
   **wiederverwendet** `buildDoneCompareRows()` für die Zahlen statt sie
   parallel neu zu berechnen.
3. `planFidelitySummary(done, doneRides, todayIso, windowDays=28)` — Quote
   nur über Karten mit `visibleCompliance()`-Ampel (Entscheidung s. o.).
4. `gapsChips(missed, cancelled)` — aus den bereits vorhandenen
   `sections.missed`/`sections.cancelled` (`buildPlanningSections()`).
   Notiztext für Verpasst: fester generischer String (kein neues
   Datenfeld).
5. Aufklapp-Inhalt: links `DoneCompareBlock` unverändert wiederverwendet
   (nur Zeilen-Styling ändert sich); rechts `DoneDetailChart` (13e) +
   Ampel/Fade-Fußzeile. Kein erfundenes „Notiz"-Feld — ohne passende Quelle
   wird dort nichts gerendert.
6. Tests: `done-table-view-model.test.ts` — `buildDoneRows`,
   `planFidelitySummary` (Fensterrand, nur Compliance-Karten), `gapsChips`.

### Stand

**Umgesetzt** (19.08.2026): `done-table-view-model.ts` — `buildDoneRows()`
liest Dauer/Ø-Watt-Zellen direkt aus `buildDoneCompareRows()` (per
Label-Suche "Dauer"/"Ø Watt", keine Parallelberechnung), TSS/Compliance sind
rohe Felder (`card.tssPlanned`/`ride.tss`, `visibleCompliance()`) und werden
nur durchgereicht. `doneRides` ist bewusst als vorab gematchte
`Map<cardId, Ride|null>` typisiert (`DoneRideMap`) statt eines rohen
`Ride[]` — spiegelt genau die Map, die `PlanningPage.tsx` bereits per
`matchRideForCard()` baut (Etappe 13f verdrahtet sie hierher durch, statt
sie ein zweites Mal aufzubauen). `planFidelitySummary()` zählt nur Karten
mit sichtbarer Compliance-Ampel im `[today-windowDays, today]`-Fenster,
`pct` bezieht sich auf den Anteil `rating==="green"` an allen bewerteten
Karten. `gapsChips()` nutzt für Verpasst immer denselben festen Text, für
Ausgefallen `card.cancelReason`, wenn vorhanden, sonst ebenfalls einen
festen Fallback-Text — kein neues Datenfeld.

`DoneTable.tsx` — Tabellenkopf exakt wie im Fensterplan (Tag/Einheit/
Soll-Ist-Balken/Dauer/TSS/Ø Watt/Compliance/Caret), Klick auf eine Zeile mit
gematchter Ist-Fahrt klappt `DoneCompareBlock` (unverändert wiederverwendet)
+ einen `renderChart`-Prop-Slot auf (gleiches Muster wie `WeekGrid.tsx`s
`renderDetail` — Inhalt folgt erst in 13e, Interface bewusst so geschnitten,
dass beide parallel entwickelbar bleiben). Zeilen ohne gematchte Ist-Fahrt
zeigen Dash-Werte und sind nicht aufklappbar (kein Caret, kein Klick-
Handler). `RATING_ICON`/`RATING_COLOR` aus `ComplianceTable.tsx` exportiert
(statt modul-privat) für die kompakte Compliance-Ampel in der
Tabellenzelle — nicht dupliziert. Plantreue-Zeile und Lücken-Chips
(`gapsChips()`) sitzen oberhalb bzw. unterhalb der Tabelle.

`done-table-view-model.test.ts` (15 Tests) + `DoneTable.test.tsx` (6 Tests)
grün, bestehende Suite weiterhin grün (562/562 im `app`-Projekt), `npx tsc -b
--noEmit` fehlerfrei, `npm run build` fehlerfrei. Verdrahtung in
`PlanningPage.tsx` (Ersetzen von `CardSection("✅ Absolviert…")`) folgt erst
in Etappe 13f.

### Abnahme

- [x] `npm test` (app/, view-model + Komponente — liegt unter
      `features/planning/`, nicht unter `core/`, läuft also im
      `app`-Projekt) grün

---

## Fenster 13e — `DoneDetailChart.tsx` (vereinfachter Stufenchart)

**Ziel:** Aufklappbarer Detail-Chart der Done-Tabelle — Stufenchart aus
Segmentdaten statt des im Mockup gezeigten (nicht baubaren) Rausch-Traces.
**Vorbedingung:** 13d abgeschlossen.
**Modell:** `[SO]`

1. Neue Datei `app/src/features/planning/DoneDetailChart.tsx`, Helper in
   `done-table-view-model.ts` oder eigener
   `done-detail-chart-view-model.ts` bei Bedarf.
2. **Intervall-Workouts:** `buildStepChart(compliance)` — ein Balken je
   `compliance.matched[i]`, Soll gestrichelt vs. Ist gefüllt, ✓/✗ per
   `fulfilled`. **Keine HR-Linie** — `RideCompliance` hat kein
   Puls-Feld je Intervall, nicht erfinden. Nicht-Arbeits-Segmente
   (Ein-/Ausfahren/Pause) ohne gematchte Ist-Werte im Ist-Stufenchart
   **weglassen**.
3. **Ohne Intervallstruktur:** `zoneMixFromRide(ride)` — echte Zonenzeiten
   (`normalizeZoneTimes()` aus `core/zones.js`) gemappt auf
   `COGGAN_ZONE_META` (`app/src/sports/cycling/zones.ts`). `null` bei
   fehlenden `zoneTimes` → nichts rendern.
4. Tests: beide Zweige, beide `zoneTimes`-Formate (numerisch/`{id,secs}`,
   wie bereits in `zones-coggan.test.js` abgedeckt), `null`-Fallback.

### Stand

**Umgesetzt** (19.08.2026): `done-detail-chart-view-model.ts` —
`buildStepChart(compliance)` baut einen Balken je `compliance.matched[i]`
(Breite ∝ `plannedDurationS`-Anteil an der Summe, Höhe ∝ Watt relativ zum
höchsten Soll-ODER-Ist-Wert unter allen Balken, gemeinsame Skala für
Vergleichbarkeit), `actualHeightPct` ist `null` ohne `avgWatts` (erfundene
Null vermieden). Liest ausschließlich `compliance.matched` — keine
Nicht-Arbeits-Segmente aus `workoutStructure` nachgezogen, keine HR-Linie
(kein Feld dafür in `RideCompliance`). `zoneMixFromRide(ride)` nutzt
`normalizeZoneTimes()` (`core/zones.js`, deckt beide intervals.icu-Formate
ab) und bündelt Index ≥4 nach demselben Muster wie
`last7DayZoneTimes()` in Z5+, gemappt auf die vollen 5
`COGGAN_ZONE_META`-Zonen (`app/src/sports/cycling/zones.ts`) statt der
groben 3-Band-Verdichtung aus `bandZoneTimes()` — näher am Mockup. `null`
bei fehlenden `zoneTimes` oder Summe 0.

`DoneDetailChart.tsx` — Zweigwahl über `visibleCompliance()`: sichtbare
Ampel → Stufenchart (Soll gestrichelt/Ist gefüllt je Balken, ✓/✗-Farbe über
`fulfilled`, Fade/Ampel-Fußzeile mit `RATING_ICON`/`RATING_COLOR`/
`RATING_LABEL` aus `ComplianceTable.tsx`, dort für diesen Zweck bereits in
13d exportiert); sonst Zonen-Mix-Leiste. `ride == null` → `null` (kein
Crash, kein Chart). Eigenständige Komponente, noch nicht an
`DoneTable.tsx`s `renderChart`-Slot angeschlossen — diese Verdrahtung ist
trivial (`renderChart={(row) => <DoneDetailChart {...row} />}`) und folgt
zusammen mit dem Rest von `PlanningPage.tsx` erst in Etappe 13f.

`done-detail-chart-view-model.test.ts` (10 Tests) + `DoneDetailChart.test.tsx`
(5 Tests) grün, bestehende Suite weiterhin grün (577/577 im `app`-Projekt),
`npx tsc -b --noEmit` fehlerfrei, `npm run build` fehlerfrei.

### Abnahme

- [x] Helper-Tests grün (beide Zweige + Fallback)
- [x] Komponente rendert ohne Crash bei fehlenden Daten (kein Chart statt
      Fehler)

---

## Fenster 13f — `PlanningPage.tsx` verdrahten

**Ziel:** Die neuen Bausteine ersetzen die alten Listen in der Seite.
**Vorbedingung:** 13b, 13c, 13d, 13e abgeschlossen.
**Modell:** `[OP]` (Verdrahtung mehrerer bestehender Hooks/State)

1. `sections.weeks.map(...)` + `DaySlotRow`-Mount → `<WeekGrid>` (gespeist
   aus `buildWeekGrid()`, nicht mehr aus `sections.weeks`).
2. `CardSection("✅ Absolviert…")` → `<DoneTable>`.
3. `CardSection("⚠️ Verpasst…")`/`("🚫 Ausgefallen…")` entfallen — abgedeckt
   durch Status-Symbole im Raster + Lücken-Chips der Done-Tabelle.
   `CardSection` selbst nur entfernen, wenn danach nachweislich kein
   Aufrufer mehr existiert (vorher grep prüfen).
4. `DndContext`/`sensors`/Handler bleiben, `event.over?.id` kommt jetzt von
   einer Grid-Zelle statt `DaySlotRow` — Signaturen von `resolveDrop()`/
   `canDragCard()` bleiben unverändert.
5. Innerer `maxWidth: 880` per visueller Prüfung erweitern (nicht blind den
   Mockup-Wert 1280 übernehmen, gegen `PageShell`s 2040-Deckel abgleichen).
6. „+ Karte"/„Karte anlegen" wandert vom Hero-Card-Header in den Kopf des
   Raster-Bereichs.

### Stand

**Umgesetzt** (19.08.2026): `PlanningPage.tsx` verdrahtet — `sections.weeks.map(...)`
+ `DaySlotRow`-Mount durch `<WeekGrid weeks={buildWeekGrid(cards, rides, TODAY)}>`
ersetzt (eigener `weekGrid`-`useMemo`, unabhängig von `buildPlanningSections()`s
`sections.weeks`, das weiter nur die Fortschritts-Statistik liefert),
`renderDetail`-Slot an `<WeekGridDetailRow>` durchgereicht. `CardSection("✅
Absolviert…")` durch `<DoneTable>` ersetzt (`buildDoneRows`/`planFidelitySummary`/
`gapsChips` aus 13d, `renderChart`-Slot an `<DoneDetailChart>`).
`CardSection("⚠️ Verpasst…")`/`("🚫 Ausgefallen…")` entfernt (Status-Symbole im
Raster + Lücken-Chips der Done-Tabelle decken das jetzt ab) — `CardSection()`
selbst hatte danach nachweislich keinen Aufrufer mehr (grep bestätigt) und wurde
mit gelöscht, ebenso die zugehörigen jetzt ungenutzten Imports (`PlanCard`-
Komponente, `phaseColor`, `canDragCard` — `DaySlotRow`-Import bereits entfernt,
Datei selbst bleibt bis 13h stehen). Leerzustands-Meldung ("Alle geplanten
Sessions sind abgeschlossen 🎉") prüft jetzt `weekGrid.length`/`sections.done.length`
statt `sections.weeks.length` — nötig, weil `weekGrid` (anders als `sections.weeks`)
bewusst auch reine Vergangenheits-Wochen zeigt (kein künstliches Wochenlimit,
Etappe-13-Plan). „+ Karte" sitzt jetzt im Kopf des Ausstehend-Bereichs statt im
Hero-Card. Innerer `maxWidth` 880 → 1100 (visuell im Dev-Server geprüft, s. u.
— Mockup-Wert 1280 bewusst nicht blind übernommen, `PageShell`s 2040-Deckel
bleibt weit drüber). `DndContext`/Sensoren/`handleDragEnd` unverändert —
`event.over?.id` kommt jetzt von einer `WeekGrid`-Zelle statt `DaySlotRow`,
Signaturen von `resolveDrop()`/`canDragCard()` unangetastet (`canDragCard()`
wird nur noch innerhalb von `WeekGrid.tsx`/`WeekGridDetailRow.tsx` aufgerufen,
nicht mehr direkt in `PlanningPage.tsx`).

`npx tsc -b --noEmit` fehlerfrei, `npm run build` fehlerfrei, `npx vitest run
--project app` grün (577/577, keine Testdatei geändert — reine Verdrahtung ohne
neue Logik). Manuell im Dev-Server geprüft (Playwright MCP, `browser_snapshot`/
`browser_take_screenshot`, je einmal am Ende dieses Fensters, nicht iterativ):
Athlet 1 (Schreibrechte, lokaler Dev-Bypass) UND Athlet 2 (read-only) — Raster
rendert für beide korrekt (bei Athlet 2 kein „+ Karte", keine Drag-Attribute
aktiv), Tageszelle aufklappen zeigt `WeekGridDetailRow` mit Bearbeiten/
Verschieben/Ausfallen, Done-Tabellen-Zeile aufklappen zeigt `DoneCompareBlock` +
`DoneDetailChart` (Zonen-Mix-Zweig getestet), Export/Import/Block-Dialoge
weiterhin an ihrer bisherigen Stelle sichtbar. **Nicht** geprüft: echte
Drag-Geste (Playwright-Klick auf eine Zelle mit aktiver `useDraggable`-
Bindung wird von Playwrights Aktionierbarkeits-Check als „nicht enabled"
abgelehnt, weil dnd-kit `aria-disabled` auf nicht-ziehbaren Zellen setzt —
laut `docs/AGENTS.md`/CLAUDE.md-Konvention bleibt die finale Drag-Bestätigung
ohnehin bei Alex im echten Browser).

**Beiläufig gefunden und mit Alex' Ok direkt mitbehoben:** beim Aufklappen
einer Rastertageszelle meldete die Konsole einmalig eine React-DOM-Warnung
(„Updating border borderLeft" — Shorthand/Longhand-Konflikt) aus
`WeekGrid.tsx`s `DayCell`-Styleobjekt (`border`-Shorthand + `borderLeft`
gemischt, Etappe 13b, bereits committet). Fix: `border` durch explizites
`borderTop`/`borderRight`/`borderBottom` ersetzt, `borderLeft` bekommt den
Akzent-Wert oder denselben `borderRule`-String als Fallback statt `undefined`
— keine Shorthand/Longhand-Mischung mehr. Erneut im Dev-Server geprüft:
Konsole meldet nach dem Fix 0 Fehler beim selben Aufklapp-Klick (vorher 1).

### Abnahme

- [x] `npm run build` (app/) fehlerfrei
- [x] `npm test` (app/) grün
- [x] Manuelle Prüfung im Dev-Server: Athlet 1 (Schreibrechte) UND Athlet 2
      (read-only) — Raster rendern, Zelle aufklappen, Drag verschieben,
      Done-Tabelle aufklappen, Export/Import/Block-Dialoge weiter
      funktionsfähig — **außer** der echten Drag-Geste selbst (s. Stand oben,
      bleibt laut Projektkonvention Alex' finale manuelle Bestätigung)

---

## Fenster 13g — Politur bestehender Komponenten

**Ziel:** Feinabgleich von TrainerBar/ExportPanel/ImportDialog/
ProposalList/ProposalCompare/BlockDialog/DeltaBanner gegen das Mockup —
nur echte Abweichungen, keine Strukturänderung.
**Vorbedingung:** keine, unabhängig von 13a–13f startbar.
**Modell:** `[HA]`

1. `TrainerBar.tsx`: Kachel-Grid ggf. auf `repeat(4, minmax(0,1fr))` fix —
   **vorher prüfen**, ob `auto-fill` bewusst für schmale Ansichten gewählt
   wurde (Git-Historie/Kommentar), bevor es entfernt wird.
2. `DeltaBanner.tsx`/`ProposalBanner.tsx`/`BlockDialog.tsx`/
   `ImportDialog.tsx`: Radius/Abstand/Typografie stichprobenartig gegen das
   Mockup prüfen, nur bei echter Abweichung anpassen.
3. Keine neuen Tests — bestehende `*.test.tsx` müssen unverändert grün
   bleiben.

### Stand

**Umgesetzt** (19.08.2026): Mockup-Quelldatei (`Planungstab Live.dc.html`,
Projekt „Rad-Dashboard Hero-Redesign") war lokal nicht vorhanden — über den
von Alex geteilten claude.ai-Design-Link per `DesignSync` (`get_project` +
`get_file`) geladen und für den Soll-Ist-Vergleich ausgewertet.

1. `TrainerBar.tsx`-Kachel-Grid **bewusst nicht geändert**: Mockup nutzt
   festes `repeat(4, minmax(0, 1fr))`, Code nutzt seit Etappe 7a
   `repeat(auto-fill, minmax(170px, 1fr))`. Git-Historie zeigt keinen
   Kommentar, der auto-fill explizit für schmale Ansichten begründet — aber
   das Mockup selbst enthält (geprüft: keine `@media`-Regel im ganzen
   Dokument) keinerlei Vorkehrung für schmale Breiten. Ein fester
   4-Spalten-Fix ohne Media-Query würde die 8 Kacheln auf schmalen
   Viewports auf ~4 sehr schmale Spalten pressen; `auto-fill` degradiert
   dagegen sauber auf weniger Spalten/mehr Zeilen. Beibehalten.
2. `DeltaBanner.tsx` + `ProposalBanner.tsx`: echte, systematische Abweichung
   gefunden — Mockup nutzt für beide Banner-Typen durchgängig
   `border-radius: 16px` + `backdrop-filter: blur(14px)`, Code nutzte
   `var(--radius-sm)` (8px) und keinen Blur. `blur(14px)` ist im Code kein
   Einzelfall — `Layout.tsx`s Header nutzt denselben Wert bereits, stützt
   die Vermutung einer echten Lücke statt eines bewussten Unterschieds.
   Beide Dateien angepasst: Radius → `16px`, `backdropFilter: "blur(14px)"`
   ergänzt; `ProposalBanner.tsx`-Padding an `13px 18px` angeglichen.
   `DeltaBanner.tsx`s Schließen-Button war reiner Text ohne Kreisform —
   Mockup zeigt einen runden, umrandeten 26×26-Button — Style ergänzt
   (`getByTitle("Schließen")`-Testselektor bleibt unberührt).
3. `ExportPanel.tsx`/`ImportDialog.tsx`/`BlockDialog.tsx`/`ProposalList.tsx`/
   `ProposalCompare.tsx`: alle 5 Dialog-Overlays im Mockup tragen
   `backdrop-filter: blur(3px)` zusätzlich zum bereits identischen
   `background: rgba(7,9,14,.75)` — im Code fehlte der Blur überall. In
   allen 5 Dateien ergänzt (nur das Overlay-`div`, nicht `GlassCard`
   selbst).
4. **Bewusst nicht angefasst:** Dialogkarten-Hintergrund/-Blur/-Rahmen
   (Mockup `rgba(20,24,34,.94)` + `blur(26px)` + `1px solid
   rgba(255,255,255,.12)` vs. `GlassCard`s geteiltes `--glass`-Token
   `rgba(14,17,25,.62)` + `blur(16px)`, kein Rahmen) und die
   Dialog-Titel-Typografie (Mockup Sora 1.15rem/600 vs. Codes
   `1rem`/700) — beides sind app-weite, geteilte Konventionen
   (`GlassCard`-Komponente bzw. dasselbe `fontFamily:
   var(--font-disp), fontWeight: 700, fontSize: "1rem"`-Muster in
   8 Dateien, u. a. `EventForm.tsx`, `CheckinDialog.tsx`,
   `FtpTriad.tsx` — außerhalb dieses Fahrplans). Eine Änderung nur in den
   Planungstab-Dialogen hätte Inkonsistenz zu diesen anderen Dialogen
   erzeugt statt sie zu beheben — Entscheidung: keine Strukturänderung an
   geteilten Bausteinen im Rahmen von 13g.

`npx tsc -b --noEmit` fehlerfrei, `npm run build` fehlerfrei, `npx vitest
run --project app` grün (577/577, keine Testdatei geändert).

### Abnahme

- [x] Bestehende Tests weiterhin grün
- [x] Visueller Abgleich gegen Mockup-Screenshots (falls vorhanden) oder
      gegen die im Mockup notierten Maße

---

## Fenster 13h — Aufräumen

**Ziel:** Toter Code nach dem Umbau verschwindet.
**Vorbedingung:** 13f abgeschlossen.
**Modell:** `[HA]`

1. `DaySlotRow.tsx` + `DaySlotRow.test.tsx` löschen (durch 13b ersetzt,
   vorher grep auf weitere Importeure).
2. `PlanCard.tsx`s `!isDone`-Zweig nur entfernen, wenn nach 13c/13f
   nachweislich kein Aufrufer mehr übrig ist — sonst als eigenen
   Folgepunkt in `docs/offene-punkte.md` vormerken statt hier blind zu
   löschen.

### Abnahme

- [ ] `grep` bestätigt: keine verbleibenden Importe von `DaySlotRow`
- [ ] `npm run build` + `npm test` (app/) weiterhin grün

---

## Fenster 13i — `docs/offene-punkte.md` ergänzen

**Ziel:** Die vertagte Streams-Pipeline-Idee ist dokumentiert, nicht nur im
Chat-Verlauf dieser Runde.
**Vorbedingung:** keine, unabhängig startbar.
**Modell:** `[HA]`

1. Neuer Punkt im passenden Abschnitt von `docs/offene-punkte.md`
   (bestehendes Bullet-Format), sinngemäß:
   > **Kein Streams-Pipeline für den Planungstab-Detail-Chart** — der reiche
   > Leistungs-/Puls-Verlauf (Rauschen, HR-Linie) aus dem Redesign-Mockup
   > braucht Rohdaten (Sekunden-Samples), die nirgends in der Pipeline
   > existieren. Etappe 13e liefert stattdessen einen vereinfachten
   > Stufenchart aus `core/compliance-match.js`-Intervallen (kein HR — kein
   > Feld dafür in `RideCompliance`). → `app/src/features/planning/
   > DoneDetailChart.tsx`.
2. Prüfen, ob der Eintrag „Design-Überarbeitung mit Claude Design
   (Hero-Bereich, zwei FTP-Ringe)" in `fahrplan-0-uebersicht.md` Anhang C
   noch aktuell ist oder um den Planungstab-Teil ergänzt werden sollte
   (dieser Fahrplan behandelt nur den Planungstab, nicht den Hero-Bereich).

### Abnahme

- [ ] Eintrag steht in `docs/offene-punkte.md`
- [ ] `docs/README.md` verweist auf `fahrplan-5-planungstab-redesign.md`
      (kurzer Absatz analog den anderen Fahrplänen)

---

## Arbeitsweise

- **Pro Fenster ein frischer Claude-Code-Chat möglich** (13a/13d/13g/13i
  sofort parallel, Rest nach Vorbedingung). Nur den Fenster-Auftrag rein,
  nur den Abschlussbericht raus — spiegelt die Arbeitsweise aus
  `fahrplan-0-uebersicht.md` §7.
- Nach jedem Fenster: nur Build/Test (s. jeweilige Abnahme) — **kein**
  `/code-review` pro Fenster. Committet wird trotzdem pro Etappe (13a,
  13b, …), damit die Historie entlang der Fenstergrenzen bleibt.
- `/code-review` läuft **einmal gesammelt am Ende**, nach 13h (s. Fenster
  „Abschluss" unten) — auf den kompletten Diff aller Etappen.
- Playwright MCP nur, falls beim manuellen Check (13f) etwas nicht durch
  reines Lesen/Unit-Tests zu klären ist (Timing/Drag-Race) — nicht
  routinemäßig pro Fenster.

---

## Fenster Abschluss — Gesamt-Review

**Ziel:** Ein einziger `/code-review`-Durchgang über den gesamten
Planungstab-Redesign-Diff (13a–13h zusammen), statt vieler kleiner
Einzel-Reviews pro Fenster.
**Vorbedingung:** 13a–13h abgeschlossen (13g/13i können vorher oder danach
laufen, sind unabhängig).
**Modell:** `[F5]` oder `[OP]` — Gesamtdiff ist groß, verdient das
gründlichere Modell.

1. `/code-review` auf den vollständigen Diff aller Etappen-Commits dieses
   Fahrplans (Schichtenregel `ui → state → core`, Result-Konvention,
   Testlücken über alle neuen Dateien hinweg — Querbezüge zwischen
   Etappen, z. B. Datenfluss `WeekGrid` → `WeekGridDetailRow` → bestehende
   `PlanCard`-Hilfsfunktionen, sind hier leichter zu sehen als pro Fenster).
2. Befunde beheben, betroffene Etappen-Commits ggf. mit Fix-Commits
   ergänzen (keine bestehenden Commits nachträglich amenden).
3. Danach `npx fallow health --score --hotspots --circular-deps`
   gegenprüfen (neue Dateien unter `app/src/features/planning/` können
   Zirkularität/Größe verschieben).

### Abnahme

- [ ] `/code-review` ohne offene Befunde (oder bewusst akzeptierte
      Restpunkte, im Bericht benannt)
- [ ] `npx fallow health --score` zeigt keine neue Regression gegenüber
      dem Baseline-Score

## Anhang — Bewusst nicht Teil dieses Fahrplans

- Streams-Pipeline für echte Leistungs-/Puls-Kurven (→ `docs/offene-punkte.md`,
  Etappe 13i)
- Hero-Bereich-Redesign (separates Mockup-Thema, nicht Teil der
  „Planungstab Live"-Vorlage)
- Mobile-natives Layout (Entscheidung: horizontales Scrollen statt
  eigenem Stack-Layout)
