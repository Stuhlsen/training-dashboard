# Fahrplan 8: Trainingsplan-Generator (Athlet baut sich selbst einen Plan)

**Stand:** 2026-09-03 — **Konzept abgestimmt (Grilling-Session mit Alex),
noch keine Etappe umgesetzt.**
**Zielablage:** `docs/fahrplan-8-plan-generator.md`
**Herkunft:** Athlet 2 (`hc_diZee`) ist nach GFNY Bremen 2026 (30.08.) mit
seinem Plan durch. Es gibt bisher **keinen** Weg, im Dashboard einen neuen
Trainingsplan anzulegen — Pläne sind hartkodierte JS-Dateien
(`scripts/lib/plan2.js`, `plan-athlete2.js`, `plan-athlete4.js`). Gesucht:
ein Menü, in dem ein Athlet die Rahmenbedingungen festlegt und daraus ein
sportwissenschaftlich sinnvoller Plan erzeugt wird — **unter Einbeziehung
der bisherigen Trainings**.

Eigenständige Initiative. Baut auf Fahrplan 5 (Planungstab-Redesign),
Fahrplan 6 (Ruhetag-/Plan-Wochen-Modell) und Fahrplan 7 (Self-Service in
Settings) auf. Blockiert keinen anderen Fahrplan.

---

## Ziel

Ein **„Neuer Plan"-Dialog** im Planungstab:

1. Athlet legt Rahmenbedingungen fest (Ziel/Event, Startdatum, Trainingstage,
   Wochentage, Zeitbudget, FTP, Indoor-Anteil, Fokus, Erfahrungslevel,
   Periodisierungsmodell).
2. Ein **reiner Generator** (`app/src/core/plan-generator.js`) baut daraus
   eine periodisierte Wochenstruktur — Blockfolge, Wochen-TSS-Ziele,
   Erholungswochen, Qualitätstage, Taper, FTP-Tests.
3. Der Generator **kalibriert Umfang und Last an der bisherigen Historie**
   (letzte Wochen-Ist-TSS, aktuelle CTL, Erfüllungsquote, eFTP,
   Power-Curve-Schwäche).
4. Die Workouts der Qualitätstage kommen aus der `session_formats`-Bibliothek,
   auf die aktuelle FTP skaliert, über Wochen per Ladder-Logik gesteigert.
5. **Vorschau** (Wochenübersicht) → „Übernehmen" schreibt eine
   `training_plans`-Zeile + die Tageskarten in `plan_cards`.
6. Der Sync ignoriert für Athleten mit aktivem `training_plans`-Eintrag die
   Code-Vorlage.

**Nach dem Kern (E1–E8)** kann Athlet 2 sich einen pyramidalen oder linearen
Plan bauen, in der Vorschau prüfen, übernehmen; der Sync respektiert ihn.

---

## Nicht-Ziele

- **Kein Laufen / Multi-Sport.** Nur Rad, Generator nutzt `sports/cycling/`.
- **Kein Umbau am Vorschlags-/Ladder-System.** Der Generator baut nur den
  Anfangsplan; Konfliktprüfung und Ladder-Fortschreibung laufen danach
  unverändert auf den erzeugten Karten weiter.
- **Kein Zwangs-Umzug bestehender Pläne.** Athlet 1 (Notion/intervals) bleibt
  komplett unberührt. Athlet 4s generierte Code-Vorlage (KW36–47) läuft
  weiter, bis er selbst einen Plan baut.
- **Kein neuer Vorlagen-Code.** Ein erzeugter Plan lebt vollständig in der
  Datenbank, nicht in einer neuen `plan-athleteN.js`.

---

## Getroffene Entscheidungen (Grilling 2026-09-03)

| # | Entscheidung |
|---|---|
| 1 | „Neuer Plan" für **alle Athleten mit echtem Login (1, 2, 4)**. Athlet 2s `readOnly: true` in `app/src/config.ts` wird **entfernt** (Flag stammt aus der Zeit vor CRED4). |
| 2 | Erzeugter Plan lebt **komplett in der DB** (`training_plans` + `plan_cards`). Die Code-Vorlagen bleiben nur eingefrorene Vergangenheit. |
| 3 | Zwei Modi: **`event`** (Zieldatum, Plan zählt rückwärts) und **`open`** (kein festes Ende, Länge in Wochen wählbar). |
| 4 | Im `event`-Modus: **Dropdown bestehender Events** (Priorität `main`/`secondary` zuerst). Kein passendes Event → Datum + Name im Formular → wird als Event angelegt. |
| 5 | Formularfelder: Startdatum · Trainingstage/Woche + Wochentage · Zeitbudget (h/Woche) · aktuelle FTP (vorbelegt aus `config.ts`/eFTP) · Indoor-Anteil · Fokus · **Erfahrungslevel**. |
| 6 | Athlet wählt **Anzahl Tage + Wochentage**. Der Generator verteilt hart/locker (2 Qualitätstage, ≥ 1 Tag Abstand, langer Tag aufs Wochenende, wenn vorhanden). |
| 7+8 | **4 Modelle** zur Wahl: `pyramidal` (Default), `polarized`, `block`, `linear`. Der Generator schlägt aus Level + Länge + Zeitbudget eines vor; Athlet kann wechseln. |
| 9 | Erholungsrhythmus **level-abhängig**: `einsteiger` → 2:1, `fortgeschritten` → 3:1. Alter (Feld `bmr`, nur Athlet 2) ≥ 40 → auch bei `fortgeschritten` 2:1. Erholungswoche = Umfang ~ −45 %. |
| 10 | Historie steuert **Umfang/Last, nicht die Inhalte**: Woche 1 startet beim Schnitt der letzten ~4 abgeschlossenen Wochen Ist-TSS · Wochen-Steigerung so gedeckelt, dass die projizierte CTL-Rampe ≤ 6 (Ziel) / 8 (Hartgrenze) bleibt · `planAdherence` < ~0,7 → ein Trainingstag weniger + flachere Rampe · Start-FTP = aktueller eFTP, wenn Feld leer · Einsteiger ohne Historie → Level-Default-Tabelle. **Plus** Power-Curve-Schwäche → der Fokus-Block betont die schwächste Dauer (E10). |
| 11 | FTP-Ziel: `event.ftp_goal` → sonst `forecastFtp()`-Prognose auf das Plan-Ende → Athlet überschreibbar. |
| 12 | Qualitäts-Workouts aus **`session_formats`**, auf FTP skaliert, Steigerung über die vorhandene Ladder-Logik (`app/src/core/ladder.js`). |
| 13 | **Admin-UI** zum Anlegen neuer `session_formats` wird gebaut (E11). |
| 14 | Neue Tabelle **`training_plans`** (Rahmenbedingungen + materialisierte Wochenstruktur `week_model`). Tage in `plan_cards` mit neuem `plan_id`. `plan-week-model.js` wird für Athleten mit aktivem Plan **aus `training_plans.week_model`** abgeleitet statt aus der Code-Konstante. |
| 15 | **Vorschau** (Wochenübersicht) → „Übernehmen"/„Verwerfen". Nachbessern bleibt möglich. |
| 16 | Nachbessern = bestehende Planungstab-Werkzeuge (Einzelkarten). „Plan neu erzeugen" ersetzt **nur zukünftige** Karten (ab heute), alter Plan wird `is_active = false`, Warnung im Dialog. Später (E13): „Rest neu berechnen". |
| 17 | Sync: aktiver `training_plans`-Eintrag → Code-Vorlage (`plan-athlete2/4.js`) für den Athleten **übersprungen**. |
| 18 | Knopf im **Planungstab oben** + Leerzustand „Plan erstellen", wenn kein aktiver Plan da ist. |
| 19 | **Trainer darf** den Plan für seinen Athleten bauen — deckt `canWriteForAthlete()` bereits ab. |
| 20 | **Nur Rad.** |
| 21 | **Getrennt** vom Vorschlags-/Ladder-System. |
| 22 | Workout-Ziel: **`pct` + `watts`**, wenn FTP vorhanden; sonst nur `pct` (Einsteiger). Hält `.zwo`-Export und Wahoo-Push für alle nutzbar. |
| 23 | Generator plant **FTP-Tests**: am Anfang (wenn FTP fehlt oder älter als ~42 Tage), dann alle ~6–8 Wochen, sowie am Plan-Ende. |
| 24 | Nach einem Testtag-Ergebnis: **halbautomatischer** Dialog „FTP jetzt X — zukünftige Karten umrechnen?" → rechnet nur die `watts` künftiger Karten neu (`pct`/Struktur bleiben). |
| 25 | Athlet 4: Code-Vorlage läuft weiter bis zum eigenen Plan. Kein Migrations-Umzug. |
| 26 | **Ein Fahrplan-Dokument**, in Etappen mit sauberen Bruchkanten geschnitten — jede Etappe ist in einem eigenen Claude-Code-Fenster machbar (Token sparen). Die gemeinsamen Verträge unten sind der einzige geteilte Kontext. |

### Feinentscheidungen (im Fahrplan vorgeschlagen, in der jeweiligen Etappe final)

- **Phasen-Vokabular des Generators:** wiederverwendet die bestehenden Strings
  `"Sweet Spot"`, `"Schwelle"`, `"VO2max"`, `"Taper"`, `"Erholung"`
  (`app/src/config.ts::PHASES`, `periodization.js::PHASE_SIGNATURES`,
  `session_formats.block_targets`) **plus neu `"Grundlage"`** für die
  rein-aerobe Basisphase. `session_formats` braucht dafür ein Format mit
  `block_targets` `["Grundlage"]` (neuer Seed in E3). So bleibt die
  Periodisierungs-Compliance-Bewertung (`periodization.js`) für die
  Intensitätsphasen ohne Übersetzungsschicht nutzbar.
- **Level-Default-TSS (Historie leer):** `einsteiger` ~ 250–350, `fortgeschritten`
  ~ 450–600 TSS/Woche, linear mit dem Zeitbudget skaliert. Exakte Tabelle in E2.
- **Blockfolge je Modell:** grobe Verteilung unten, exakte Wochenzahlen legt
  E2 (`pyramidal`/`linear`) bzw. E9 (`polarized`/`block`) mit Tests fest.

| Modell | Blockfolge (Anteil an Nicht-Taper-Wochen) | Kommentar |
|---|---|---|
| `pyramidal` | Grundlage 25 % · Sweet Spot 25 % · Schwelle 25 % · VO2max ~25 % · Taper | Default, Allrounder. TID-Pyramide. |
| `linear` | Grundlage ~40 % · Sweet Spot ~25 % · Schwelle ~20 % · VO2max ~15 % · Taper | Umfang früh hoch/locker, Intensität wandert nach hinten. Einsteiger / lange Vorlaufzeit, Default-Rhythmus 2:1. |
| `polarized` | Grundlage ~20 % · danach durchgehend 80/20-TID mit Schwelle-/VO2max-Qualitätstagen · Taper | Wenig Phasendifferenzierung; Qualitätstage tragen `"Schwelle"`/`"VO2max"`, Rest strikt Z2. Erfahrene mit mehr Zeit. |
| `block` | Grundlage ~15 % · Block VO2max (2–3 Wo) · Erholung · Block Schwelle (2–3 Wo) · Erholung · Block rennspezifisch (2–3 Wo) · Taper | Konzentrierte Reize, braucht Erfahrung + Erholung. Kürzere Vorbereitung. |

---

## Gemeinsame Verträge (geteilter Kontext für ALLE Etappen)

Jede Etappe liest **nur diesen Abschnitt + ihren eigenen Etappen-Block +
den betroffenen Code**. Ändert eine Etappe einen Vertrag, wird er hier
aktualisiert und die abhängigen Etappen im Abhängigkeitsgraphen genannt.

### V1 — Tabelle `training_plans` (Vertrag von E1)

```sql
create table public.training_plans (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.profiles(id) on delete cascade,
  created_by        uuid not null references public.profiles(id),
  is_active         boolean not null default true,
  mode              text not null check (mode in ('event','open')),
  goal_event_id     uuid references public.events(id) on delete set null,
  start_date        date not null,
  end_date          date not null,
  weeks             smallint not null,
  model             text not null check (model in ('pyramidal','polarized','block','linear')),
  focus             text not null check (focus in ('allgemein','berg','langstrecke','crit')),
  level             text not null check (level in ('einsteiger','fortgeschritten')),
  training_weekdays smallint[] not null,          -- ISO 1..7
  weekly_hours      numeric(4,1),
  indoor_share      numeric(3,2),                 -- 0..1
  ftp_at_creation   smallint,
  ftp_target        smallint,
  params            jsonb not null default '{}',  -- Roh-Formular + Aggregat-Momentaufnahme (Reproduzierbarkeit)
  week_model        jsonb not null,               -- WeekModelEntry[] (s. V4) — Quelle für plan-week-model
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- nur ein aktiver Plan je Athlet
create unique index training_plans_one_active on public.training_plans (athlete_id) where is_active;

alter table public.plan_cards add column if not exists plan_id uuid
  references public.training_plans(id) on delete set null;
```

RLS/GRANT wie `plan_cards` (Muster aus `0001`/`0005`): `select`/`insert`/
`update`/`delete` für `athlete_id = auth.uid() OR public.is_coach_of(athlete_id)
OR public.is_admin()`, kein `anon`-GRANT.

### V2 — `PlanGeneratorInput` (Vertrag von E2, erzeugt in E5)

```ts
interface PlanGeneratorInput {
  startDate: string;                 // ISO, Montag
  mode: "event" | "open";
  eventDate?: string;                // mode === "event"
  weeks?: number;                    // mode === "open" (bei "event" aus start..event abgeleitet)
  trainingWeekdays: number[];        // ISO 1..7, aufsteigend
  weeklyHours: number;
  currentFtp: number | null;
  ftpMeasuredDate: string | null;
  ftpTarget: number | null;          // null => Generator setzt aus forecast
  indoorShare: number;               // 0..1
  focus: "allgemein" | "berg" | "langstrecke" | "crit";
  level: "einsteiger" | "fortgeschritten";
  model: "pyramidal" | "polarized" | "block" | "linear";
  history: HistoryAggregate;         // V3; Einsteiger/ohne Historie => emptyHistory()
}
```

### V3 — `HistoryAggregate` (Vertrag von E4, konsumiert von E2)

```ts
interface HistoryAggregate {
  weeklyActualTss: number[];         // letzte ≤ 8 abgeschlossene Wochen, alt -> neu
  currentCtl: number | null;
  currentEftp: number | null;
  planAdherence: number | null;      // 0..1 über die letzten ~6 Wochen, null wenn kein Plan lief
  ageYears: number | null;
  powerCurveWeakness: "sprint" | "vo2" | "threshold" | "aerob" | null;  // E10; bis dahin immer null
}
// export function emptyHistory(): HistoryAggregate  — alle Felder null / []
```

### V4 — `GeneratedPlan` (Ausgabe von E2; E5 rendert, E6 schreibt)

```ts
interface GeneratedPlan {
  weeks: GeneratedWeek[];
  weekModel: WeekModelEntry[];       // -> training_plans.week_model
  ftpTarget: number | null;
  warnings: string[];                // z.B. "Woche 5: CTL-Rampe am oberen Limit (7.6)"
}

interface GeneratedWeek {
  index: number;                     // 0-basiert
  isoWeek: string;                   // "YYYY-KWnn" (wie core/aggregate.js::isoWeekKey)
  start: string; end: string;        // ISO
  phase: string;                     // "Grundlage" | "Sweet Spot" | "Schwelle" | "VO2max" | "Taper" | "Erholung"
  targetTss: number;
  isRecovery: boolean;
  cards: PlanCardDraft[];
}

interface WeekModelEntry {           // Form von core/plan-week-model.js::PlanWeekEntry + targetTss
  week: string; phase: string;
  start: string; end: string;
  trainingWeekdays: number[];        // ISO 1..7
  targetTss: number;
}

interface PlanCardDraft {            // -> api/supabase createPlanCards() (E6), Feldnamen wie PlanCardInput
  date: string;
  name: string;
  typ: string;                       // KNOWN_PLAN_TYPES (sports/cycling/session-types.js) wo möglich
  phase: string;
  isoWeek: string;
  tssPlanned: number;
  durationMin: number;
  km: number | null;
  workout: object | null;            // { warmup, intervals, duration, rest, cooldown, zone, pct:[lo,hi], watts?:[lo,hi], label }
  workoutStructure: object | null;   // { version:1, steps:[...] } — Schema aus Migration 0013
  isQuality: boolean;
  isTest: boolean;
}
```

### V5 — `selectWorkout()` (Vertrag von E3; E2 ruft bis dahin einen Stub)

```ts
function selectWorkout(args: {
  phase: string;
  weekIndexInPhase: number;          // 0-basiert, treibt die Ladder-Stufe
  qualitySlot: 1 | 2;                // erster / zweiter Qualitätstag der Woche
  focus: PlanGeneratorInput["focus"];
  level: PlanGeneratorInput["level"];
  currentFtp: number | null;
  targetDurationMin: number;
  targetTss: number;
  formats: SessionFormatRow[];       // aus session_formats, vom Aufrufer geladen und durchgereicht
}): { name: string; typ: string; workout: object; workoutStructure: object; tssPlanned: number; durationMin: number };

// Stub bis E3 (in E2 mitgeliefert, in E3 ersetzt):
//   Qualitätstag -> fester Sweet-Spot-Block 3×12 @ 90 % FTP
//   sonst        -> Z2-Dauerblock nach targetDurationMin
```

### V6 — dynamisches `planWeekFor()` (Vertrag von E7)

`core/plan-week-model.js::planWeekFor(athleteId, dateISO, offsetWeeks?)` behält
**Signatur und Rückgabe-Shape** (`{ week, phase, isTrainingSlot, isRestSlot }`).
Neu: hat der Athlet einen aktiven `training_plans`-Eintrag, kommen `week`/
`phase`/`trainingWeekdays` aus dessen `week_model` statt aus `PLAN_WEEK_MODEL`.
Der Aufrufer reicht das `week_model` (oder `null`) rein — `core/` bleibt
I/O-frei. Parallelkopie `scripts/lib/core/plan-week-model.js` byte-identisch
mitziehen.

---

## Etappen

### Kern (E1–E8)

---

### E1 — Datenmodell `training_plans`

**Ziel:** Migration + RLS + RLS-Test. Keine App-Änderung.

**Dateien:**
- `supabase/migrations/0028_training_plans.sql` (neu — laufende Nummer beim
  Umsetzen prüfen, aktuell zuletzt `0027`)
- `tests/supabase-rls.test.js` (erweitern: `training_plans` — Self schreibt/liest,
  Fremd-`athlete_id` zu, Trainer liest über `is_coach_of`, `anon` komplett zu,
  partieller Unique-Index „ein aktiver Plan" greift)

**Vertrag:** V1 exakt umsetzen.

**Verifikation:** Migration in `dashboard-dev` einspielen (SQL-Editor);
`npm test` mit gesetzten `SUPABASE_*`-Vars → neue RLS-Zeilen grün; Spalten-
Check laut Prüfliste im Migrationskopf. **Danach dieselbe Migration an den
apps01-Self-Host-Stack** (echte Produktion) — Rückfrage bei Alex vor dem
prod-Einspielen.

**Abhängigkeiten:** keine. **Commit:** `feat: training_plans table + plan_id on plan_cards`

---

### E2 — Generator-Kern (reine Funktion)

**Ziel:** `generatePlan(input: PlanGeneratorInput): GeneratedPlan` — pyramidal
+ linear, voll unit-getestet, **kein I/O, kein React, kein `document`/`window`**.

**Dateien:**
- `app/src/core/plan-generator.js` (neu, JS + JSDoc wie der Rest von `core/`)
- `app/src/core/plan-generator.test.js` (neu)
- ggf. `app/src/core/plan-generator-blocks.js` (Blockfolge-Tabellen je Modell,
  falls `plan-generator.js` zu groß wird — Fallow „Unit Size" beachten)

**Nutzt bestehende `core/`-Bausteine (nicht neu bauen):**
- `pmc.js::projectPmc`, `CTL_DAYS` — CTL-Rampe je Woche projizieren
- `plan-config.js::CONFLICT_THRESHOLDS` — `ctlRampInfo` (6), `ctlRampWarn` (8),
  `weekTssCeilingFactor` (8), `eventTaperDays` (10), `eventWindowMain`
- `periodization.js::RECOVERY_MAX_SHARE` (0.6) — Erholungswoche
- `ftp-forecast.js::forecastFtp` — FTP-Ziel, wenn `ftpTarget` null
- `format.js::addDaysISO`, `aggregate.js::isoWeekKey` — Datums-/Wochen-Rechnung
- `event-taper.js` — Taper-Fenster

**Kernlogik (Reihenfolge):**
1. Wochenanzahl bestimmen (`event`: `startDate`..`eventDate`; `open`: `weeks`).
2. Blockfolge + Erholungsrhythmus (2:1 / 3:1 nach `level`/`ageYears`) auf die
   Wochen verteilen → `phase` je Woche. Letzte `ceil(eventTaperDays/7)` Wochen
   im `event`-Modus = `"Taper"`.
3. Woche-1-TSS = Ø der letzten ~4 `weeklyActualTss` (sonst Level-Default ×
   Zeitbudget-Faktor). `planAdherence < 0.7` → −1 Trainingstag, Rampenziel
   6 → ~4.
4. Wochen-TSS hochrampen, sodass `projectPmc`-CTL-Anstieg ≤ Ziel (6), hart ≤ 8;
   Erholungswochen −45 %; Peak-Woche ≤ `CTL(Wochenstart) × 8`.
   Grenzverletzungen als `warnings`, nicht als Fehler.
5. Qualitätstage je Woche auf `trainingWeekdays` legen (2 Stück, ≥ 1 Tag
   Abstand), Rest locker, längster lockerer Tag ans Wochenende. Phase der Woche
   bestimmt den Qualitäts-Fokus.
6. Je Karte `selectWorkout()` (V5 — bis E3 der Stub) für Qualitätstage; lockere
   Tage = Z2-Block nach Restdauer. `tssPlanned`/`durationMin` füllen.
7. FTP-Testtage setzen (E23-Regeln — Anfang wenn `ftpMeasuredDate` fehlt/älter
   42 Tage, alle 6–8 Wochen, Plan-Ende). `isTest: true`, eigener `typ`.
8. `weekModel` (V4) materialisieren.

**Verifikation:** `npm test -- --project core` (alles grün) + neue Tests:
- Wochensummen-Rampe hält `ctlRampWarn` nie, `ctlRampInfo` nur mit `warning`
- Erholungswoche ≤ 60 % der Nachbarwochen
- `event`-Modus: Taper-Länge, letzte Woche `"Taper"`, TSB-Projektion im
  `eventWindowMain`-Fenster am Renntag
- `open`-Modus ohne Historie: Level-Defaults greifen, kein NaN
- Deterministisch (gleicher Input → gleicher Output)
- `node -c app/src/core/plan-generator.js`

**Abhängigkeiten:** nur V2/V3/V4/V5 aus diesem Dokument. **Commit:**
`feat: plan generator core (pyramidal + linear)`

---

### E3 — Workout-Auswahl aus `session_formats` + Ladder

**Ziel:** `selectWorkout()` (V5) echt implementieren; ggf. fehlende Formate
als Seed ergänzen.

**Dateien:**
- `app/src/core/plan-workout-select.js` (neu) + `.test.js`
- `supabase/migrations/00XX_session_formats_base_formats.sql` (neu, **nur wenn
  nötig**): Formate, die dem Generator fehlen — mindestens ein
  `block_targets`-`["Grundlage"]`-Format (Z2-Dauer / Tempo 83–90 %). Prüfen, ob
  `sweetspot-long` die „Grundlage"-Phase mit niedrigen Stufen (S1–S2) mit
  abdeckt; wenn ja, entfällt der neue Seed.
- E2s Stub in `plan-generator.js` auf den echten Aufruf umstellen.

**Nutzt:** `ladder.js::generateLadderSteps`/`resolveSteps`/`stepAt` (Stufe je
`weekIndexInPhase`), `session-format-match.js`, das `workout_structure`-Schema
aus Migration `0013` (`{ version:1, steps:[{kind,duration_s,target_pct_ftp}|
{kind:"set",reps,work,recovery}] }`), `zwo-export.js::canExportZwo` (Struktur
muss exportierbar bleiben).

**Phase → Format-Mapping (Startbelegung, in E3 final):**

| Phase | Formate (`session_formats.id`) |
|---|---|
| Grundlage | `sweetspot-long` (S1–S2) bzw. neuer Grundlagen-Seed |
| Sweet Spot | `sweetspot-long` |
| Schwelle | `threshold-long`, `over-under` (Wechsel je Qualitätsslot) |
| VO2max | `vo2-long`, `vo2-short` |
| (Fokus `crit`) | zusätzlich `sprint-accessory` als Anhang an einen Qualitätstag |

**Skalierung:** `target_pct_ftp` aus der Format-Stufe; `watts = round(pct/100 ×
currentFtp)` nur wenn `currentFtp != null` → sowohl `workout.pct` als auch
`workout.watts` (Entscheidung 22).

**Verifikation:** `npm test -- --project core`; neue Tests: jede Phase liefert
ein exportierbares `workoutStructure` (`canExportZwo` true), Stufen steigen über
`weekIndexInPhase`, `watts` nur bei gesetzter FTP, `pct` immer. Migration (falls
vorhanden) in `dashboard-dev` + apps01 (Rückfrage Alex).

**Abhängigkeiten:** V5. Läuft **parallel zu E2** (E2 hat den Stub). **Commit:**
`feat: plan workout selection from session_formats`

---

### E4 — Historie-Aggregat-Hook

**Ziel:** `HistoryAggregate` (V3) aus den vorhandenen Datenquellen bauen.

**Dateien:**
- `app/src/api/hooks/usePlanHistoryAggregate.ts` (neu) + Test
- ggf. `app/src/core/plan-history.js` für die reine Aggregation (testbar ohne
  React), Hook ruft nur.

**Nutzt:** `useRides` / `usePlanCards` (bestehende Hooks), `pmc.js::currentPmc`
(→ `currentCtl`), `ftp-history.js` / `config.ts` eFTP (→ `currentEftp`),
`adherence.js::planAdherence` (→ `planAdherence`), `aggregate.js` für
`weeklyActualTss` (letzte ≤ 8 abgeschlossene ISO-Wochen), `config.ts`
`athletes[].bmr.age` (→ `ageYears`, sonst null). `powerCurveWeakness` bis E10
**hart `null`**.

**Verifikation:** `npm test -- --project app`; Test mit Fixture-Rides:
`weeklyActualTss` korrekt gefenstert (nur abgeschlossene Wochen), `emptyHistory()`
wenn keine Rides. `npm run build`.

**Abhängigkeiten:** V3. Parallel zu E2/E3. **Commit:**
`feat: training history aggregate for plan generator`

---

### E5 — Formular + Vorschau-UI (ohne Schreiben)

**Ziel:** „Neuer Plan"-Dialog + Vorschau. „Übernehmen" noch deaktiviert
(`TODO E6`).

**Dateien:**
- `app/src/features/planning/NewPlanDialog.tsx` (neu)
- `app/src/features/planning/new-plan-dialog-view-model.ts` (+ Test) — Formular
  → `PlanGeneratorInput`, Feld-Validierung, Modell-Vorschlag
- `app/src/features/planning/PlanPreview.tsx` (neu) — Wochenübersicht aus
  `GeneratedPlan`: Phase, Wochen-TSS, Qualitätstage, Erholungswochen,
  FTP-Ziel; `warnings` sichtbar
- `app/src/features/planning/PlanningPage.tsx` — Knopf oben + Leerzustand
- `app/src/config.ts` — **`readOnly: true` bei Athlet 2 entfernen**;
  `isReadOnlyAthlete()`-Aufrufer prüfen (`grep -rn isReadOnlyAthlete app/src`)
  und deren Verhalten für Athlet 2 bewusst nachziehen (Befinden-Spalte,
  Ziellinien etc. — dieser Fahrplan will nur den Schreibpfad „Plan bauen",
  nicht zwangsläufig alle anderen Schreibaktionen für Athlet 2 öffnen; falls
  das zu weit greift, stattdessen ein schmales `canCreatePlan()`-Gate wie
  `write-authorization.ts` und `readOnly` stehen lassen — Entscheidung in E5
  mit Alex).
- Knopf-Sichtbarkeit über `canWriteForAthlete()` (deckt Trainer ab,
  Entscheidung 19).

**Nutzt:** `generatePlan()` (E2), `selectWorkout()` bzw. Stub (E3),
`usePlanHistoryAggregate` (E4), `useEvents` (Event-Dropdown, Entscheidung 4).

**Verifikation:** `npm run build`; `npm test -- --project app`;
`npm run dev` + Dialog auf `/planning` für Athlet 2 durchklicken; **vor dem
Commit-Vorschlag zusätzlich gegen den lokalen Docker-Container**
(`docker compose -f docker-compose.dev.yml up -d`, `http://localhost:8080`).

**Abhängigkeiten:** E2 (E3/E4 dürfen Stub/leer sein). **Commit:**
`feat: new-plan dialog + preview (no write yet)`

---

### E6 — Schreibpfad

**Ziel:** „Übernehmen" schreibt `training_plans` + `plan_cards`. „Plan neu
erzeugen" ersetzt nur die Zukunft.

**Dateien:**
- `app/src/api/supabase/training-plans.ts` (neu): `createTrainingPlan(athleteId,
  plan: GeneratedPlan, input, createdBy)` → eine `training_plans`-Zeile +
  Bulk-Insert der `plan_cards` (mit `plan_id`, `week`, `phase`, `sort_order`).
  `deactivatePlan(id)`. Result-Konvention.
- `app/src/api/supabase/plan-cards.ts` — `createPlanCard` um `plan_id`, `week`,
  `phase` erweitern **oder** neue `createPlanCards(athleteId, cards[])`
  (ein `insert` mit Array; Feldnamen wie im vorhandenen Adapter).
- `app/src/api/hooks/useCreateTrainingPlan.ts` (neu) — bei „neu erzeugen":
  zukünftige (`date >= today`, nicht `ausgefallen`) Karten des alten Plans
  löschen/deaktivieren, alten Plan `is_active = false`, dann neu schreiben.
  Warndialog im UI vor Verlust manueller Zukunfts-Änderungen (Entscheidung 16).
- E5: „Übernehmen" scharf schalten.

**Verifikation:** `npm test -- --project app`; `npm run build`; echter
Durchlauf gegen `dashboard-dev` als Athlet 2 (Live-Credentials in `.env`):
Plan anlegen → Karten erscheinen im Planungstab → „neu erzeugen" ersetzt nur
Zukunft, Vergangenheit + `ausgefallen` bleiben. Docker-Container-Check.
RLS: Insert für fremde `athlete_id` scheitert.

**Abhängigkeiten:** E1 (Schema), E2 (`GeneratedPlan`), E5 (Dialog). **Commit:**
`feat: persist generated training plan to plan_cards`

---

### E7 — `plan-week-model.js` dynamisch

**Ziel:** Für Athleten mit aktivem Plan kommen Woche/Phase/Slots aus
`training_plans.week_model` statt aus der Code-Konstante `PLAN_WEEK_MODEL`.

**Dateien:**
- `app/src/core/plan-week-model.js` — `planWeekFor()` / `isDeliberateRestDay()`
  optional `weekModel: WeekModelEntry[] | null` als Parameter (V6). `null` →
  bisheriges Verhalten (Code-Konstante). **Signatur/Rückgabe unverändert**.
- `scripts/lib/core/plan-week-model.js` — byte-identische Kopie mitziehen.
- `app/src/core/plan-week-model.test.js` — Fälle mit übergebenem `week_model`.
- Aufrufer prüfen (`grep -rn "planWeekFor\|isDeliberateRestDay" app/src scripts`):
  `conflicts.js`, `plan-drag.js`, `plan-shift.js`,
  `features/planning/week-grid-view-model.ts` — die reichen das `week_model` des
  aktiven Plans durch (aus `usePlanCards`-Nachbarhook / neuem
  `useActiveTrainingPlan`), sonst `null`.
- `app/src/api/hooks/useActiveTrainingPlan.ts` (neu) — lädt die aktive
  `training_plans`-Zeile.

**Verifikation:** `npm test` (Root **und** `--project core`/`app`) — die
Parallelkopie-Gleichheit wird im bestehenden Test erzwungen; `node -c` auf
beide Kopien. Regressions-Klick Planungstab (Ruhetage/Phasen-Badges) für
Athlet 1 (unverändert, `week_model` null) **und** Athlet 2 (aus Plan).

**Abhängigkeiten:** E1. **Commit:** `feat: derive plan-week-model from active training plan`

---

### E8 — Sync-Umschaltung

**Ziel:** `scripts/generate-data.js` überspringt die Code-Vorlage für Athleten
mit aktivem `training_plans`-Eintrag.

**Dateien:**
- `scripts/lib/training-plan-fetch.js` (neu) — liest per Service-Role die aktive
  `training_plans`-Zeile je Athlet (Muster `sync-config-fetch.js`; Migration
  `0024`-Grants ggf. um `training_plans SELECT` für Service-Role erweitern →
  kleine Zusatz-Migration).
- `scripts/generate-data.js` — für Athlet 2 (`PLANNED_SESSIONS_ATHLETE2`) und
  Athlet 4 (`shiftPlannedSessions4`): hat der Athlet einen aktiven Plan, wird
  die Vorlage **nicht** gespreadet; `plan_cards` (schon geladen) ist dann die
  alleinige Planquelle. `week`/`phase` der `rides` kommen dann aus dem
  `week_model` (analog `plan-week-model`-Nutzung sync-seitig).
- `docs/fahrplan-8-plan-generator.md` — diesen Abschnitt auf „umgesetzt" setzen.

**Verifikation:** `npm test` (Root); `npm run sync` lokal mit `.env` gegen
`dashboard-dev`, bei dem Athlet 2 einen Testplan hat → `rides-2.json` /
Plan-Baseline stammen aus `plan_cards`, nicht aus `plan-athlete2.js`; ohne
aktiven Plan unverändert. `node -c` auf geänderte Dateien.

**Abhängigkeiten:** E1, E7 (Wochenmodell-Ableitung). **Commit:**
`chore: sync skips code plan template when an active training plan exists`

---

### Zusatzstufen (E9–E13) — untereinander unabhängig, alle nach E1–E8

---

### E9 — Modelle `polarized` + `block`

**Ziel:** die beiden fehlenden Modelle im Generator.

**Dateien:** `app/src/core/plan-generator.js` (+ `-blocks.js`) erweitern, neue
Testfälle. Blockfolge-Tabelle oben.

**Verifikation:** `npm test -- --project core` — `polarized`: TID der lockeren
Tage strikt Z2, Qualitätstage nur Schwelle/VO2max, ~80/20-Verhältnis über den
Plan. `block`: konzentrierte 2–3-Wochen-Blöcke, Erholung dazwischen, ein System
je Block. Deterministisch.

**Abhängigkeiten:** E2. **Commit:** `feat: polarized + block periodization models`

---

### E10 — Power-Curve-Schwächen-Analyse

**Ziel:** `powerCurveWeakness` in `HistoryAggregate` echt füllen; Generator
betont den entsprechenden Block.

**Dateien:**
- `app/src/core/plan-history.js` (E4) — Schwäche aus `powercurve.js`
  (`buildCurveData`/`extractPowerCurve`) ableiten: relatives Defizit je
  Standard-Dauer (1 s/5 s → sprint, 3–5 min → vo2, 8–20 min → threshold,
  ≥ 30 min / EF → aerob) gegen ein Referenzprofil zur FTP.
- `app/src/core/plan-generator.js` — bei `focus: "allgemein"` verschiebt die
  Schwäche die Wochenverteilung leicht zugunsten des schwächsten Systems
  (Deckel: ± 1 Block-Woche, nie auf Kosten der Grundlage).
- Tests beidseitig.

**Verifikation:** `npm test`; Fixture-Power-Curves mit klarer Schwäche →
erwartete Kategorie; Generator-Output verschiebt genau eine Woche.

**Abhängigkeiten:** E2, E4. **Commit:** `feat: power-curve weakness biases plan focus`

---

### E11 — Admin-Editor für `session_formats`

**Ziel:** Formate im UI anlegen/bearbeiten (Admin), statt nur per Migration.

**Dateien:**
- `app/src/features/settings/FormatCatalogSection.tsx` (neu) — nur sichtbar bei
  `profile.isAdmin`. Liste + Formular (`id`, `label`, `target_system`,
  `currency`, `evidence_grade`, `block_targets`, `axes` als `explicitSteps`).
- `app/src/api/supabase/session-formats.ts` — `create/update/deleteSessionFormat`
  (RLS erlaubt Admin-Insert bereits, Migration `0014`).
- `app/src/features/settings/format-catalog-view-model.ts` (+ Test) —
  `axes`-Validierung (gültiges `explicitSteps`-Schema), bevor geschrieben wird.

**Verifikation:** `npm test -- --project app`; `npm run build`; als Admin gegen
`dashboard-dev` ein Format anlegen → taucht in `FormatsSection` (Familienauswahl)
auf; als Nicht-Admin ist die Sektion unsichtbar und der Write scheitert an RLS.
Docker-Container-Check.

**Abhängigkeiten:** keine (nur bestehende `session_formats`-Tabelle).
**Commit:** `feat: admin session-format catalog editor`

---

### E12 — FTP-Test-Einplanung + Post-Test-Umrechnung

**Ziel:** Testtage sind schon in E2 gesetzt (Entscheidung 23) — hier der
**Nachlauf**: nach einem erledigten Testtag Dialog „FTP jetzt X — zukünftige
Karten umrechnen?".

**Dateien:**
- `app/src/core/plan-ftp-rescale.js` (neu) + Test — nimmt Karten + alte + neue
  FTP, gibt Patches (`watts` neu aus `pct`, `pct`/Struktur unverändert) nur für
  `date >= today`.
- `app/src/features/planning/FtpRescaleDialog.tsx` (neu) — ausgelöst, wenn eine
  `isTest`-Karte als erledigt erkannt wird und ein neuer eFTP/FTP-Wert vorliegt.
- `app/src/api/hooks/` — Bulk-Patch der betroffenen Karten (Result-Konvention).
- Falls E2 die Testtag-Regeln noch nicht enthält (E2 vor Beschluss gemergt):
  hier in `plan-generator.js` nachziehen.

**Verifikation:** `npm test`; Test: Rescale trifft nur Zukunft, `pct` bleibt,
`watts = round(pct/100 × neueFtp)`; Dialog erscheint nur bei `isTest` + neuem
Wert. Docker-Container-Check.

**Abhängigkeiten:** E2 (Testtage), E6 (Karten in der DB). **Commit:**
`feat: rescale future plan watts after an FTP test`

---

### E13 — „Rest neu berechnen"

**Ziel:** Restwochen des aktiven Plans mit aktueller Form/Erfüllung neu bauen,
gleiche Rahmenbedingungen, Vergangenheit unberührt.

**Dateien:**
- `app/src/core/plan-generator.js` — Option `regenerateFrom?: string` (ISO):
  nur Wochen `>= regenerateFrom` neu erzeugen, Phasen-/Blockstruktur der
  ursprünglichen `week_model` beibehalten, nur TSS/Workouts an die frische
  `HistoryAggregate` anpassen.
- `app/src/features/planning/` — Knopf „Rest neu berechnen" + Vorschau (nur die
  betroffenen Wochen) + Warnung wie bei „neu erzeugen".
- `useCreateTrainingPlan` (E6) wiederverwenden (ersetzt nur Zukunfts-Karten,
  `training_plans`-Zeile bleibt dieselbe, `params`/`week_model` aktualisiert).

**Verifikation:** `npm test`; Test: Wochen vor `regenerateFrom` byte-gleich,
danach an neue Historie angepasst; `training_plans.id` unverändert.
Docker-Container-Check.

**Abhängigkeiten:** E2, E4, E6. **Commit:** `feat: recompute remaining plan weeks`

---

## Abhängigkeitsgraph

```
E1 ─┬─ E6 ─┬─ E12
    │      └─ E13
    ├─ E7 ── E8
    └─ (E2 braucht E1 nicht — nur die Verträge; DB erst ab E6)

E2 ─┬─ E5 ─ E6
    ├─ E9
    ├─ E10
    └─ E13

E3 ── (ersetzt E2-Stub; parallel zu E2 baubar)
E4 ─┬─ E5
    ├─ E10
    └─ E13
E11 ── unabhängig
```

**Empfohlene Reihenfolge:** E1 → (E2 ∥ E3 ∥ E4) → E5 → E6 → E7 → E8 →
danach E9/E10/E11/E12/E13 in beliebiger Reihenfolge, je ein Fenster.

**„Kern fertig" =** E1–E8 gemergt: Athlet 2 baut sich im Planungstab einen
pyramidalen/linearen Plan, prüft die Vorschau, übernimmt ihn; Ruhetage/Phasen
stimmen; der Sync respektiert ihn.

---

## Risiken / offene Punkte

- **`readOnly`-Entfernung bei Athlet 2 (E5)** kann mehr öffnen als gewollt
  (Befinden, Ziellinien, Wahoo-Push). Fallback: schmales `canCreatePlan()`-Gate
  statt Flag entfernen. Mit Alex in E5 entscheiden.
- **Sportwissenschaftliche Kalibrierung** der Zahlen (Level-Default-TSS,
  Blockanteile, Rampenziel) ist ein erster begründeter Aufschlag, keine
  validierte Wahrheit — wie `CONFLICT_THRESHOLDS` (K1) nach echter Nutzung
  gegen die Ist-Daten reviewen.
- **`session_formats`-Deckung:** deckt evtl. „Grundlage" und einen
  Einsteiger-Tempoblock (83–90 %) nicht ab → neuer Seed in E3. Vor E3 die
  6 Bestandsformate gegen die Phasen-Mapping-Tabelle prüfen.
- **Migrationsnummern** (`0028…`) beim Umsetzen gegen `supabase/migrations/`
  gegenprüfen — dieser Fahrplan nennt sie nur beispielhaft.
- **`week`-Label-Format:** Athlet 1 nutzt `"YYYY-KWnn"`, Athlet 2/4 heute
  `"KWnn"`. Der Generator nutzt durchgängig `"YYYY-KWnn"` (`aggregate.js::
  isoWeekKey`) — beim dynamischen `plan-week-model` (E7) auf konsistente
  Anzeige achten (s. `docs/offene-punkte.md`).
- **`data/*.json` / `.agents/` etc.** nie mitcommitten (AGENTS.md).
