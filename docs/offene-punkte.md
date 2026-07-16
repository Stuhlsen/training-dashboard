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

**Schlafscore-Pull aus intervals.icu**
Schlaf soll bewusst **kein** Slider im Morgen-Check-in sein — stattdessen als
gemessener Schlafscore über die intervals.icu-API in den objektiven Kanal
(wie RHR/HRV/TSB), damit nichts doppelt erfasst wird. Noch nicht in
`generate-data.js` umgesetzt.
→ Details: `docs/phase-2-konzept-morgen-checkin.md`, Abschnitte 2 und 5.2.

## Dashboard 2.0 — Cleanup

**`addDaysISO()` (core/format.js) noch nicht an bestehenden Stellen nachgezogen**
Für den Governor neu eingeführt (Juli 2026), weil `state/wellbeing.js` "gestern"
für die 2-Tage-Range brauchte. Mehrere bestehende Dateien reimplementieren
dasselbe Datum-±-n-Tage-Muster inline statt den neuen Helper zu nutzen:
`core/pmc.js::tsbTrend` (Fenster-Start), `core/adherence.js::mondayOf`/
`weeklyStreak`/`frequencyTrend` (dort zusätzlich eine eigene `isoLocal()`-Kopie
von `localISODate`), `core/consistency.js`. Aufgefallen im Code-Review zum
Governor-Feature. Kein Bug, jede Stelle ist für sich korrekt; Konsolidierung
würde mehrere bereits geprüfte/committete Dateien anfassen, bewusst nicht im
Rahmen des Governor-Features mitgemacht.

**Glass-Input-Style dreifach dupliziert (settings-panel.js, checkin-dialog.js, event-form.js)**
`ui/event-form.js::INPUT_STYLE` ist eine dritte, fast identische Kopie desselben
Input-Looks (Hintergrund/Border/Radius/Font) wie `settings-panel.js`s lokales
`inputStyle` (Ziele-Formular) und `checkin-dialog.js`s Textarea-Style — mit
leichtem kosmetischem Drift (Padding, Border-Radius). Aufgefallen im
Code-Review zu `event-form.js` (Juli 2026). Kein Bug, nur fehlende geteilte
Konstante; Extraktion würde drei bereits geprüfte/committete Dateien anfassen,
bewusst nicht im Rahmen des Event-Verwaltung-Features mitgemacht.

**`openToken`-Race-Guard 4× unabhängig kopiert statt geteiltem Helper**
Dasselbe 4-Zeilen-Muster (`let openToken = 0; ... const myToken = openToken; ...
if (myToken !== openToken) return;`) existiert jetzt unabhängig in
`checkin-dialog.js`, `state/wellbeing.js`, `state/events.js` (dort als
`requestId`) und `ui/event-form.js`. Ein `createRequestGuard()`-Helper (z. B.
in `ui/dom.js` für die UI-Dialoge, oder ein Pendant für `state/`) wäre die
einzige Quelle der Wahrheit. Aufgefallen im Code-Review zu `event-form.js`
(Juli 2026). Kein Bug, jede Kopie ist für sich korrekt; Extraktion würde
mehrere bereits geprüfte/committete Dateien anfassen.

**`ui/event-timeline.js` nutzt Inline-Styles statt neuer `components.css`-Klassen**
`badge()`/`eventRow()`/`countdownCard()` und der "+ Event hinzufügen"-Button
bauen Layout/Typografie komplett über Inline-`style`-Strings statt über
wiederverwendbare Klassen in `assets/css/components.css` (anders als
statische Panels wie `.readiness-metric`/`.record-card`). Folgt aber demselben
Muster wie `checkin-dialog.js`/`settings-panel.js` (dynamisch per JS gebaute
Dialoge nutzen dort ebenfalls Inline-Styles) — kein Ausreißer, nur eine von
zwei parallelen Konventionen im Code. Aufgefallen im Code-Review zu
`event-timeline.js` (Juli 2026), bewusst nicht angegangen.

**`event-timeline.js`s `upcoming`-Filter dupliziert eine Grenzprüfung aus `nextRaceEvent()`**
`events.filter((e) => e.eventDate >= todayIso)` wiederholt dieselbe
Datums-Vergleichslogik wie `state/events.js::nextRaceEvent()` (dort nur
zusätzlich auf `type === "race"` eingeschränkt). Zu trivial (eine Zeile) für
eine eigene geteilte Selektor-Funktion, aber falls sich die Definition von
"anstehend" mal ändert (z. B. Cutoff-Uhrzeit statt Tagesgrenze), gibt es zwei
Stellen, die synchron bleiben müssen. Aufgefallen im Code-Review zu
`event-timeline.js` (Juli 2026), bewusst nicht angegangen.

**`event-timeline.js` rendert bei jeder `onEventsChange`-Änderung komplett neu**
`_draw()` baut bei jedem Aufruf das komplette `innerHTML` des Panels neu und
bindet alle Zeilen-/Button-Listener neu — `onEventsChange` ist nicht
athletenscoped, jede Mutation (auch für einen anderen Athleten, falls
irgendwann mehrere Timeline-Instanzen gleichzeitig offen sind) löst einen
vollen Rebuild aus, plus ein garantierter Doppel-Rebuild pro `loadEvents()`
(einmal für `loading:true`, einmal fürs Ergebnis). Bei der erwarteten
Listengröße (eine Handvoll Events pro Athlet) kein reales Performance-Problem,
nur vermerkt für den Fall, dass sich das mal ändert. Aufgefallen im
Code-Review zu `event-timeline.js` (Juli 2026), bewusst nicht angegangen.

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

## Phase 2 — vermuteter Bestandsfehler, bei der plan_cards-Migration entdeckt

**`state/events.js`/`state/goals.js` filtern vermutlich mit der falschen ID gegen eine uuid-Spalte**
Beim Bau von `state/plan-cards.js` (Phase 3) fiel auf: `ui/event-timeline.js`
ruft `EventTimeline.render(Data.activeAthleteId)` (app.js) und damit
`loadEvents("athlete1"|"athlete2")` auf — die interne String-ID, nicht die
Supabase-Profil-UUID. `data-access/supabase/events.js::listEvents()` filtert
aber `.eq("athlete_id", athleteId)` direkt gegen `events.athlete_id`, eine
`uuid`-Spalte (`0001_initial_schema.sql`). Dasselbe Muster vermutlich in
`state/goals.js`. Für `plan_cards` wurde das mit `findProfileIdByDisplayName()`
(`data-access/supabase/profiles.js`, Auflösung über den öffentlichen
`display_name`) gelöst — noch NICHT für events/goals nachgezogen, das war
außerhalb des beauftragten Migrationsschritts. Live-Verifikation gegen
`dashboard-dev` steht noch aus (ob das wirklich als Postgres-Fehler statt
leerer Liste durchschlägt); falls bestätigt, denselben Resolver in
`state/events.js`/`state/goals.js` nachziehen.

## Phase 3 — Planungstab

**M3 — Wahoo-Push-Umzug nach `data-access/` + `external_id`-Umbau zurückgestellt**
Die Vollmigration nach `plan_cards` (`scripts/migrate-plan-to-supabase.js`,
09.2026) legt die Spalte `pushed_external_id` bereits an, lässt den
Push-Code aber bewusst in `ui/planned.js` (`_pushWorkout`/
`_findExistingEvent`) unverändert — der Umzug nach `data-access/` und die
Umstellung des Duplikat-Guards von der Name+Datum-Heuristik auf
`external_id = plan_cards.id` (bestätigte Wurzel des 4×-Push-Bugs, s.
`docs/phase-3-konzept-planungstab.md` §5) war zusammen mit Schema+
Migrationsskript+data-access+state+Handler-Umbau zu groß für einen Schritt.
Vorgesehen für den Karten-CRUD-Schritt.
→ Details: `docs/phase-3-konzept-planungstab.md` §5, §8.4 Schritt 4.

**Dualität: `weekreview.js`/`adherence.js`/`ftp-progress.js` + Hero/Analyse-Panels lesen weiter die alte JSON-Pipeline**
Diese drei `core/`-Module hängen weiterhin an `Data.plannedSessions` +
`Data.adjustments` (unverändert aus `generate-data.js` bzw.
`data/adjustments.json`/`-2.json`) statt an `plan_cards` — sie wurden bei
der `plan_cards`-Migration bewusst nicht mitgezogen (deutlich über den
beauftragten Umfang hinaus). Seit die Schreibpfade in `ui/planned.js`
(Verschieben/Ausfallen/Rückgängig) auf `plan_cards` umgestellt sind, werden
NEUE Anpassungen nicht mehr in `adjustments.json`/`-2.json` gespeichert.
**Wichtig, über "künftige Läufe sehen es nicht" hinaus:** `app.js`s
`refreshAfterAdjustment()` (verdrahtet als `Planned.onAdjustmentChange`)
feuert nach JEDER Verschiebung/Ausfall/Rückgängig weiterhin und rendert
Hero-Session-Pill, Wochenrückblick und Analyse-Briefing neu — aber aus dem
weiterhin eingefrorenen `Data.plannedSessions`/`Data.adjustments`. Die
Anzeige wirkt also, als würde sie live aktualisieren, tut es aber nicht
mehr — schon in derselben Session, nicht erst nach einem Reload/Re-Sync.
Migrationskandidat für einen späteren Schritt (auf `plan_cards` als Quelle
umstellen, analog zu `ui/planned.js`).
→ Details: `docs/phase-3-konzept-planungstab.md` §8.

## Erledigt (zur Historie, nicht mehr offen)

**Kartentausch → Wahoo-Push-Duplikate, falsche Fahrtenbuch-Zuordnung, fehlende Ausrollen-Erkennung**
Drei zusammenhängende Bugs im Planungstab/Sync, sichtbar beim Kartentausch
(Gruppenfahrt ↔ Intervalleinheit): mehrfach gebundener Klick-Listener löste
Duplikat-Pushes aus, `mapActivity`/`mapActivity2` ignorierten `adjustments.json`
bei der Plankarten-Zuordnung, Ausrollen nach einem Renn-Workout erbte die
Renn-Plankarte. Alle drei behoben in einem Commit.
→ Commit `626110b` (14.07.2026), siehe Commit-Message für Details je Bug.
