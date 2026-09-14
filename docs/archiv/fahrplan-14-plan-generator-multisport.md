# Fahrplan 14: Ziel-getriebener Plan-Generator für Multi-Sport (Idee A)

**Stand:** 2026-09-13 — gegrillt, Etappen geschnitten, **E0–E7 gemergt**
(`test: golden-master freeze of plan-generator output for ride-only athletes`,
`refactor: sport parameter + strategy table in plan-generator`,
`feat: running plan generation`, `feat: swimming plan generation`,
`feat: per-sport active training plans`, `feat: sport-aware training history
aggregate`, `feat: sport-aware new-plan dialog + running/swimming plan
creation`, `feat: recompute remaining plan weeks for running and swimming`).

**Ausgeliefert:** E0–E7 gemergt, getaggt `v1.28.0` (14.09.2026). Aus
`planning/` (privates Repo, LP2) hierher archiviert. Migration `0038` an
apps01 steht bei Redaktionsschluss noch aus — Alex spielt sie manuell ein
(s. „Migrations-Workflow" in AGENTS.md), erst danach ist die Sport-Spalte auf
`training_plans` auch in echter Produktion aktiv.

**Zielablage:** `planning/fahrplan-14-plan-generator-multisport.md` (gitignored
im öffentlichen Repo, versioniert im privaten `planning/`-Repo — LP2). Wandert
nach Auslieferung als Historie nach `docs/archiv/`.

**Herkunft:** `planning/ideen-backlog.md`, „Idee A — Ziel-getriebener
Plan-Generator für Multi-Sport" (abgeleitet aus Idee 1 / Fahrplan 10 Phase 0).
Baut auf Fahrplan 8 (`app/src/core/plan-generator.js`, bisher reines Rad),
Fahrplan 10 (`sports/running/`, `sports/swimming/` — Zonen + Session-Typen,
Golden-Master-Muster V5) und Fahrplan 12 (`plan_cards.sport`, editierbarer
Laufplan für Athlet 3, bewusst OHNE Generator) auf. Ist die Engine hinter
**Idee 13** (Chat-Onboarding) — jede hier unterstützte Sportart wird dort
automatisch nutzbar, ohne Idee 13 selbst anzufassen.

---

## Ziel

`generatePlan()` erzeugt ab sofort auch periodisierte **Lauf-** und
**Schwimm-Pläne** — nicht nur Rad. Athletenunabhängig: jeder Athlet, dessen
`athleteConfig(id).sports` `"run"`/`"swim"` enthält, bekommt in seinem
jeweiligen Sport-Tab dieselben Bedienelemente wie heute im Rad-Tab —
„Plan erstellen" (Rahmenbedingungen → Vorschau → Übernehmen) und „Rest neu
berechnen". Aktuell ist **Athlet 3** („Hendrik") der einzige Kandidat
(`sports: ["ride","run","swim"]`), aber nichts in der Architektur ist auf ihn
hartkodiert.

**Für Athlet 1/2/4 (reines Rad) ändert sich an Ausgabe und Verhalten NICHTS**
— abgesichert durch einen Golden-Master-Test (E0), der als erste Etappe steht
und danach bei jeder folgenden Etappe grün bleiben muss (0 Diff, Muster
Fahrplan 10 E2/V5).

---

## Nicht-Ziele

- **Kein kombinierter Triathlon-Taper.** Jede Sportart bekommt ihr eigenes
  Zieldatum/Event, keinen gemeinsamen Renntag-Taper über Rad+Lauf+Schwimm
  hinweg. Das bräuchte eine TRIMP↔TSS-Lasteichung, die laut Fahrplan 12 „ein
  Übergang, keine Zielarchitektur" ist (Backlog Idee B / Fahrplan 10 OF-8) —
  eigener, deutlich größerer Fahrplan.
- **Kein automatischer Testtag für Lauf/Schwimm** (kein Pendant zum
  FTP-Test). Schwellenpace/CSS kommen rein aus echten Aktivitäten
  (`estimateThresholdSpeed()`); fehlen sie, läuft der Plan ohne Pace-Ziele
  (Zonen-Label/RPE, wie Athlet 4 heute ohne FTP).
- **Keine Ladder-/`session_formats`-Progression für Lauf/Schwimm.** Das ist
  ride-spezifische, strukturierte-Workout-Maschinerie
  (`plan-workout-select.js`, `workout_structure`, `.zwo`-Export) — Fahrplan 12
  hat `workout_structure` für Lauf bewusst immer `null` gelassen. Lauf/Schwimm
  bekommen v1 eine einfachere, rein phasengetriebene Typauswahl ohne
  Wochen-für-Wochen-Progressionsstufen.
- **Keine neue manuelle Kartenformular-Arbeit für Schwimmen.** Der
  Karten-Dialog kann bereits eine `sport:"swim"`-Karte bearbeiten
  (`PlanCardForm.tsx::isSwimCard`); ein eigenständiges „+ Karte"-Formular für
  Schwimmen (Neuanlage von Hand) bleibt wie in Fahrplan 12 außen vor — der
  Generator ist der einzige Erzeugungsweg für Schwimmkarten in v1.
- **Keine Kalibrierung** der Lauf-/Schwimm-Zonen-/Lastkonstanten (bleibt
  offener Punkt aus Fahrplan 10/12).

---

## Getroffene Entscheidungen (Grilling 2026-09-13)

| # | Frage | Entscheidung | Begründung |
|---|---|---|---|
| 1 | Sportart-Scope v1 | **Laufen + Schwimmen zusammen** | Idee 13 braucht ohnehin beide; die Sport-Module (Fahrplan 10 E5) sind für beide gleich weit. |
| 2 | Athleten-Scope | **Generisch**, über `athleteConfig(id).sports` | Kein Sonderfall athlete3, jeder künftige Multi-Sport-Athlet profitiert automatisch (Muster wie `ringProgress()`/`phaseColor()`). |
| 3 | Modul-Architektur | **Ein `sport`-Parameter** in `generatePlan()`, intern eine Sport-Strategie-Tabelle | Ein Kernmodul bleibt wartbar; Modell-Unterschiede (E9-Muster) und Sport-Unterschiede sind orthogonal, beide als Tabellen neben der Hauptfunktion. |
| 4 | Golden-Master | **Pflicht, erste Etappe (E0)** | Exaktes Fahrplan-10-E2-Muster — schützt die produktiv genutzten Rad-Pläne von Athlet 1/2/4 vor jeder Nebenwirkung. |
| 5 | Lauf-Tab-Einstieg | **„Plan erstellen" zusätzlich zu „+ Karte"** | Sonst bleibt der Generator für Lauf unsichtbar; Karte-für-Karte (Fahrplan 12) bleibt als Alternative. |
| 6 | Event-Scope | **Pro Sportart einzeln** | Kein gemeinsamer Triathlon-Taper in v1 (s. Nicht-Ziele). |
| 7 | Testtage Lauf/Schwimm | **Keine automatischen** | Kein Vorarbeit-Vokabular (`typ:"Pace-Test"`), kein v1-Umfang. |
| 8 | Workout-Darstellung | **Pace-/Speed-Band statt `watts`** | `workoutStructure` bleibt `null` (Fahrplan-12-Nicht-Ziel); die Karte braucht trotzdem ein lesbares Ziel im Dialog. |
| 9 | Recompute („Rest neu berechnen") | **Gleich mitbauen für Lauf/Schwimm** | Gegen meine Empfehlung (kleinerer Schnitt), aber explizit gewünscht — Feature-Parität von Anfang an. Macht E7 nötig. |

### Feinentscheidungen (hier vorgeschlagen, in der jeweiligen Etappe final)

- **`training_plans` erlaubt künftig einen aktiven Plan JE SPORTART, nicht nur
  einen je Athlet.** Der bestehende partielle Unique-Index
  `training_plans_one_active (athlete_id) where is_active` (Migration 0028)
  verbietet heute zwei gleichzeitig aktive Pläne für denselben Athleten —
  das würde einen Triathleten mit aktivem Rad- UND Laufplan sofort
  blockieren. E4 ersetzt ihn durch `(athlete_id, sport) where is_active`.
  Gefunden beim Schreiben dieses Fahrplans, nicht Teil des Grillings — ergibt
  sich zwingend aus Entscheidung 2 (generisch) + 6 (pro Sportart einzeln).
- **`currentFtp`/`ftpTarget`/`ftpMeasuredDate` werden NICHT umbenannt.**
  Additiv statt Rename: neue optionale Felder `currentThresholdSpeed`/
  `thresholdSpeedTarget`/`thresholdSpeedMeasuredDate` (km/h) fürs
  Schwellen-Äquivalent bei `sport !== "ride"`. Ein Rename hätte für 0
  Mehrwert alle bestehenden Rad-Konsumenten (`NewPlanDialog`,
  `new-plan-dialog-view-model.ts`, `plan-generator.test.js`, …) angefasst —
  additiv ist das im Projekt etablierte Muster (s. `plan_cards.sport`,
  Migration 0037).
- **`tssPlanned`/`targetTss` bleiben so benannt**, auch für Lauf/Schwimm —
  tragen dort TRIMP-Näherungswerte statt TSS. Der Feldname ist eine echte
  DB-Spalte (`plan_cards.tss_planned`) mit ~60 Konsumenten im Frontend; eine
  sportneutrale Umbenennung wäre ein Aufwand ohne Nutzen für dieses Vorhaben.
- **Phasenmodell Lauf/Schwimm: 3 Phasen** (Grundlage/Schwelle/VO2max, kein
  Sweet Spot) — deckungsgleich mit den bereits bestehenden
  `RUNNING_PHASE_SIGNATURES`/`SWIMMING_PHASE_SIGNATURES` aus Fahrplan 10 E5.
  Keine neue Entscheidung, nur konsequent zu Ende gedacht.
- **`focus`-Feld** (`allgemein`/`berg`/`langstrecke`/`crit`) bleibt
  Rad-Vokabular und wird von der Lauf-/Schwimm-Strategie ignoriert; das
  Formular schickt für Nicht-Rad-Sportarten einen festen Default
  (`"allgemein"`), damit die bestehende NOT-NULL-Spalte `training_plans.focus`
  unverändert bleibt (kein Schema-Zusatz nötig).
- **`estimateThresholdSpeed()` (`core/critical-speed.js`) ist heute hart auf
  `"run"` gegated.** E3 (Schwimmen) erweitert die Funktion um einen
  `sport`-Parameter (`"run"|"swim"`) statt eine Kopie zu bauen — analog zum
  bewussten „Gerüst wird trotzdem gebaut"-Vorgehen bei den Schwimm-Zonen
  (Fahrplan 10 E5, Alex-Entscheidung 2026-09-07), obwohl 0 Schwimm-Aktivitäten
  existieren.

---

## Geteilte Verträge (geteilter Kontext für ALLE Etappen)

### V1 — `sport`-Parameter + `PlanGeneratorInput`-Zusatzfelder (Vertrag von E1)

```ts
type PlanSport = "ride" | "run" | "swim";

interface PlanGeneratorInput {
  sport?: PlanSport;                    // NEU — fehlt er, Default "ride" (Golden-Master)
  startDate: string;
  mode: "event" | "open";
  eventDate?: string;
  weeks?: number;
  trainingWeekdays: number[];
  weeklyHours: number;
  currentFtp: number | null;                    // nur sport === "ride"
  ftpMeasuredDate: string | null;                // nur sport === "ride"
  ftpTarget: number | null;                      // nur sport === "ride"
  currentThresholdSpeed?: number | null;         // NEU, km/h — nur "run"/"swim"
  thresholdSpeedMeasuredDate?: string | null;    // NEU — nur "run"/"swim"
  thresholdSpeedTarget?: number | null;          // NEU — nur "run"/"swim"
  indoorShare: number;
  focus: "allgemein" | "berg" | "langstrecke" | "crit";  // von "run"/"swim" ignoriert
  level: "einsteiger" | "fortgeschritten";
  model: "pyramidal" | "polarized" | "block" | "linear";
  history: HistoryAggregate;             // V-Erweiterung s. E5
  formats?: Array<object>;               // nur sport === "ride" relevant (session_formats)
  regenerateFrom?: string;
  baseWeekModel?: WeekModelEntry[];
}
```

**Sport-Strategie-Tabelle** (neue Datei, s. E1): ein Objekt je `PlanSport` mit
allem, was zwischen den Sportarten variiert — Phasenliste, Erholungsrhythmus-
Quelle, Zonen-/Session-Typ-Modul, Quality-Day-Auswahlfunktion, Workout-Band-
Funktion (`wattBand` vs. Speed-Band), Test-Tag-Regel (nur `ride`). Ride bleibt
funktional 100 % das, was heute in `plan-generator.js` steht — nur hinter der
Tabelle statt hart im Code.

### V2 — `workout.speedTarget` (Vertrag von E2, genutzt von E3)

Analog zu `workout.watts` bei Rad: ein zusätzliches Feld, das der Generator
füllt, wenn eine Schwellengeschwindigkeit bekannt ist.

```ts
// PlanCardDraft.workout, sport-abhängige Ergänzung zu Fahrplan 8 V4:
{
  ...,                       // warmup, intervals, duration, rest, cooldown, zone, pct, label — unverändert
  watts?: [number, number];      // nur sport === "ride"
  speedTarget?: [number, number]; // NEU, km/h — nur "run"/"swim", wenn currentThresholdSpeed bekannt
}
```

Einheit bleibt roh **km/h** (wie `runningZones`/`swimmingZones::upperPct`
selbst) — die Umrechnung in min/km (Lauf) bzw. min/100 m (Schwimm) ist
Anzeigelogik (`PlanCardForm.tsx`/`PlanPreview.tsx`), kein Kernvertrag. Ohne
`currentThresholdSpeed` bleibt nur `pct` (wie Rad ohne FTP, Entscheidung 22
aus Fahrplan 8).

### V3 — `training_plans` Sport-Spalte + Unique-Index (Vertrag von E4)

```sql
alter table public.training_plans
  add column if not exists sport text not null default 'ride'
    check (sport in ('ride', 'run', 'swim'));

alter table public.training_plans
  add column if not exists threshold_speed_at_creation numeric(5,2),
  add column if not exists threshold_speed_target numeric(5,2);

drop index if exists public.training_plans_one_active;
create unique index training_plans_one_active
  on public.training_plans (athlete_id, sport) where is_active;
```

RLS/Grants unverändert (additive Spalten + Index-Ersatz, kein neues
Policy-Bedürfnis — Muster wie Migration 0037).

### V4 — Quality-Day-Auswahl Lauf/Schwimm (Vertrag von E2/E3)

```ts
function selectGenericWorkout(args: {
  sport: "run" | "swim";
  phase: string;                     // "Grundlage" | "Schwelle" | "VO2max"
  qualitySlot: 1 | 2;
  currentThresholdSpeed: number | null;   // km/h
  targetDurationMin: number;
  targetTss: number;                 // TRIMP-Zielwert der Karte
}): { name: string; typ: string; workout: object; workoutStructure: null; tssPlanned: number; durationMin: number };
```

Wählt aus `RUNNING_PHASE_SIGNATURES`/`SWIMMING_PHASE_SIGNATURES` (`sports/*/
session-types.ts`) einen zur Phase passenden Typ (`qualitySlot 1` → erster
gelisteter Typ, `2` → zweiter, wenn vorhanden), skaliert `defaultLoad` linear
auf `targetDurationMin`/`targetTss`. Keine Ladder-Stufe, keine
`session_formats`-Bibliothek. `workoutStructure` immer `null`.

---

## Etappen

### E0 — Golden-Master-Test (Athlet 1/2/4, reines Rad)

**Ziel:** Vor jeder Code-Änderung an `plan-generator.js` die heutige Ausgabe
für reine Rad-Athleten einfrieren.

**Dateien:**
- `app/src/core/__fixtures__/golden-master/plan-generator-inputs.json` (neu)
  — eine Handvoll repräsentativer `PlanGeneratorInput`-Fälle **ohne**
  `sport`-Feld (heutiger Zustand): je ein `event`- und ein `open`-Fall pro
  Modell (pyramidal/polarized/block/linear), mit/ohne Historie, mit/ohne FTP.
- `app/src/core/plan-generator-golden-master.test.js` (neu) — ruft
  `generatePlan()` für jeden Fixture-Fall auf, vergleicht **deep-equal** gegen
  ein eingefrorenes `plan-generator-golden-master.expected.json` (per
  Wegwerf-Generator einmalig erzeugt, dann eingefroren — Muster Fahrplan 10
  E2).

**Verifikation:** `npm test -- --project core` — neue Suite grün, 0 Diff.
`node -c` auf beide neuen Dateien (JSON ausgenommen).

**Abhängigkeiten:** keine. **Commit:** `test: golden-master freeze of plan-generator output for ride-only athletes`

---

### E1 — `sport`-Parameter + Sport-Strategie-Gerüst

**Ziel:** `generatePlan()` nimmt `sport` entgegen (Default `"ride"`), verzweigt
intern über eine neue Strategie-Tabelle. Verhalten für `sport === "ride"` /
kein `sport`-Feld bleibt **byte-identisch** (Golden-Master aus E0 bleibt grün).
Noch **keine** echte Lauf-/Schwimm-Logik — die Tabelle hat vorerst nur einen
befüllten Eintrag (`ride`).

**Dateien:**
- `app/src/core/plan-generator-sport.js` (neu) — die Sport-Strategie-Tabelle
  (V1-Beschreibung oben) + `RIDE_STRATEGY` (Rad-Verhalten 1:1 aus dem
  bestehenden `plan-generator.js` extrahiert: `TYPE_DEFAULT_TSS`-Import,
  `wattBand`, Testtag-Regel, `formats`-Durchreichung, Verweis auf
  `selectWorkout()`). `RUN_STRATEGY`/`SWIM_STRATEGY` als **Platzhalter**
  (`null`/`throw`) — E2/E3 befüllen sie.
- `app/src/core/plan-generator.js` — `generatePlan()` liest
  `input.sport ?? "ride"`, holt die Strategie aus der Tabelle, reicht sie an
  `buildWeekCards()`/`z2Workout`/`ftpTestWeeks()` durch statt die
  Cycling-Importe hart zu nutzen. `deriveFtpTarget()` bleibt vorerst
  ride-only (nur aufgerufen, wenn `strategy.sport === "ride"`).
- `app/src/core/plan-generator.test.js` — bestehende Fälle unverändert grün
  (kein `sport`-Feld) + 2–3 neue Fälle, die `sport:"ride"` explizit setzen und
  dieselbe Ausgabe wie ohne das Feld erwarten.

**Verifikation:** `npm test -- --project core` — **Golden-Master aus E0 bleibt
0 Diff**, restliche Suite grün. `node -c` auf beide geänderten Core-Dateien.

**Abhängigkeiten:** E0. **Commit:** `refactor: sport parameter + strategy table in plan-generator (ride behavior unchanged)`

---

### E2 — Sport-Strategie Laufen

**Ziel:** `generatePlan({ sport: "run", ... })` liefert einen echten,
periodisierten Laufplan. Noch keine UI-Anbindung.

**Dateien:**
- `app/src/core/plan-generator-sport.js` — `RUN_STRATEGY` befüllt:
  Phasenliste `["Grundlage","Schwelle","VO2max"]` (kein Sweet Spot),
  `sessionTypes: runningSessionTypes` (`sports/running/session-types.ts`),
  `zones: runningZones` (`sports/running/zones.ts`), Testtag-Regel `() => new
  Set()` (keine Testtage, Entscheidung 7).
- `app/src/core/plan-workout-select-generic.js` (neu) + `.test.js` —
  `selectGenericWorkout()` (V4).
- `app/src/core/plan-generator-blocks.js` — `buildPhaseSequence()` bekommt
  eine `phases`-Override-Option, damit `pyramidal`/`linear` auch mit einer
  3-Phasen-Liste sauber Anteile bilden (`polarized`/`block` haben ohnehin
  eigene Sequenz-Builder, dort nur die Phasen-Strings tauschen).
- `app/src/core/plan-generator.js` — `buildWeekCards()` ruft bei `sport !==
  "ride"` `selectGenericWorkout()` statt `selectWorkout()`; lockere Tage
  bekommen ein sportagnostisches Z2-Äquivalent (Dauer×Intensität-Schätzung
  über `sessionTypes.defaultLoad` statt `estimateSessionTSS`/FTP).
- `app/src/core/plan-generator.test.js` — neue Fälle für `sport:"run"`:
  3-Phasen-Struktur, kein Testtag, `speedTarget` nur mit gesetzter
  `currentThresholdSpeed`, Determinismus, CTL-Rampen-Logik bleibt (TRIMP statt
  TSS, gleiche Formel).

**Verifikation:** `npm test -- --project core` — **Golden-Master weiter 0
Diff**, neue Run-Fälle grün. `node -c` auf alle geänderten/neuen Dateien.

**Abhängigkeiten:** E1. **Commit:** `feat: running plan generation`

---

### E3 — Sport-Strategie Schwimmen

**Ziel:** `generatePlan({ sport: "swim", ... })` liefert einen echten
Schwimmplan. Analog E2.

**Dateien:**
- `app/src/core/critical-speed.js` — `estimateThresholdSpeed()` bekommt einen
  `sport: "run" | "swim"`-Parameter (Default `"run"`, bestehende Aufrufer
  unverändert); ein Schwimm-Distanz-Set (`STANDARD_SWIM_DISTANCES_M` o.ä.,
  analog `STANDARD_RUN_DISTANCES_KM`) für die Bucket-Bildung. `ridesForSport`
  filtert entsprechend auf `"swim"`.
- `app/src/core/plan-generator-sport.js` — `SWIM_STRATEGY` befüllt (analog
  `RUN_STRATEGY`, `swimmingSessionTypes`/`swimmingZones`).
- `app/src/core/plan-generator.test.js` — neue Fälle für `sport:"swim"`,
  gleiche Kategorie wie E2 (inkl. „0 Schwimm-Aktivitäten →
  `currentThresholdSpeed: null` → Plan ohne `speedTarget`, kein Fehler").

**Verifikation:** `npm test -- --project core` — Golden-Master weiter 0 Diff.
`node -c` auf alle geänderten Dateien.

**Abhängigkeiten:** E1 (parallel zu E2 möglich). **Commit:** `feat: swimming plan generation`

---

### E4 — `training_plans` Sport-bewusst (Schema + Lese-/Schreibpfad)

**Ziel:** Ein Athlet kann pro Sportart einen eigenen aktiven Plan haben.

**Dateien:**
- `supabase/migrations/0038_training_plans_sport.sql` (neu — Nummer beim
  Umsetzen gegen `supabase/migrations/` prüfen, aktuell zuletzt `0037`): V3
  exakt umsetzen (Spalten + Index-Ersatz). Kommentarstil wie `0037`
  (Befund/Fix/Backfill/Prüfliste).
- `tests/supabase-rls.test.js` bzw. `app/src/api/supabase/training-plans.test.ts`
  — Fall „zwei aktive Pläne desselben Athleten, verschiedene `sport`" geht,
  „zwei aktive Pläne, gleicher `sport`" scheitert am Unique-Index.
- `app/src/api/supabase/training-plans.ts` — `createTrainingPlan()`/
  `deactivatePlan()`/`updateTrainingPlan()` nehmen `sport` entgegen bzw.
  filtern danach (`deactivatePlan` darf nur den Plan **derselben Sportart**
  deaktivieren, nicht z. B. den Radplan beim Neuanlegen eines Laufplans).
- `app/src/api/hooks/useActiveTrainingPlan.ts` — Parameter `sport` (Default
  `"ride"`), lädt die aktive Zeile für **diese** Sport/Athlet-Kombination.
- `app/src/api/hooks/useCreateTrainingPlan.ts` — reicht `sport` durch;
  „zukünftige Karten des alten Plans löschen" bleibt **sportgefiltert**
  (Rad-Neuanlage darf keine Laufkarten anfassen und umgekehrt).

**Verifikation:** Migration in `dashboard-dev` einspielen (SQL-Editor),
Prüfliste abarbeiten. `npm test -- --project app` (neue/angepasste Adapter-
und Hook-Tests). `npm run build`. **Danach dieselbe Migration an apps01** —
Rückfrage bei Alex vor dem Prod-Einspielen.

**Abhängigkeiten:** E1 (nur Verträge, kein Code-Bezug). **Commit:** `feat: per-sport active training plans`

---

### E5 — HistoryAggregate sport-bewusst

**Ziel:** `usePlanHistoryAggregate(athleteId, sport)` liefert für `"run"`/
`"swim"` eine `currentThresholdSpeed` statt `currentEftp`, und
`weeklyActualTss` nur aus den Fahrten/Läufen/Schwimmeinheiten **dieser**
Sportart (`ride.sport`-Feld aus Fahrplan 10 V1).

**Dateien:**
- `app/src/core/plan-history.js` — `buildHistoryAggregate()` bekommt `sport`
  als Parameter; bei `"ride"` unverändertes Verhalten (eFTP/Power-Curve); bei
  `"run"`/`"swim"`: `weeklyActualTss` filtert Rides auf `ride.sport ===
  sport` (TRIMP-Summe statt TSS-Summe, gleiche Funktion `weeklyActualTss()`,
  da sie nur auf `ride.tss`-artigen Feldern rechnet — prüfen, ob Läufe/
  Schwimmeinheiten ihre Last im selben Feld tragen oder ein Umbenennen
  nötig ist), `currentEftp`/`powerCurveWeakness` bleiben `null`,
  `currentThresholdSpeed` aus `estimateThresholdSpeed(rides, { sport })` (E3).
- `app/src/api/hooks/usePlanHistoryAggregate.ts` — `sport`-Parameter
  durchreichen, keine eigene Logik (bleibt dünner Hook).
- Tests in `plan-history.test.js` für beide neuen Sport-Zweige.

**Verifikation:** `npm test -- --project core` + `--project app`. `npm run
build`.

**Abhängigkeiten:** E2, E3 (Zonen-/Session-Typ-Module + `estimateThresholdSpeed`
mit `sport`-Parameter). **Commit:** `feat: sport-aware training history aggregate`

---

### E6 — UI: „Plan erstellen" sport-bewusst + Lauf-Tab-Einstieg

**Ziel:** `NewPlanDialog`/`PlanPreview` funktionieren für `sport ===
"run"|"swim"` (Formularfeld „Schwellenpace" statt „FTP", Vorschau zeigt
`speedTarget` statt `watts`). Lauf-Tab bekommt zusätzlich „Plan erstellen"
neben „+ Karte" (Entscheidung 5). Schwimm-Tabs bestehender „Plan
erstellen"-Knopf (heute versehentlich im Rad-Zweig) wird real sport-bewusst.

**Dateien:**
- `app/src/features/planning/new-plan-dialog-view-model.ts` —
  `buildGeneratorInput()` liest `sport` aus `effectiveSport`, füllt bei
  `sport !== "ride"` `currentThresholdSpeed`/`thresholdSpeedTarget` statt
  `currentFtp`/`ftpTarget`; `focus` bekommt festen Default `"allgemein"` für
  Nicht-Rad-Sportarten (Feinentscheidung oben).
- `app/src/features/planning/NewPlanDialog.tsx` — Formularfeld-Label/Einheit
  sport-abhängig („FTP (Watt)" vs. „Schwellenpace (km/h)"); Modell-Auswahl
  unverändert (alle 4 Modelle bleiben wählbar, auch für Lauf/Schwimm).
- `app/src/features/planning/PlanPreview.tsx` — zeigt `speedTarget` (als
  Pace/100m bzw. min/km umgerechnet) statt `watts`, wenn `sport !== "ride"`.
- `app/src/features/planning/PlanningPage.tsx` — Leerzustand-Block: Lauf-Tab
  zeigt **beide** Knöpfe („+ Karte" UND „Plan erstellen"); Schwimm-Tab nutzt
  jetzt echt `sport:"swim"` statt implizit `sport:"ride"` beim Aufruf von
  `generatePlan()`.
- `app/src/features/planning/PlanCardForm.tsx` — Anzeige des Workout-Ziels im
  Kartendialog um `speedTarget` ergänzen (dieselbe Umrechnung wie
  `PlanPreview.tsx`, ggf. gemeinsamer Helfer `core/format.js` oder
  `sports/*/…`).

**Verifikation:** `npm run build`; `npm test -- --project app`; `npm run dev`
+ Dialog für einen Lauf- und einen Schwimm-Plan durchklicken (Athlet 3);
**vor dem Commit-Vorschlag zusätzlich gegen den lokalen Docker-Container**
(`docker compose -f docker-compose.dev.yml up -d`, `http://localhost:8080`,
Planungstab → Lauf-Tab UND Schwimm-Tab).

**Abhängigkeiten:** E2, E3, E4, E5. **Commit:** `feat: sport-aware new-plan dialog + running/swimming plan creation`

---

### E7 — Recompute („Rest neu berechnen") für Lauf/Schwimm

**Ziel:** Der bestehende E13-Mechanismus (Fahrplan 8) funktioniert auch für
aktive Lauf-/Schwimm-Pläne.

**Dateien:**
- `app/src/features/planning/recompute-plan-view-model.ts` —
  `buildRecomputeInput()` nimmt den `sport` des übergebenen `TrainingPlan`
  entgegen, holt die aktuelle Schwellenpace statt FTP für `sport !== "ride"`.
- `app/src/features/planning/useRecomputeRemainingPlan.ts` — reicht `sport`
  an `useActiveTrainingPlan`/`updateTrainingPlan` durch (E4).
- `app/src/features/planning/RecomputePlanDialog.tsx` — Knopf „Rest neu
  berechnen…" erscheint jetzt auch auf dem Lauf-/Schwimm-Tab, wenn dort ein
  aktiver `week_model`-Plan existiert (`useActiveWeekModel` sport-bewusst
  prüfen — falls die Funktion heute athletenweit statt sportweit denkt, hier
  korrigieren).
- Tests: `recompute-plan-view-model.test.ts`, `useRecomputeRemainingPlan.test.tsx`
  — neue Fälle für `sport:"run"`/`"swim"`.

**Verifikation:** `npm test -- --project core` + `--project app`; `npm run
build`; echter Durchlauf gegen `dashboard-dev` als Athlet 3 (Live-Credentials):
Laufplan „Rest neu berechnen" → nur Zukunft ersetzt, Rad-Plan unberührt.
Docker-Container-Check.

**Abhängigkeiten:** E4, E5, E6. **Commit:** `feat: recompute remaining plan weeks for running and swimming`

**Beim Umsetzen erweitert:** der unten als Risiko benannte Verdacht zu
`useActiveWeekModel` bestätigte sich (s. Risiken-Abschnitt) — die Etappe ging
deshalb über die oben gelistete Dateiliste hinaus und hat zusätzlich
`app/src/features/planning/PlanningPage.tsx` (Knopf-Sichtbarkeit) sowie drei
Aufrufstellen in `app/src/api/hooks/usePlanCards.ts`
(`useMovePlanCard`/`useUndoAdjustment`/`useShiftPlan`) sport-bewusst gemacht.

---

## Abhängigkeitsgraph

```
E0 ── E1 ─┬─ E2 ─┬─ E5 ─┬─ E6 ─ E7
          └─ E3 ─┘      │
                        │
E1 ── E4 ───────────────┘
```

**Empfohlene Reihenfolge:** E0 → E1 → (E2 ∥ E3) → (E4 ∥ E5) → E6 → E7, je ein
Fenster.

**„Kern fertig" =** E0–E7 gemergt: Athlet 3 baut sich im Lauf- UND
Schwimm-Tab einen generierten Plan, prüft die Vorschau, übernimmt ihn,
berechnet den Rest neu — Athlet 1/2/4 unverändert (Golden-Master 0 Diff).

---

## Risiken / offene Punkte

- **`weeklyActualTss()` (`plan-history.js`) rechnet heute auf einem
  `ride.tss`-artigen Feld.** Vor E5 prüfen, ob Lauf-/Schwimm-Aktivitäten ihre
  TRIMP-Last im selben Feld tragen (Fahrplan 10 V3) oder E5 dort zusätzlich
  übersetzen muss.
- **`useActiveWeekModel`/Konfliktregeln (`conflicts.js`) könnten heute
  „ein Plan je Athlet" annehmen**, nicht „ein Plan je Athlet+Sport". Vor E4/E7
  gegenprüfen (`grep -rn useActiveWeekModel app/src`) — falls ja, muss die
  Abfrage um `sport` erweitert werden, sonst zeigt der Lauf-Tab
  fälschlich den Rad-Plan-Status.
  **→ Bei E7 bestätigt:** `useActiveWeekModel` hatte den `sport`-Parameter
  bereits, aber keine Aufrufstelle übergab ihn — alle fielen auf `"ride"`
  zurück (`PlanningPage.tsx`, plus drei Stellen in `usePlanCards.ts`). Bei E7
  mitgefixt (s. Etappen-Notiz oben), statt als eigener Nachtrag ausgelagert.
- **Sportwissenschaftliche Kalibrierung** der Lauf-/Schwimm-Konstanten
  (TRIMP-Defaults, Daniels-/CSS-Zonen) ist unverändert aus Fahrplan 10 offen —
  dieser Fahrplan fügt keine neue Kalibrierung hinzu, nutzt nur das
  bestehende (unkalibrierte) Gerüst.
- **`estimateThresholdSpeed()`-Erweiterung um Schwimmen (E3)** bleibt ohne
  echte Testdaten (0 Schwimm-Aktivitäten) — nur die Rad-/Lauf-Pfad-Regression
  ist mit echten Daten testbar, der Schwimm-Zweig nur mit Fixtures.
- **Migrationsnummer** (`0038`) beim Umsetzen von E4 erneut gegen
  `supabase/migrations/` prüfen — dieser Fahrplan nennt sie nur beispielhaft.
- **`data/*.json` / `.agents/` etc.** nie mitcommitten (AGENTS.md).
