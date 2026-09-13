# Fahrplan 13: Multi-Sport Phase 3 — Triathlon-Gesamtbild

**Stand:** 2026-09-13 — **E1–E5 gemergt** (`feat: cross-sport load input for
the governor`, `feat: cross-sport weekly load and intensity conflict rules`,
`feat: combined cross-sport load view in load table`,
`feat: per-sport weekly volume in planning tab`). **E5 neu angehängt**
(13.09.2026): E2 hat die `multiSport`-Option in `conflicts.js` gebaut und
getestet, aber keine echte Aufrufstelle setzt sie — s. `docs/offene-punkte.md`
→ „Multi-Sport / Fahrplan 13". Ohne E5 ist die „Phase 3 fertig"-Definition
unten faktisch nicht erfüllt. Fahrplan 12 (Laufplan editierbar, Phase 2) ist fertig,
gemerged, getaggt (`v1.25.0`). Athlet 3 („Hendrik") hat Rad **und** Lauf
editierbar über `plan_cards`, K-HARTFOLGE erkennt harten Lauf nach hartem Rad,
ein Lauf-Trainer-Briefing, HF-bpm-Zonen für Lauf.

**Ausgeliefert:** E1–E5 gemergt, getaggt `v1.27.1` (13.09.2026). Aus
`planning/` (privates Repo, LP2) hierher archiviert.

**Herkunft:** `planning/fahrplan-10-multi-sport.md` → Abschnitt „Phase 3 —
Triathlon-Gesamtbild" (3 Stichpunkte, „später grillen"). Baut auf Fahrplan 10
Phase 1 (Verträge V1–V5) und Fahrplan 12 Phase 2 (Verträge W1–W6) auf — beide
gelten unverändert weiter. Blockiert keinen anderen Fahrplan, ist aber
**Fundament für Idee A** (Multi-Sport-Plan-Generator, `planning/ideen-backlog.md`):
Idee A braucht dieselbe sportartübergreifende Last-Rechnung, die dieser
Fahrplan zuerst baut. Nummer geprüft: `docs/fahrplan-11-kadenz-ziel.md`
(ausgeliefert) und `planning/fahrplan-12-*.md` belegen 11 und 12 — 13 ist frei.

---

## Ziel

Athlet 3 sieht sein Training **als Triathlet**, nicht als drei getrennte
Rad-/Lauf-/Schwimm-Ansichten:

- Die bestehende Form-Kurve (CTL/ATL/TSB-Block, `TrimpLoadChart`) bekommt für
  Multi-Sport-Athleten einen sportübergreifenden Last-Balken (Rad-TSS +
  Lauf/Schwimm-TRIMP in einer Wochensumme), sichtbar als Näherung
  gekennzeichnet.
- Der Planungstab zeigt das Wochenvolumen je Sport nebeneinander (reine
  Dauer-Summe, kein Lastmodell nötig).
- K-WOCHENTSS und K-TID (seit Fahrplan 12 bewusst je Sport getrennt) werten für
  Multi-Sport-Athleten sportübergreifend aus — dieselbe rohe TSS+TRIMP-Summe
  wie im Last-Balken.

**Für Athlet 1/2/4 ändert sich kein einziger Wert und keine Ansicht.** Jeder
neue Zweig ist auf Athleten mit `sports.length > 1` gegatet.

---

## Nicht-Ziele

- **Kein neuer Chart, keine neue Ansicht.** Die kombinierte Last-Kurve
  erweitert den bestehenden `TrimpLoadChart`/Belastungswächter-Block
  (Chart-Merge-Konvention, AGENTS.md); das Wochenvolumen je Sport lebt im
  bestehenden Planungstab, kein eigener Tab.
- **Keine Brick-Sessions.** Athlet 3 hat aktuell 2 Läufe, 0 Schwimm-Einheiten —
  keine Datenbasis, an der sich eine Erkennungsregel prüfen ließe. Bleibt
  benannter Auslöser in „Risiken", kein Code.
- **Kein Multi-Sport-Taper.** Hängt an Idee 7 (Renntag-Modul, braucht einen
  festen Renntermin) und Idee A (Plan-Generator, braucht eine
  Zielvorgaben-Rechnung) — beide existieren noch nicht. Bleibt Nicht-Ziel mit
  Verweis auf Idee 7/A.
- **Keine disziplinspezifische Wettkampflogik** (Pacing-Strategie je Disziplin,
  Wechselzeiten). Aus demselben Grund wie Taper: braucht das Renntag-Modul
  (Idee 7). Bleibt Nicht-Ziel mit Verweis auf Idee 7.
- **Kein neues Last-Modell, keine TSS↔TRIMP-Umrechnung** (OF-8 aus Fahrplan
  10). Die Fusion in diesem Fahrplan summiert TSS (Rad) und TRIMP (Lauf/
  Schwimm) **roh**, wie `rideLoad()` es beim ersten sportübergreifenden Aufruf
  ohnehin tut — keine neue Kalibrierungsarbeit, nur eine bewusst gemachte und
  sichtbar gekennzeichnete Vereinfachung. Ein echtes Umrechnungsmodell bleibt
  OF-8, weiter zurückgestellt.
- **Kein Vorgriff auf Idee A.** Phase 3 ist reine Anzeige/Konfliktregel-Fusion,
  kein Generator-Code. Idee A ist ein eigener, späterer Fahrplan.

---

## Getroffene Entscheidungen (Grilling 2026-09-11)

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| P1 | Kombinierte Last-Kurve | **Bestehenden CTL/ATL/TSB-Block erweitern**, kein neuer Chart. | Chart-Merge-Konvention (AGENTS.md): Chart-Masse begrenzen, Belastungswächter lebt bereits im TRIMP-Chart. |
| P2 | Wochenvolumen pro Sport | **Teil vom bestehenden Planungstab**, keine eigene Ansicht. | Natürliche Stelle, wo Athlet 3 seine Woche plant; kein neuer Tab nötig. |
| P3 | K-WOCHENTSS/K-TID | **Zusammenführen**, Teil von Phase 3 — auf gemeinsamer roher TSS+TRIMP-Summe (nicht Fahrplan-12-Zustand „dauerhaft getrennt"). | War in Fahrplan 12 schon als „Cross-Sport-Eichung = Phase 3" angekündigt; nutzt dieselbe Rechnung wie die kombinierte Last-Kurve (P1). |
| P4 | Brick-Sessions | **Zurückgestellt**, nur Risiko-Eintrag. | Keine Datenbasis (2 Läufe, 0 Schwimm) — nichts zu prüfen. |
| P5 | Multi-Sport-Taper | **Aus Phase 3 raus**, Nicht-Ziel mit Verweis auf Idee 7/A. | Braucht festen Renntermin (Idee 7) + Zielvorgaben-Rechnung (Idee A) — beide fehlen. Phase 3 soll nicht an zwei unfertigen Fundamenten hängen. |
| P6 | Disziplinspezifische Wettkampflogik | **Ganz raus**, Nicht-Ziel mit Verweis auf Idee 7. | Gleicher Grund wie P5 — Idee 7 fehlt. |
| P7 | Verhältnis zu Idee A | **Unabhängig, Phase 3 zuerst.** Phase 3 ist reine Anzeige/Analyse, Idee A braucht die Cross-Sport-Last-Rechnung aus Phase 3 als Fundament. | Vermeidet doppelte Arbeit an der Last-Fusion; saubere Reihenfolge statt Verzahnung. |
| P8 | OF-8 (TRIMP als Last-Modell) | **Weiter zurückgestellt.** | Auslöser (spürbare TRIMP-Abweichung oder Renntermin mit pace-verankerten Zielen) noch nicht eingetreten; Phase 3 baut die Summierung gerade WEIL TRIMP sportübergreifend gedacht war. |
| P9 (Bonus) | TSS/TRIMP-Skalen in der Fusion | **Rohe Summe beibehalten, aber sichtbar markieren** — im Code als Kommentar, im Frontend als Hinweistext, im Fahrplan als Risiko. | Eine echte Umrechnung wäre selbst das sport-eigene Lastmodell aus OF-8 (P8) — keine halbe Sache nebenbei bauen. |

---

## Geteilte Verträge (geteilter Kontext für ALLE Etappen)

Jede Etappe liest **nur diesen Abschnitt + ihren eigenen Etappen-Block + den
betroffenen Code**. Die Verträge V1–V5 (Fahrplan 10) und W1–W6 (Fahrplan 12)
gelten unverändert weiter, v.a. V3 (TRIMP-Last, `scale`-Feld) und W4
(Sportart-Herkunft der Last bei Plankarten).

### X1 — Cross-Sport-Last-Eingabe (Ist-Fahrten)

`rideLoad()` (`app/src/core/loadguard.js:41`) wählt schon heute **pro
Aktivität** den richtigen Wert (`tss` bei `sport === "ride"`, sonst `trimp`,
mit Fallback auf den jeweils anderen). Das ist **kein neuer Code** — bisher
bekommt `buildLoadGuard()` aber nie ein sportübergreifendes `rides`-Array: die
Aufrufstelle (`useRides`-Pipeline) filtert vorher immer auf die aktive
Sportart. Phase 3 ist der **erste bewusste Aufrufer**, der für Multi-Sport-
Athleten das ungefilterte Array durchreicht (Muster wie `ridesAll`/`pmcRides`
aus Fahrplan 12 E8b) — dadurch summiert `fosterWeek()` erstmals echte
TSS-Punkte und TRIMP-Punkte in einer Wochenzahl.

**Vereinbart als bewusste Vereinfachung (P9), nicht als Bug:**
- Kein Umrechnungsfaktor. Ein Kommentar an der neuen Aufrufstelle (und an
  `rideLoad()` selbst) hält fest: „TSS (Rad) + TRIMP (Lauf/Schwimm) werden roh
  summiert — keine belegte Skalengleichheit, s. Fahrplan 10 OF-8/Fahrplan 13
  Risiken."
- Gilt **nur** für Athleten mit `sports.length > 1` (Multi-Sport-Flag, wie
  `multiSport` in `loadguard.js` seit Fahrplan 10 E6). Für 1/2/4 bleibt das
  Eingangs-Array exakt wie heute (nur `ride`-Zeilen) → Golden-Master 0 Diff.

### X2 — Cross-Sport-Last-Eingabe (Plankarten, für K-WOCHENTSS/K-TID)

`app/src/core/conflicts.js` filtert K-WOCHENTSS/K-TID seit Fahrplan 12 E4
explizit auf `sport === "ride"`-Karten/-Ist-Fahrten (Kommentar „Cross-Sport-
Eichung = Fahrplan 10 Phase 3"). Dieser Filter fällt für Athleten mit
`sports.length > 1` weg — die Regeln werten dann alle Sportarten aus, mit dem
Last-Wert aus `estimateTss()` (der je Karte schon `scale.source: "tss"` oder
`"trimp"` trägt, W4 aus Fahrplan 12). Für 1/2/4 bleibt der Filter-Effekt
identisch (sie haben ohnehin nur `ride`-Karten) — der Code-Zweig wird aber
bewusst als „gilt nur bei >1 Sport" markiert, nicht stillschweigend entfernt.

K-HARTFOLGE bleibt unverändert (ist seit Fahrplan 12 E4 bereits
sportübergreifend).

### X3 — Wochenvolumen-Vertrag (Dauer, kein Lastmodell)

Eine reine Dauer-Aggregation je Sport und Kalenderwoche (`Ride.min` aus den
Ist-Fahrten — nicht `durationMin`/`movingTime`, wie hier ursprünglich stand,
keine Last-Umrechnung nötig). Unabhängig von X1/X2 — kann parallel gebaut
werden. Existierende Wochenaggregation (`app/src/core/aggregate.js`) als
Vorbild/Basis prüfen, nicht neu erfinden — umgesetzt als eigene Funktion
`weeklyVolumeBySport(rides, weekKey)` dort (E4).
„Diese Woche" ist bewusst die echte, laufende Kalenderwoche
(`isoWeekKey(TODAY)`), nicht `sections.stats.currentWeekLabel` (die vom
Blockmodell/Plan-Offset abweichende „aktuelle" Plan-Woche) — gegrillt/geklärt
in E4.

---

## Etappen

Jede Etappe: in **einem** Claude-Code-Fenster machbar, Kontext = dieser
„Geteilte Verträge"-Abschnitt + der eigene Etappen-Block + der genannte Code.
Ein Commit je Etappe. Commit-Nachrichten englisch. Vor jedem Commit-Vorschlag:
`node -c` (Root-JS) → `npm test` (betroffener Teil) → `/code-review` auf den
Diff → bei UI-Änderung einmal gegen den lokalen Docker-Container
(`docker compose -f docker-compose.dev.yml up -d`, `http://localhost:8080`).

---

### E1 — Cross-Sport-Last für den Governor öffnen

**Ziel:** `buildLoadGuard()` bekommt für Multi-Sport-Athleten das
ungefilterte Rides-Array (X1). Noch keine UI-Änderung — reine Datenzufuhr +
Tests.

**Änderungen:**
- Aufrufstelle von `buildLoadGuard()` (Hook/Feature-Ebene, wo heute
  `opts.multiSport` gesetzt wird, s. Fahrplan 10 E6/E8a) — für Athleten mit
  `sports.length > 1` das sportübergreifende `ridesAll` statt des
  tab-gefilterten `rides` durchreichen.
- `app/src/core/loadguard.js` — Kommentar an `rideLoad()` (X1) ergänzen: bewusste
  rohe TSS+TRIMP-Summierung, Verweis auf diesen Fahrplan.
- Tests: eine synthetische Woche mit einer Rad-Fahrt (`tss`) **und** einer
  Lauf-Einheit (`trimp`) am selben Tag → `fosterWeek`/`buildLoadGuard` liefert
  die Summe beider Werte. Regressionstest: single-sport Array (wie 1/2/4)
  unverändert.

**Bruchkante:** `npm test -- --project core` grün inkl. **Golden-Master 1/2/4
= 0 Diff**. Neue Cross-Sport-Tests grün. Noch keine sichtbare UI-Änderung.

**Verifikation:** `npm test -- --project core`. `/code-review` auf den Diff.

**Abhängigkeiten:** keine. **Commit:** `feat: cross-sport load input for the governor`

---

### E2 — K-WOCHENTSS/K-TID sportübergreifend

**Ziel:** K-WOCHENTSS und K-TID werten für Multi-Sport-Athleten alle
Sportarten aus (X2). Für 1/2/4 unverändert.

**Änderungen:**
- `app/src/core/conflicts.js` — den `sport === "ride"`-Filter aus Fahrplan 12
  E4 für Athleten mit `sports.length > 1` aufheben (Karten **und**
  Ist-Fahrten-Eingang). Kommentar aktualisieren: „seit Fahrplan 13
  sportübergreifend bei >1 Sport, sonst weiter Rad-only" statt „Cross-Sport-
  Eichung = Phase 3".
- `scripts/lib/core/conflicts.js` (falls gespiegelt) byte-identisch mitziehen,
  `node -c` auf beide — vor dem Ändern prüfen, ob die Kopie überhaupt existiert
  (Fahrplan 12 Risiko-Notiz: der Sync ruft die Konfliktregeln evtl. gar nicht
  auf).
- Tests: harte Radkarte + harte Laufkarte in derselben Woche → K-WOCHENTSS
  löst jetzt aus (vorher durch den Rad-only-Filter nicht). Regressionstest:
  Athlet 1/2/4 (nur `ride`-Karten) unverändert.

**Bruchkante:** `npm test -- --project core` grün inkl. **Golden-Master 1/2/4
= 0 Diff**. Neue Fusions-Tests grün.

**Verifikation:** `node -c` (beide `conflicts.js`-Kopien, falls vorhanden).
`npm test -- --project core`. `/code-review` (Golden-Master, Schichtenregel).

**Abhängigkeiten:** E1 (nutzt dieselbe Last-Grundlage gedanklich, technisch
unabhängig baubar — parallel zu E1 möglich, aber nacheinander empfohlen wegen
gemeinsamer Verifikationslogik). **Commit:**
`feat: cross-sport weekly load and intensity conflict rules`

---

### E3 — Kombinierte Last-Kurve im Belastungswächter-Block

> **Korrektur (13.09.2026, bei Umsetzung):** `app/src/charts/TrimpLoadChart.tsx`
> existiert nicht mehr (entfernt beim TraceCard-Umbau). Die Wochenlast lebt
> seitdem als Tabelle (`app/src/features/analysis/LoadTable.tsx` +
> `analysis-view-model.ts::LoadRow`/`buildLoadRows()`), nicht als Chart — die
> Änderung unten landet dort. Außerdem stellte sich bei der Umsetzung heraus,
> dass `buildLoadRows()` bei multiSport bereits seit E1 den kombinierten
> Rohwert liefert (ridesAll statt rides) — ganz ohne Kennzeichnung. Alex hat
> sich auf Rückfrage für die kleinere Variante entschieden: nur ein festes
> Näherungs-Label ergänzen, **keine** zusätzliche „nur Rad"-Zeile daneben
> (die Zeile unten ist entsprechend angepasst).

**Ziel:** Die bestehende Wochenlast-Tabelle im Belastungswächter-Block
kennzeichnet den bei Multi-Sport-Athleten bereits kombinierten Wert
(TSS+TRIMP roh addiert, aus E1) sichtbar als Näherung.

**Änderungen:**
- `app/src/features/analysis/LoadTable.tsx` — neue optionale Prop
  `approximate?: boolean`, zeigt bei `true` einen fest sichtbaren Hinweistext
  „TSS (Rad) + TRIMP (Lauf/Schwimm) addiert, näherungsweise" über der Tabelle
  (kein Tooltip-only, Muster `PaceZoneScale.tsx`/„geschätzt"-Kennzeichnung).
  Bewusst **kein** neues Feld auf `LoadRow` (Code-Review-Hinweis: `multiSport`
  ist ein einziger Wert für die ganze Tabelle, kein Pro-Zeilen-Wert — dieselbe
  Konvention wie das bestehende `ownPlan: boolean` in `LegacyKpiAppendix.tsx`).
- `LegacyKpiAppendix.tsx` bekommt eine neue `multiSport: boolean`-Prop und
  reicht sie als `approximate` an `LoadTable` durch; `AnalysisPage.tsx`
  übergibt das dort bereits vorhandene `multiSport` (Fahrplan 10 E8a).
- Kein neuer Chart, kein neuer Tab (P1) — die bestehende Komponente wird
  erweitert.
- Für 1/2/4 keine sichtbare Änderung (kein Multi-Sport-Flag → kein Hinweis).

**Bruchkante:** Docker-Container `:8080` — Athlet 3 sieht in „Weitere
Kennzahlen" → „Belastung & Erholung" den Näherungs-Hinweis über der
Last-Tabelle. Athlet 1 unverändert (kein zusätzliches Element).
`npm run build` + `npm test -- --project app` grün.

**Verifikation:** View-Model-Tests. `npm run build`. Docker-Container.
`/code-review`.

**Abhängigkeiten:** E1. **Commit:** `feat: combined cross-sport load view in load table`

---

### E4 — Wochenvolumen pro Sport im Planungstab

**Ziel:** Der Planungstab zeigt für Multi-Sport-Athleten das Wochenvolumen
(Dauer) je Sport nebeneinander — reine Anzeige, kein Lastmodell (X3).

**Änderungen:**
- `app/src/features/planning/PlanningPage.tsx` — eine kompakte Zeile „Diese
  Woche: Rad Xh · Lauf Yh · Schwimm Zh" auf Basis der Ist-Fahrten-Dauer der
  echten, laufenden Kalenderwoche (`isoWeekKey(TODAY)`, nicht die
  Plan-„aktuelle" Woche aus `sections.stats.currentWeekLabel`). Nutzt die neue
  `weeklyVolumeBySport()` in `core/aggregate.js`, keine neue Last-Funktion.
- Sichtbar nur bei `sports.length > 1` (wie der Sport-Umschalter selbst).
  Gerendert unabhängig davon, ob für den aktiven Sport-Tab schon ein Plan
  angelegt ist (eigener Anzeige-Block, nicht in der Plan-Hero-Kachel — die
  wird sonst bei „noch kein Plan" gar nicht gerendert). Gate hängt an
  `useRides` (ridesLoading/ridesError), nicht an `usePlanCards` — getrennte
  Query, eigener Ladezustand.

**Bruchkante:** Docker-Container `:8080` — Athlet 3 sieht im Planungstab die
Wochenvolumen-Zeile, unabhängig vom aktiven Sport-Tab. Athlet 1 unverändert
(keine Zeile). `npm run build` + `npm test -- --project app` grün.

**Verifikation:** View-Model-/Aggregations-Tests. `npm run build`.
Docker-Container.

**Abhängigkeiten:** keine (X3 ist unabhängig von X1/X2) — **parallel zu
E1–E3 baubar.** **Commit:** `feat: per-sport weekly volume in planning tab`

---

### E5 — `multiSport` an den echten Aufrufstellen von `detectConflicts()`

**Ziel:** E2 hat die `multiSport`-Option in `conflicts.js` gebaut und
getestet (X2), aber **keine Aufrufstelle setzt sie** — K-WOCHENTSS/K-TID
werten für Hendrik im Planungstab und in der Vorschlags-Vorschau bislang
weiterhin nur Rad aus. E5 verdrahtet die Option an den zwei echten Stellen
und behebt dabei den bekannten K-TID-Randfall (`docs/offene-punkte.md` →
„Multi-Sport / Fahrplan 13", beide Punkte).

**Änderungen:**
- `app/src/features/planning/PlanningPage.tsx:273` — der bestehende
  `detectConflicts(projection, projectionCards, projectionEvents, rides, {…})`-
  Aufruf bekommt `multiSport: athleteSports.length > 1` (dieselbe
  `athleteSports`-Variable, die E4 schon berechnet). **Geklärt per Test
  (nicht wie ursprünglich hier vermutet):** K-WOCHENTSS hängt gar nicht von
  `actuals` ab — die Wochen-TSS kommt ausschließlich aus `projection.days`,
  die schon auf den (bereits sportübergreifenden) `projectionCards` basiert;
  `rides` (tab-gefiltert) reicht dafür unverändert. **K-TID dagegen braucht
  wirklich `rideData?.ridesAll`** statt `rides` als `actuals` — es liest die
  Ist-Fahrten für die Intensitätsverteilung direkt aus diesem Parameter, ein
  tab-gefiltertes Array enthält Lauf-/Schwimm-Einheiten unabhängig von
  `multiSport` schlicht nie.
- `app/src/core/proposal-preview.js::previewProposal()` — die Options an
  beide `detectConflicts()`-Aufrufe (vorher/nachher, Zeile 86/89) um
  `multiSport` ergänzen (bisher nur `athleteId`/`offsetWeeks` durchgereicht).
- `app/src/features/planning/proposal-review-view-model.ts` — `ImpactContext`
  (Zeile 94) um optionales `multiSport?: boolean` erweitern, in `preview()`
  (Zeile 135) an `previewProposal()` weitergeben.
- `app/src/features/planning/ProposalList.tsx:75` und
  `app/src/features/planning/ProposalCompare.tsx` (dort, wo `ctx` gebaut
  wird) — `multiSport` in den `ctx`-Objekt-Literal aufnehmen, berechnet aus
  `athleteConfig(athleteId)?.sports?.length > 1` (Muster wie E4).
- **K-TID-Randfall (`docs/offene-punkte.md`, zweiter Punkt):**
  `currentBlockTarget()` (`app/src/core/periodization.js`) wählt die
  zeitlich nächstgelegene Karte unabhängig von der Sportart; trägt sie eine
  Phase außerhalb von `PHASE_SIGNATURES` (Lauf-/Schwimm-Blockname), wird
  `tidCorridor` `null` und K-TID feuert die ganze Woche nicht. Mit
  wachsenden echten Plankarten für Hendrik (Rad **und** Lauf/Schwimm)
  reproduzierbar — Fix + Regressionstest zusammen mit der Verdrahtung, nicht
  danach.
- `scripts/lib/core/conflicts.js` (falls Kopie existiert, s. E2-Risiko-Notiz)
  nur mitziehen, falls sie tatsächlich `multiSport` je aufruft — sonst
  unangetastet lassen.

**Umsetzung (13.09.2026):** Der Fix landete **nicht** in
`currentBlockTarget()` selbst, sondern am Aufrufort in `conflicts.js` — die
Kartenliste für den Blockziel-Aufruf wird jetzt unabhängig von `multiSport`
immer auf `activitySport(c) === "ride"` eingegrenzt (statt auf "Phase
bekannt"). Ein erster Versuch, nach "Phase in PHASE_SIGNATURES bekannt" zu
filtern, hätte echte Rad-Erholungs-/Taper-Karten fälschlich übersprungen
(Fund aus `/code-review`) — der Sport-Filter behebt den Randfall sauberer,
ohne diese Falle. `multiSport` löst außerdem als Nebeneffekt aus, dass der
K-WOCHENSPRUNG-Ist-Seed (`lastRiddenWeekTss()`) sportübergreifend summiert
wird — bewusst so belassen (konsistent mit der bereits sportübergreifenden
ersten vollen Planwoche), s. Kommentare in `PlanningPage.tsx`/
`proposal-preview.js`.

**Bruchkante:** `npm test -- --project core` grün inkl. **Golden-Master
1/2/4 = 0 Diff**. Docker-Container `:8080` — Hendrik: eine harte Radkarte +
harte Laufkarte in derselben Woche löst jetzt K-WOCHENTSS aus (vorher
still); ein Trainer-Vorschlag für Hendrik zeigt dieselbe neue Konflikt-
Einschätzung in der Vorschau. Athlet 1/2/4 unverändert. **Live in Docker
verifiziert:** K-WOCHENTSS zeigte 260 TSS (Rad 180 + Lauf ~80) statt vorher
180 (nur Rad) — Testkarten danach wieder gelöscht.

**Verifikation:** `npm test -- --project core` + `npm test -- --project app`.
`npm run build`. Docker-Container. `/code-review` (Golden-Master,
Schichtenregel, Options-Plumbing vollständig bis zur UI durchgereicht) —
drei Runden, jede fand einen echten Fund (Actuals-Quelle für K-TID, ein
falscher Phase-Filter, ein totes `rideCards`).

**Abhängigkeiten:** E2 (nutzt dessen `multiSport`-Option, kein weiterer
Code-Umbau in `conflicts.js` nötig). **Commit:**
`fix: wire multiSport into the actual conflict-check call sites`
(`v1.27.1`, 13.09.2026)

---

## Abhängigkeitsgraph

```
E1 ── E2 ── E5
E1 ── E3
E4 (unabhängig, parallel zu E1–E3 baubar)
```

**Empfohlene Reihenfolge:** E1 → E2 → E3, E4 jederzeit dazwischen oder zuerst,
E5 nach E2 (nutzt dessen Option, kein Wettlauf mit E3/E4 nötig).

**„Phase 3 fertig" =** E1–E5 gemergt: Athlet 3 sieht im Belastungswächter-
Block eine sportübergreifende Wochenlast (als Näherung gekennzeichnet), im
Planungstab sein Wochenvolumen je Sport, und K-WOCHENTSS/K-TID werten harte
Wochen **tatsächlich** über alle Sportarten aus (nicht nur als ungenutzte
Option in `conflicts.js`). Athlet 1/2/4 haben keinen einzigen geänderten
Wert und keine geänderte Ansicht. **Erreicht mit E5, `v1.27.1`.**

---

## Guardrails (müssen in jeder betroffenen Etappe eingehalten werden)

1. **Für Athlet 1/2/4 ändert sich kein einziger Wert.** Golden-Master (V5 aus
   Fahrplan 10) 0 Diff — v.a. E1, E2. Jeder neue Zweig gegatet auf
   `sports.length > 1`.
2. **Kernschicht-Umbau und DB-Migration nie in derselben Etappe.** Dieser
   Fahrplan hat ohnehin keine Migration.
3. **Keine neue Kalibrierung/kein neues Lastmodell** (P8/P9) — die
   TSS+TRIMP-Summe bleibt roh und sichtbar markiert, kein Umrechnungscode.
4. **Näherung ehrlich kennzeichnen** überall, wo die kombinierte Last
   erscheint (E3) — Muster wie `scale`/„geschätzt" aus Fahrplan 10/12.
5. **`scripts/lib/core/conflicts.js`** (falls gespiegelt) byte-identisch
   mitziehen, `node -c` auf beide (E2).
6. **Datenschutz:** Athlet 3 ist ein realer Mensch. Kein echter Name, keine
   Standortkoordinaten in Code, JSON, Kommentaren oder Commit-Messages —
   intern nur `athlete3`, Anzeigename ausschließlich aus `app/src/config.ts`.
7. **`data/*.json`, `.agents/`, `agent/`, `data/skills/`, `skills-lock.json`**
   nie selbst stagen/committen, auch nicht mit `git add -A` (AGENTS.md).

---

## Risiken / offene Punkte

- **TSS+TRIMP roh summiert (P9).** Keine belegte Skalengleichheit zwischen
  Rad-TSS und Lauf/Schwimm-TRIMP — die kombinierte Last-Kurve und die
  K-WOCHENTSS/K-TID-Fusion können bei stark unterschiedlicher Sport-Mischung
  irreführend hoch/niedrig wirken. Bewusst akzeptiert (P9), sichtbar markiert.
  Auslöser für ein echtes Umrechnungsmodell: s. OF-8 unten.
- **OF-8 (TRIMP/TSS als einziges Last-Modell, Fahrplan 10) bleibt offen.**
  Auslöser unverändert: (a) die kombinierte Last weicht über einen ganzen
  Block spürbar von Athlet 3s empfundenem Aufwand ab, **oder** (b) ein
  Renntermin braucht pace-/wattverankerte Zielvorgaben (dann zusammen mit
  Idee A).
- **Brick-Sessions (P4) ungeprüft.** Auslöser zum Aufgreifen: Athlet 3 plant
  echte Brick-Workouts (Rad direkt gefolgt von Lauf) — dafür fehlt aktuell
  jede Datenbasis.
- **Governor-Schwellen bei sportübergreifender Last.** Der bestehende
  `multiSport`-Governor-Zweig (Fahrplan 10 E6, `OWN_LOAD_MEDIAN_WEEKS`/
  `WEEK_LOAD_CEILING_FACTOR`) rechnet nach E1 erstmals gegen die echte
  Cross-Sport-Summe statt gegen sport-eigene Werte — nach echter Nutzung durch
  Athlet 3 reviewen (gleiches Muster wie die bestehende Notiz „Governor
  relativ zur Eigenlast" aus Fahrplan 10).
- **K-WOCHENTSS-Obergrenze und CTL-Baseline nicht konsistent sportübergreifend
  (code-review-Fund, E5).** Die Wochen-TSS-Obergrenze in `PlanningPage.tsx`
  nutzt `ctlAtStart` aus `projectLoad(projectionCards, rides, …)` — `rides`
  bleibt dort bewusst tab-gefiltert (E5 hat nur die `detectConflicts()`-
  Aufrufstellen verdrahtet, nicht `projectLoad`s PMC-Baseline). Für einen
  Multi-Sport-Athleten kann die CTL-Baseline dadurch die Last aus anderen
  Sportarten der letzten Tage unterschätzen, während der Wochen-TSS-Zähler
  bereits sportübergreifend ist. Zusammen mit dem Governor-Punkt oben und
  OF-8 ein Kandidat für eine echte sportübergreifende PMC-Baseline —
  bewusst nicht in E5 mitgelöst (P8/P9: kein neues Lastmodell nebenbei).
- **Idee A (Multi-Sport-Plan-Generator)** ist der benannte Nachfolger: nutzt
  die Cross-Sport-Last-Rechnung aus diesem Fahrplan, plus Multi-Sport-Taper
  (P5) und disziplinspezifische Wettkampflogik (P6), sobald Idee 7
  (Renntag-Modul) steht.
- **`scripts/lib/core/conflicts.js`-Spiegelung** — geprüft in E5: die Datei
  existiert nicht (`scripts/lib/core/` hat keine `conflicts.js`), damit
  erledigt.
