# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte, die sonst nur
> im Chat-Verlauf existieren würden. Nichts hier ersetzt die Detail-Konzepte
> (`docs/phase-*-konzept-*.md`) — nur Verweis + kurzer Kontext, damit nichts
> verloren geht. Reihenfolge = Priorität, nicht Chronologie. Beim Abschließen
> eines Punkts: hier ausstreichen/entfernen und im jeweiligen Konzeptdokument
> als erledigt markieren, nicht nur hier löschen.

## Roadmap-Versionierung (behoben, hohe Priorität war es wert)

`docs/dashboard-2.0-fahrplan-aktuell.md` — der Phasen-Fahrplan mit den
`[OP]`/`[SO]`/`[F5]`/`[HA]`-Modell-Markierungen — lag bislang nur lokal in
`Downloads/`, nicht im Repo. Damit war der Gesamtüberblick über Dashboard 2.0
selbst nirgends versioniert — dasselbe Risiko wie bei den Punkten unten, nur
auf den Fahrplan selbst bezogen. **Jetzt behoben:** Datei liegt in `docs/`,
Phase-0/1-Haken und der Phase-2-Fortschritt (Morgen-Check-in, RPE/Feel) gegen
den tatsächlichen Code-/Doku-Stand nachgezogen.

## Phase 2 — Befinden & Events

**wellbeing_public/wellbeing_shared — kein Frontend-Konsument**
DB-seitig fertig (Migration `0003_wellbeing.sql`, RLS erlaubt `anon`-Lesezugriff
auf `date/energy/muscle_feel/mood` wenn Toggle aktiv). `data-access/supabase/
wellbeing.js` fragt aber nur den eigenen, authentifizierten Check-in ab — keine
Funktion liest `wellbeing_shared` für einen fremden/betrachteten Athleten. Der
Toggle hat aktuell sichtbar keinen Effekt im UI.
→ Details: `docs/phase-2-konzept-morgen-checkin.md`, Abschnitt 10.

**`upsertToday`-Unit-Test fehlt**
Kein Test für `data-access/supabase/wellbeing.js` (`upsertToday`/`getToday`/
`getRange`) existiert. Braucht einen Mocking-Seam für den Supabase-Client, den
es im Repo bisher nicht gibt — andere `data-access/supabase/*`-Module sind
ebenfalls ungetestet, das ist also kein Einzelfall, aber hier zuerst relevant.

**`tests/supabase-rls.test.js` fehlt**
Geplanter Test gegen das echte `dashboard-dev`-Supabase-Projekt (Testaccounts
`athlet-test`/`trainer-test`): anon+kein Login → nichts schreibbar, Athlet A
sieht nur eigene Daten, Trainer A nur zugeordnete Athleten, Admin-Only-Ops
geprüft. Braucht Live-Credentials, die in normalen Sessions nicht vorliegen.
→ Details: `AGENTS.md` (Abschnitt „Test-Sicherheit"), `docs/phase-2-konzept-morgen-checkin.md` Abschnitt zu RLS-Grundannahmen.

**Governor-Integration in `core/briefing.js`**
Der subjektive Kanal (`getSubjectiveReadiness()` in `core/readiness.js`) ist
eine reine Vertragsfunktion ohne Verrechnung mit dem objektiven Kanal. Die
eigentliche Governor-Logik ("Belastungsempfehlungs-Logik um Befinden
erweitern") soll laut Code-Kommentar in `core/briefing.js` passieren, ist dort
aber noch nicht begonnen. `briefing.js` soll `greenMin`/`yellowMin` aus
`SUBJECTIVE_READINESS_CONFIG` importieren statt die Schwellen erneut
hardzucoden (Konsistenztest folgt mit der Umsetzung).
→ Anker-Kommentar: `assets/js/core/readiness.js:169-183`.

**Schlafscore-Pull aus intervals.icu**
Schlaf soll bewusst **kein** Slider im Morgen-Check-in sein — stattdessen als
gemessener Schlafscore über die intervals.icu-API in den objektiven Kanal
(wie RHR/HRV/TSB), damit nichts doppelt erfasst wird. Noch nicht in
`generate-data.js` umgesetzt.
→ Details: `docs/phase-2-konzept-morgen-checkin.md`, Abschnitte 2 und 5.2.

## Dashboard 2.0 — Cleanup

**`rpeFeelCoverage`/`logRpeFeelCoverage` dupliziert das `wellness.js`-Muster**
`scripts/lib/map-activity.js` hat mit der RPE/Feel-Erweiterung eine zweite,
ride-spezifische Coverage-Verifikation bekommen, die dasselbe Muster wie
`fieldCoverage`/`logWellnessCoverage` in `scripts/lib/wellness.js` re-implementiert
(Zähl-Objekt + Log-Wrapper, der bei komplett leerem Feld warnt) statt es zu
generalisieren. `wellness.js` löst das bereits deklarativ über ein
`WELLNESS_FIELDS`-Array, das sowohl vom Mapper als auch vom Coverage-Zähler
gelesen wird — die neue Funktion hardcoded stattdessen `rpe`/`feelIcu` doppelt
(einmal in `baseFields()`, einmal in `rpeFeelCoverage()`). Aufgefallen im
Code-Review zum RPE/Feel-Feature (Juli 2026), noch nicht angegangen.
→ Betroffene Stellen: `scripts/lib/map-activity.js` (`rpeFeelCoverage`,
`logRpeFeelCoverage`) vs. `scripts/lib/wellness.js` (`fieldCoverage`,
`logWellnessCoverage`).

## Erledigt (zur Historie, nicht mehr offen)

**Kartentausch → Wahoo-Push-Duplikate, falsche Fahrtenbuch-Zuordnung, fehlende Ausrollen-Erkennung**
Drei zusammenhängende Bugs im Planungstab/Sync, sichtbar beim Kartentausch
(Gruppenfahrt ↔ Intervalleinheit): mehrfach gebundener Klick-Listener löste
Duplikat-Pushes aus, `mapActivity`/`mapActivity2` ignorierten `adjustments.json`
bei der Plankarten-Zuordnung, Ausrollen nach einem Renn-Workout erbte die
Renn-Plankarte. Alle drei behoben in einem Commit.
→ Commit `626110b` (14.07.2026), siehe Commit-Message für Details je Bug.
