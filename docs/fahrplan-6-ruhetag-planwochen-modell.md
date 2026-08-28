# Fahrplan 6: Ruhetage als abgeleitetes Plan-Wochen-Modell

**Stand:** 2026-08-29
**Zielablage:** `docs/fahrplan-6-ruhetag-planwochen-modell.md`
**Herkunft:** Alex bemerkte im Planungstab drei Reibungspunkte rund um
Ruhetag-Karten (Doppelkarte beim Verschieben, manuelles Ausfallen,
Fehlkennzeichnung beim Fahren). In Plan Mode gegen den Code-Stand geprüft und
mit Alex abgestimmt (2026-08-29). Eigenständige Initiative, unabhängig von den
Fahrplänen aus `fahrplan-0-uebersicht.md` — braucht keinen davon als
Vorbedingung und blockiert keinen.

---

## Ziel

Ein Ruhetag ist **kein gespeicherter `plan_cards`-Eintrag mehr**, sondern
abgeleitet:

> „Tag in einer aktiven Planwoche, der laut Wochen-Vorlage kein
> Trainings-Slot ist und keine aktive Karte trägt."

Grundlage ist ein **Plan-Wochen-Modell** — die Erweiterung des bereits
existierenden `app/src/core/plan2-schedule.js` (Datum → Woche/Phase,
card-unabhängig) um die Trainings-/Ruhe-Slot-Struktur pro Wochentag, für alle
Athleten.

---

## Warum

### Die drei Reibungspunkte

Ruhetage sind heute echte `plan_cards`-Zeilen (`workout_type = "Ruhetag"`),
erzeugt von `fillRestDays()` (`app/src/core/plan-rest-days.js` +
`scripts/lib/core/plan-rest-days.js`, aufgerufen in `scripts/lib/plan2.js`
~Zeile 773) und dem Einmal-Skript `scripts/add-rest-day-cards.js`. Athlet 2/4
tippen sie direkt in `scripts/lib/plan-athlete2.js` / `plan-athlete4.js`.

1. **Doppelkarte beim Verschieben.** Training auf einen Ruhetag ziehen → zwei
   Karten am selben Tag. `week-grid-view-model.ts::buildWeekGrid()` nimmt als
   `card` die „erste nicht-abgesagte" und hängt die andere als `otherCards` an
   — beide werden gezeigt.
2. **Manuelles Ausfallen.** Nach dem Verschieben muss die Ruhetag-Karte von
   Hand auf `status = "ausgefallen"` gesetzt werden, sonst zählt der Tag
   doppelt.
3. **Fehlkennzeichnung beim Fahren.** Eine Fahrt an einem Ruhetag löst
   `core/plan-feedback.js::restDayRiddenSignal()` aus („Ruhetag gefahren —
   bewusst freier Tag wurde trotzdem trainiert") — auch wenn nur Training
   verschoben wurde.

### Warum kein einfaches Löschen der Karten

Am 05.08.2026 (D6, `docs/konzept-progressionssteuerung.md`) wurde **bewusst**
unterschieden zwischen:

| Fall | `classOf()` in `conflicts.js` | Bedeutung |
|---|---|---|
| Ruhetag-Karte **oder** nur ausgefallene Karte(n) | `"ruhe"` | bewusst frei — **keine** Planungslücke |
| gar keine Karte | `"leer"` | echte Planungslücke — löst Hinweise aus |

Daran hängen:
- `core/conflicts.js` — **K-LEER** („harte Einheit direkt nach ≥ 3 echten
  Planungslücken") und **K-HARTFOLGE** („zwei harte Tage ohne Ruhetag-/
  Recovery-Karte dazwischen").
- `core/session-types.ts` — `INTENSITY_CLASS.Ruhetag = 0`,
  `SESSION_SEPARATION_CLASS` (`Ruhetag → "ruhe"`), D6.2-Regel „eine wirklich
  fehlende Karte ist eine Planungslücke, eine `Ruhetag`-Karte nicht".
- `core/loadguard.js` — 7-Slot-Wochenauffüllung (Ruhetage = 0; voraussichtlich
  unkritisch, in RUH0 zu bestätigen).

Würde man die Ruhetag-Karten ersatzlos löschen, würden normale Wochen (Mi/So
frei) als Planungslücke gewertet → Fehlwarnungen.

### Nebeneffekt

Das Plan-Wochen-Modell liefert eine card-unabhängige Woche/Phase-Quelle und
löst damit den offenen Punkt aus `docs/offene-punkte.md`:

> „Karte behält altes `week`/`phase`-Label, wenn die Zielwoche komplett leer
> ist (`app/src/core/plan-drag.js::weekLabelForDate()`) … Nur lösbar mit einer
> echten Kalenderwoche→Plan-Phase-Zuordnung unabhängig von `plan_cards`."

---

## Bereits vorhanden (Baustein, kein Neubau)

`app/src/core/plan2-schedule.js` ist schon eine card-unabhängige
Datum→Woche/Phase-Tabelle für Athlet 1 (`PLAN2_SCHEDULE`, `getPlan2WeekPhase`).
Es fehlt: die Trainings-/Ruhe-Slot-Struktur pro Wochentag, und Abdeckung für
Athlet 2 und 4. Dieses Modul (bzw. ein Nachbarmodul, das es einbezieht) ist der
Ort für das Modell.

---

## Fenster-Übersicht

```
RUH0  Inventar & Abnahmekriterien (read-only)            ◆ bestimmt den Umbau-Umfang
RUH1  Plan-Wochen-Modell in core definieren (+ Tests)    ◆ Datei- vs. Konstanten-Form
RUH2  Ruhetag-Erzeugung abschalten (scripts + core)
RUH3  Konflikt-/Belastungslogik auf das Modell umstellen ◆ Plan Mode beim Bau
RUH4  Frontend: Ruhetag im Raster/Hero/Briefing ableiten
RUH5  Drag & Drop / Verschieben auf das Modell
RUH6  Alt-Daten migrieren (Supabase dev → prod)          ◆ Rückfrage vor prod
RUH7  Abschluss: offene-punkte.md / AGENTS.md / Konzept-Doku nachziehen
```

Jedes Fenster endet mit: `node -c` der betroffenen `.js`-Dateien → `npm test`
(Root und/oder `/app/`) → bei UI-Änderung zusätzlich Docker-Container-Check
(`docker compose -f docker-compose.dev.yml up -d`, `http://localhost:8080`) →
`/code-review` auf den Diff → **ein Commit pro Fenster** (Präfix nach
`AGENTS.md`-Konvention: `refactor:`/`feat:`/`chore:`/`docs:`).

**Wichtig für jedes Fenster:** `app/src/core/` **und** `scripts/lib/core/`
sind parallele Kopien — beide gemeinsam pflegen.

---

## RUH0 — Inventar & Abnahmekriterien

**Ziel:** Jede `Ruhetag`- / `isRestDay`- / `"ruhe"`-vs-`"leer"`-Fundstelle
klassifizieren. **Read-only, kein Code.**

### Kategorien

**(a) Reine Label-Map** (Farbe / Icon / Text) — bleibt unverändert:
- `app/src/features/planning/planning-view-model.ts` — `PLAN_TYPE_COLOR`,
  `PLAN_TYPE_ICON`, `typeColor()`, `typeIcon()`
- `app/src/core/format.js` — `rideLabel()` „Ruhetag trotz echter Distanz"-Fall
- `app/src/core/plan-config.js` — `restBlockDays` (Schwellwert, kein Ruhetag-Bezug)

**(b) Logik, die „bewusst frei" braucht** — auf das Modell umstellen:
- `app/src/core/conflicts.js` — `classOf()`, `isRestEquivalent()`, K-LEER,
  K-HARTFOLGE
- `app/src/sports/cycling/session-types.ts` — `INTENSITY_CLASS.Ruhetag`,
  `SESSION_SEPARATION_CLASS`, D6.2-Regel
- `app/src/core/loadguard.js` — 7-Slot-Auffüllung (bestätigen, ob überhaupt
  betroffen)
- `app/src/core/plan-feedback.js` — `restDayRiddenSignal()`
- `app/src/core/briefing.js` + `scripts/lib/core/briefing.js` —
  `nextSession.typ === "Ruhetag"`-Zweig
- `app/src/core/scenario.js` — fügt „N zusätzliche Ruhetage" als Szenario ein
  (arbeitet mit Karten-IDs — prüfen, ob abgeleitete Ruhetage das brechen)
- `app/src/features/hero/hero-view-model.ts` — Ruhetag-Zweig in `buildSession()`
- `app/src/features/planning/week-grid-view-model.ts` — `statusForDate()`
- `app/src/features/planning/planning-view-model.ts` — `isRestDay()`,
  `buildPlanningSections()`
- `app/src/features/planning/WeekGridDetailRow.tsx` — `riddenRestDayInfo`
- `app/src/core/weekreview.js`, `app/src/features/hero/WeekReviewCard.tsx` —
  Ruhetag-Erwähnung prüfen

**(c) Ruhetag-Karten-Erzeugung** — entfällt:
- `app/src/core/plan-rest-days.js` + `.test.js`
- `scripts/lib/core/plan-rest-days.js` (+ zugehöriger Test)
- `scripts/add-rest-day-cards.js`
- `Ruhetag`-Einträge in `scripts/lib/plan2.js` (`PLANNED_SESSIONS`,
  `fillRestDays()`-Spread), `scripts/lib/plan-athlete2.js` (~20 Stück),
  `scripts/lib/plan-athlete4.js` (`REST`-Konstante)
- `scripts/lib/plan-to-cards.js` — Guard ergänzen

### Zusätzlich klären und im Inventar festhalten

- Fließen `plan_cards`-Ruhetag-Zeilen über den `effectivePlan`- /
  `plannedSessions`-Rückweg (`scripts/lib/plan-cards-fetch.js`,
  `scripts/generate-data.js`) in `rides.json` ein? Wenn ja: welche Felder,
  welche Wirkung im Frontend.
- Wird `scripts/lib/plan2.js::PLANNED_SESSIONS` außer von
  `scripts/migrate-plan-to-supabase.js` noch gelesen? (Ride-Tagging via
  `getPlan2WeekPhase`, `plannedSessions`-Feld in `rides.json`.)
- `tests/`-Dateien mit Ruhetag-Bezug: `compliance-derive-fallback.test.js`,
  `map-activity.test.js`, `plan-athlete4.test.js`, `plan-to-cards-migration.test.js`.
- Sonderfall Athlet 2: `"Ruhetag — Ausrüstung checken"`
  (`scripts/lib/plan-athlete2.js`, Renntag-Vorbereitung) ist eine echte
  Aufgabe, kein reiner Ruhetag.

### Abnahme

- [ ] Tabelle: Datei · Fundstelle · Kategorie (a/b/c) · geplante Behandlung
- [ ] Die drei „Zusätzlich klären"-Fragen beantwortet und belegt
- [ ] Keine Datei verändert

### ◆ Entscheidungspunkt

1. Bestätigen: `plan2-schedule.js` (bzw. ein Nachbarmodul) ist der Ort für das
   Modell.
2. `"Ruhetag — Ausrüstung checken"` → eigene Event-/Notiz-Karte, oder Kommentar
   in der Wochen-Vorlage, oder normale Nicht-Ruhetag-Karte?

---

## RUH1 — Plan-Wochen-Modell in core definieren

**Ziel:** Card-unabhängige Quelle für „Woche X = Phase Y, diese Wochentage
sind Trainings-Slots". Reine Datenstruktur + Funktionen + Tests — **noch nichts
angeschlossen.**

### Umfang

- Erweiterung von `app/src/core/plan2-schedule.js` **oder** neues Modul
  `app/src/core/plan-week-model.js`, das `plan2-schedule.js` einbezieht.
  Parallel die `scripts/lib/core/`-Kopie.
- Vorlage-Eintrag pro Athlet + ISO-Woche:
  ```
  { week: "2026-KW36", phase: "VO2max",
    start: "2026-08-31", end: "2026-09-06",
    trainingWeekdays: [1, 2, 4, 6] }   // ISO 1=Mo … 7=So; Rest = Ruhe-Slot
  ```
- Funktionen:
  - `planWeekFor(athleteId, dateISO)` →
    `{ week, phase, isTrainingSlot, isRestSlot }`
    (kein Treffer → `{ week: null, phase: null, isTrainingSlot: false,
    isRestSlot: false }`, analog `getPlan2WeekPhase` heute)
  - `isDeliberateRestDay(athleteId, dateISO, hasActiveCard)` →
    `isRestSlot && !hasActiveCard`
- Herkunft der Vorlagen: aus den bestehenden Plan-Definitionen ableiten —
  Wochentage mit `typ !== "Ruhetag"` in `PLANNED_SESSIONS` /
  `PLANNED_SESSIONS_ATHLETE2` / der `plan-athlete4.js`-Vorlage sind die
  `trainingWeekdays`. Einmalig ableiten (Skript oder von Hand), dann als
  feste Struktur ablegen.
- Tests `plan-week-model.test.js`: Slot-Erkennung, Wochengrenzen (Mo/So),
  Phasenzuordnung, Datum außerhalb aller Bereiche, Athlet ohne Modell.

### Abnahme

- [ ] `cd app && npm test -- --project core` grün
- [ ] Athlet 1, ein bekannter Mi/So → `isRestSlot === true`; Do/Sa →
      `isTrainingSlot === true`
- [ ] Athlet ohne Modell (z. B. unbekannte ID) → alles `null`/`false`, kein Wurf

### ◆ Entscheidungspunkt

**Vorlagen als `data/plan-weeks-N.json` (Pipeline, generiert)** vs. **statische
Konstante im core-Modul.**

Empfehlung: **statische Konstante.** Die Plan-Vorlagen stehen ohnehin fest im
Code (`plan2-schedule.js` ist bereits so), kein 6h-Sync ändert sie, und eine
JSON-Datei mehr in der Pipeline bringt neue Fehlerquellen (fehlende Datei →
stiller Fallback) ohne Gegenwert.

---

## RUH2 — Ruhetag-Erzeugung abschalten

- `scripts/lib/plan2.js` — `Mi`/`So`-`Ruhetag`-Einträge aus `PLANNED_SESSIONS`
  entfernen; `...fillRestDays(...)`-Spread (~Zeile 773) entfernen.
- `scripts/lib/plan-athlete2.js` — ~20 `Ruhetag`-Einträge entfernen;
  `"Ruhetag — Ausrüstung checken"` nach RUH0-Entscheid behandeln.
- `scripts/lib/plan-athlete4.js` — `REST`-Konstante und ihre Verwendung in der
  12-Wochen-Vorlage entfernen.
- Löschen: `app/src/core/plan-rest-days.js` + `plan-rest-days.test.js`,
  `scripts/lib/core/plan-rest-days.js` (+ Test), `scripts/add-rest-day-cards.js`.
- `scripts/lib/plan-to-cards.js` — defensiver Guard: keine Zeile mit
  `workout_type === "Ruhetag"` erzeugen.
- `tests/plan-to-cards-migration.test.js` und die weiteren in RUH0 gefundenen
  Tests anpassen.

### Abnahme

- [ ] `npm test` (Root) grün
- [ ] `npm run sync` lokal (falls `.env` vorhanden) erzeugt keine
      `Ruhetag`-Zeilen mehr
- [ ] `plannedSessions` in `data/rides-*.json` unverändert außer den
      entfernten Ruhetagen (Diff prüfen — `data/*.json` **nicht** committen)

---

## RUH3 — Konflikt-/Belastungslogik auf das Modell umstellen

**Plan Mode beim Bau** (mehrere `core/`-Funktionen, berührt die Schichtenregel).

- `app/src/core/conflicts.js` — `classOf(date)`:
  - `"ruhe"` wenn `isDeliberateRestDay(athleteId, date, hasActiveCard)`
    **oder** nur ausgefallene Karte(n)
  - `"leer"` nur wenn Trainings-Slot ohne aktive Karte (echte Lücke)
  - `isRestEquivalent()` entsprechend erweitern
  - K-LEER / K-HARTFOLGE-Verhalten bleibt **identisch zu heute** für alle
    bestehenden Fälle
  - Klären: woher kommt `athleteId` in `detectConflicts()`? Ggf. als Parameter
    durchreichen.
- `app/src/sports/cycling/session-types.ts` — die D6.2-Regel „fehlende Karte =
  Lücke" bezieht ihre Info aus dem Modell (Trainings-Slot ohne Karte) statt aus
  dem Vorhandensein einer Ruhetag-Karte. `INTENSITY_CLASS.Ruhetag`-Key darf als
  toter Eintrag bleiben oder wird entfernt.
- `app/src/core/loadguard.js` — 7-Slot-Auffüllung bleibt (Ruhetag = 0 Last,
  egal ob Karte oder abgeleitet). Nur bestätigen.
- `app/src/core/scenario.js` — „N zusätzliche Ruhetage"-Szenario auf abgeleitete
  Ruhetage anpassen (keine Karten-ID mit 0 TSS mehr hinterlassen).
- Beide `scripts/lib/core/`-Kopien mitziehen.

### Abnahme

- [ ] `cd app && npm test -- --project core` grün
- [ ] Neuer Testfall: harte Einheit nach 3 **Ruhe-Slot**-Tagen ohne Karte →
      K-LEER löst **nicht** aus
- [ ] Neuer Testfall: harte Einheit nach 3 **Trainings-Slot**-Tagen ohne Karte
      → K-LEER löst aus
- [ ] Bestehende `conflicts.test.js`-Erwartungen unverändert (nur Eingabe-Setup
      angepasst)

---

## RUH4 — Frontend: Ruhetag ableiten

- `app/src/features/planning/week-grid-view-model.ts` — `statusForDate()`:
  Tag ohne aktive Karte + `isRestSlot` → neuer `DayStatus` `"rest"` (als
  Ruhetag rendern). Trainings-Slot ohne Karte → weiterhin `"empty"`.
  `GridWeekRow.phase` aus dem Modell statt aus Nachbarkarten → löst den
  `offene-punkte.md`-Blocker.
- `app/src/features/planning/planning-view-model.ts` — `isRestDay(card)`
  entfällt bzw. wird zu `isRestSlot(date)`. `buildPlanningSections()`:
  Ruhetage sind keine Karten mehr → fallen automatisch aus `done` / `missed` /
  `countable`. Kommentare (`isRestDay`-Verweise) nachziehen.
- `app/src/features/planning/WeekGridDetailRow.tsx` — Ruhetag-Detailzelle aus
  dem Modell. `restDayRiddenSignal` → entweder abgeleitet (Fahrt an
  Ruhe-Slot-Tag ohne Karte → Info) oder ersatzlos (RUH0-Entscheid).
- `app/src/features/hero/hero-view-model.ts` — `next.typ === "Ruhetag"`-Zweig
  in `buildSession()` entfällt; `findNextSession()` landet automatisch auf der
  nächsten echten Karte. Optional „nächster Tag laut Plan frei" als Detailtext
  aus dem Modell.
- `app/src/core/briefing.js` + `scripts/lib/core/briefing.js` —
  `nextSession.typ === "Ruhetag"`-Zweig → „nächste Einheit in N Tagen,
  dazwischen laut Plan frei" aus dem Modell.
- Tests: `week-grid-view-model.test.ts`, `planning-view-model.test.ts`,
  `WeekGridDetailRow.test.tsx`, `hero-view-model.test.ts`,
  `export-briefing.test.js`, `plan-feedback.test.js`.

### Abnahme

- [ ] `cd app && npm test` grün
- [ ] Docker-Container-Check (`http://localhost:8080`): Planungstab zeigt Mi/So
      als Ruhetag (abgeleitet, mit Phase), Fortschrittsquote unverändert
- [ ] Hero „nächste Einheit" zeigt die nächste echte Karte, nicht „Ruhetag"

---

## RUH5 — Drag & Drop / Verschieben

- `app/src/core/plan-drag.js::weekLabelForDate()` — Woche/Phase beim
  Verschieben in eine leere Zielwoche aus dem Modell → `offene-punkte.md`-
  Drag&Drop-Punkt erledigt.
- Kein Auto-Löschen / Auto-Ausfallen von Ruhetag-Karten nötig — es gibt keine
  mehr. Training auf einen Ruhe-Slot-Tag ziehen = eine Karte an dem Datum; das
  Raster zeigt Training statt abgeleitetem Ruhetag. Kein Doppel, kein manuelles
  Ausfallen.
- `app/src/api/plan-cards/patch.ts::nextSortOrder()` / Kollisionslogik
  unverändert nutzbar — bestätigen.
- Tests: `plan-drag.test.js` (falls vorhanden), `conflicts.test.js`-Szenarien
  mit verschobener Karte.

### Abnahme

- [ ] Docker-Container-Check: Training per Drag auf einen (abgeleiteten)
      Ruhetag → genau **eine** Karte am Zieltag
- [ ] Kein „verpasst"-Marker am ursprünglichen Ruhetag
- [ ] Konfliktbanner unverändert
- [ ] Karte aus leerer Zielwoche zeigt korrektes Woche/Phase-Label

---

## RUH6 — Alt-Daten migrieren (Supabase)

- Neues Einmal-Skript `scripts/delete-rest-day-cards.js` (Muster wie
  `scripts/add-rest-day-cards.js`): Dry-Run-Default, `--apply`, `--env=prod`.
  Löscht `plan_cards`-Zeilen mit `workout_type = 'Ruhetag'` für alle Athleten.
- Reihenfolge: erst `dashboard-dev`, prüfen, dann `dashboard-prod`.
- **Keine** SQL-Schema-Migration in `supabase/migrations/` — es werden nur
  Zeilen entfernt, keine Spalten. Im Skript-Kopfkommentar begründen.

### ◆ Rückfrage vor `--env=prod`

CLAUDE.md: echter Prod-Write / Löschen von Datenbeständen nie automatisch —
Alex bestätigt den `--apply --env=prod`-Lauf einzeln.

### Abnahme

- [ ] `dashboard-dev`-Planungstab zeigt Ruhetage weiter (jetzt abgeleitet),
      keine Doppelkarten, Konfliktwächter unverändert
- [ ] Zeilenzahl `plan_cards` vorher/nachher dokumentiert (dev und prod)
- [ ] Kurzer Playwright-MCP-Durchlauf gegen `dashboard-dev` (siehe unten)

---

## RUH7 — Abschluss & Doku

- `docs/offene-punkte.md` — Drag&Drop-v1-Punkt „Karte behält altes
  `week`/`phase`-Label" streichen (durch RUH1/RUH5 gelöst).
- `AGENTS.md`, Abschnitt „Bekannte Eigenheiten" — Ruhetag-Absätze
  aktualisieren: Ruhetage sind abgeleitet, keine Karten mehr; „Ruhetage werden
  seit dem 05.08.2026 … angezeigt" → neuer Stand mit Verweis auf diesen
  Fahrplan.
- `docs/konzept-progressionssteuerung.md` — D6 / B8 („Ruhetage als Karten")
  als überholt markieren, Verweis auf `fahrplan-6-ruhetag-planwochen-modell.md`.
- `CLAUDE.md` — falls ein Verweis auf `plan-rest-days.js` existiert, entfernen.

### Abnahme

- [ ] `npm test` (Root) und `cd app && npm test` grün
- [ ] `npx fallow health --score` nicht schlechter als vor Fahrplan 6
- [ ] Doku-Querverweise stimmig, keine toten Verweise auf gelöschte Dateien

---

## Verifikation gesamt

- **Pro Fenster:** `node -c` der geänderten `.js`-Dateien → `npm test`
  (betroffener Teil) → bei UI-Änderung Docker-Container-Check → `/code-review`
  auf den Diff.
- **Einmal am Ende (nach RUH6):** Playwright MCP gegen `dashboard-dev` —
  - Planungstab: Ruhetage sichtbar, mit Phase
  - Training per Drag auf einen Ruhetag → genau eine Karte, kein Doppel
  - Konfliktbanner bei „harte Einheit nach Ruhetagen"-Szenario unverändert
  - Hero „nächste Einheit" korrekt (überspringt Ruhetage)
  - `browser_snapshot` statt `browser_screenshot`, **eine** Session, danach
    schließen (CLAUDE.md Playwright-Konvention)
- **Manuell bei Alex:** finale Bestätigung im echten Browser vor `git sync`.

## Abhängigkeiten

- Unabhängig von der `fahrplan-0-uebersicht.md`-Kette; blockiert keinen
  anderen Fahrplan.
- Berührt `app/src/core/` **und** `scripts/lib/core/` parallel — beide Kopien
  in jedem Fenster gemeinsam pflegen.
- Node ≥ 24 für den Root-Testlauf.

## Reihenfolge / Modell je Fenster

| Fenster | Modell | Bemerkung |
|---|---|---|
| RUH0 | `[F5]` | read-only, Entscheidungspunkte |
| RUH1 | `[F5]` | reine core-Struktur, keine Anbindung |
| RUH2 | `[F5]` | Erzeugung abschalten, Diffs prüfen |
| RUH3 | `[F5]` | **Plan Mode** — mehrere core-Funktionen |
| RUH4 | `[F5]` | Frontend, Docker-Check |
| RUH5 | `[F5]` | Drag&Drop, Docker-Check |
| RUH6 | `[F5]` | Migration, ◆ Rückfrage vor prod |
| RUH7 | `[F5]` | Doku |
