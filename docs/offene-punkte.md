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

**"Multiple GoTrueClient instances"-Warnung in der Browser-Konsole (harmlos, eingeordnet)**
Beim Trainer-Dashboard-Test aufgefallen. Ursache: `data-access/supabase/client.js::
getAuthedClient()` erzeugt bei JEDEM Aufruf einen neuen `createClient(...)` — bewusst so
gebaut (Kommentar in derselben Datei), weil der Singleton-Client seinen Authorization-
Header nach dem Login nicht zuverlässig aktualisiert (beobachtet: dauerhaft 403 ohne
Bearer-Token). Jeder neue Client instanziiert intern einen eigenen GoTrueClient, auch mit
`persistSession:false`/`autoRefreshToken:false` — Supabase warnt dann unabhängig von der
tatsächlichen Persistenz, sobald mehr als eine Instanz im selben Tab existiert. Kein
Zusammenhang mit `npx serve .`/Hot-Reload. Funktional harmlos (die ephemeren Clients
schreiben nie eigenständig in `localStorage`, konkurrieren also nicht um die Session) —
aber ein Hinweis auf echten Mehraufwand: bei jedem authentifizierten Request in dieser
Session (Trainer-Kontext, Kategorien, Vorschläge, Check-in-Range, …) wird ein komplett
neuer Client aufgebaut statt einen bereits authentifizierten wiederzuverwenden. Absichtlich
nicht im Rahmen dieses Bugfix-Schritts angegangen (Cache-Invalidierung bei Token-Wechsel
bräuchte eigenes Konzept) — Kandidat für einen späteren Performance-Polish-Schritt.

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

## Phase 2 — Bestandsfehler, live bestätigt und behoben

**`state/events.js` filterte mit der falschen ID gegen eine uuid-Spalte (behoben)**
Seit der `plan_cards`-Migration (Phase 3) als Verdacht vermerkt, jetzt live über die
Browser-Konsole bestätigt (Trainer-Dashboard-Test, Juli 2026): `ui/event-timeline.js`
ruft `EventTimeline.render(Data.activeAthleteId)` (app.js) und damit
`loadEvents("athlete1"|"athlete2")` auf — die interne String-ID, nicht die
Supabase-Profil-UUID. `data-access/supabase/events.js::listEvents()` filterte
`.eq("athlete_id", athleteId)` direkt gegen `events.athlete_id`, eine `uuid`-Spalte
(`0001_initial_schema.sql`) → PostgREST antwortete mit 400 ("invalid input syntax for
type uuid"), sichtbar in der Konsole bei jedem Seitenaufbau/Athletenwechsel (nicht
spezifisch durch Drag & Drop ausgelöst — `EventTimeline.render()` läuft in `app.js`
einmal pro `renderAll()`, unabhängig von Kartenaktionen). Behoben: `state/events.js`
löst `athleteId` jetzt über `resolveAthleteProfileId()` (wiederverwendet aus
`state/plan-cards.js`, das denselben Resolver bereits hatte) auf die Profil-UUID auf,
bevor `listEvents`/`createEvent` aufgerufen werden. Getestet in
`tests/events-athlete-resolution.test.js`. `state/goals.js` war entgegen der
ursprünglichen Vermutung NICHT betroffen — es ruft `data-access/supabase/goals.js`
ausschließlich mit `getSession().id` (der echten UUID des eingeloggten Users) auf,
nie mit der internen Athleten-Kennung.

**Kausalität zu den Drag-&-Drop-Bugs (Bug 1/3) geprüft: kein struktureller Zusammenhang**
Der 400 wird über den Result-Vertrag (`{ok:false, error}`) abgefangen — `state/
events.js::loadEvents()` wirft dabei nie eine Exception, kann also nicht den
`await`-Ablauf in `app.js::renderAll()` oder `ui/plan-drag.js::endDrag()` unterbrechen.
Die events-Query-Reparatur oben ist trotzdem ein eigenständiger, längst überfälliger
Fix, nur vermutlich nicht die Ursache für Bug 1 (Drag-Grip weiterhin aktiv) oder
Bug 3 (Drag-Freeze) — beide Codepfade wurden bereits in den vorherigen Schritten
korrigiert (Render-Reihenfolge bzw. try/finally-Härtung); falls sich im nächsten
Browser-Test weiterhin NICHTS ändert, ist ein Browser-Cache-Effekt (`npx serve .`
liefert eine veraltete, gecachte Version der ES-Module aus) die naheliegendste
verbleibende Erklärung — vor weiterer Code-Suche per Hard-Refresh (Strg+Shift+R)
oder privatem Fenster auszuschließen.

## Phase 3 — Planungstab

**M3 — external_id-Upsert noch nicht live gegen intervals.icu verifiziert**
Der Wahoo-Push-Umzug (`_pushWorkout`/`_findExistingEvent` aus `ui/planned.js`
raus nach `data-access/intervals/push.js`, Duplikat-Guard von der
Name+Datum-Heuristik auf `external_id = plan_cards.id` umgestellt) ist mit
dem Karten-CRUD-Schritt erledigt (Commit `a4169bd`). Der Push nutzt jetzt
`POST /api/v1/athlete/{id}/events/bulk?upsert=true` mit `external_id` im
Payload — das ist anhand von Forum-/API-Hinweisen recherchiert, aber
**noch nicht live gegen einen echten Account getestet**. Vor Vertrauen in
Produktion: Karte mit Workout pushen → auf intervals.icu ein Event prüfen
→ Karte verschieben → erneut pushen → weiterhin nur EIN Event (aktualisiert,
kein Duplikat). Kommentar mit demselben Hinweis direkt in
`data-access/intervals/push.js`.
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

**Drag & Drop: Verschieben per Tastatur (A11y)**
`ui/plan-drag.js` ist Pointer-basiert (Maus/Touch/Pen). Das Konzept nennt als
A11y-Fallback ausdrücklich das bestehende `.planned-move-form` (Datum manuell
wählen) — das existiert und bleibt an jeder Karte erreichbar, die Funktion ist
also nicht rein maus-/touchgebunden. Offen bleibt die Konzeptfrage, ob echtes
Tastatur-Verschieben (Karte fokussierbar, Pfeile + Enter) noch nachgezogen
wird; der Griff ist derzeit nicht fokussierbar.
→ Details: `docs/phase-3-konzept-planungstab.md` §4.

**Drag & Drop: keine Umsortierung innerhalb eines Tages (`sort_order`)**
Konzept §7 nennt „zwei Karten am selben Tag → Drag innerhalb des Tages
sortiert um". Der Drop zielt aktuell nur auf einen TAG und schreibt nur
`planned_date`; ein Drop auf denselben Tag ist ein No-Op. `sort_order` wird
beim Anlegen vergeben (`createPlanCard`: max+1 des Tages) und danach nie mehr
geändert. Umsortieren per Drag ist damit noch offen.

**Drag & Drop: Karte auf einen komplett leeren Wochenblock behält ihr altes week-Label**
`core/plan-drag.js::weekLabelForDate()` übernimmt `week`/`phase` von den Karten,
die bereits in der Zielwoche liegen. Hat die Zielwoche keine andere Karte (die
gezogene selbst zählt bewusst nicht), gibt es nichts zu übernehmen → die Karte
behält ihr altes Label und hängt unter der alten Wochenüberschrift. Praktisch
selten, weil der Tab nur Wochen rendert, die mindestens eine Karte haben — der
Fall tritt v.a. auf, wenn die gezogene Karte die einzige ihrer Woche war.
Sauber lösen ließe sich das nur mit einer echten Datum→Plan-Woche-Ableitung
(die Plan-Struktur dafür lebt in `scripts/lib/plan2.js`, nicht im Frontend).
Bewusste v1-Einschränkung.

**`ui/planned.js` leitet `today` für die Abschnitts-Filterung noch aus UTC ab**
`core/format.js::localISODate()` existiert genau dafür und wird von `app.js`
und `state/events.js` bereits benutzt; `ui/planned.js::render()` berechnet
sein `today` aber weiterhin als `new Date().toISOString().split("T")[0]`, also
in UTC. In deutscher Sommerzeit (UTC+2) meint „heute" damit zwischen 00:00 und
02:00 lokaler Zeit noch den Vortag — eine Karte von gestern erscheint in dem
Fenster fälschlich unter „Ausstehend" statt unter „Verpasst".
Die **Drag-Regeln sind davon nicht betroffen**: `ui/plan-drag.js` und der
Draggable-Gate in `_renderCard()` nutzen `localISODate()` und sind korrekt.
Bewusst nicht im Zuge von Drag & Drop mitgeändert, weil es die bestehende
Filterung von Ausstehend/Verpasst/Absolviert anfasst — eigener kleiner Fix,
dann für alle drei Abschnitte zugleich.

**K3 — Typ-Default-TSS auf dünner Datenbasis kalibriert**
`core/plan-config.js::TYPE_DEFAULT_TSS` (Prioritätsstufe 3 der TSS-Herkunft) trägt
die Median-TRIMP-Werte je Session-Typ aus den Ist-Fahrten (Nebenprodukt von
`scripts/migrate-plan-to-supabase.js::logMedianTssPerType`). Mehrere Typen haben nur
sehr wenige Datenpunkte: NLS n=1 · Gruppenfahrt n=2 · Außerplanmäßig n=2 · Z2
Erholung n=2 · Tempo n=3 · Etappe n=4 · Z2 Kadenz n=4. Diese Defaults sind daher nur
grobe Anhaltspunkte. **Beim K1-Schwellen-Review nach Plan 2 (mehr Historie) diese
Werte ZUERST gegenprüfen** — zusammen mit den Konflikt-Schwellen im selben Modul.
Kommentar mit derselben Liste steht direkt an der Tabelle in `core/plan-config.js`.
→ Details: `docs/phase-3-konzept-konfliktlogik-prognose.md` §2/§3 (K1/K3).

**K-RAMPE vergleicht in v1 nur aufeinanderfolgende Projektionswochen (Plan-vs-Plan)**
`core/conflicts.js::detectConflicts` (Regel K-RAMPE) bildet die Wochenlast aus den
projizierten Tagen und vergleicht nur **volle** 7-Tage-Wochen miteinander (partielle
Anfangs-/Endwochen würden den Rampenvergleich verfälschen). Das Konzept nennt
„gegenüber Vorwoche (Ist bzw. Plan)" — der Ist-Vergleich der ERSTEN Planwoche gegen
die letzte tatsächlich gefahrene Woche fehlt in v1 bewusst (bräuchte die
TSS-Historie der Ist-Fahrten als Seed). Ein Plan mit weniger als zwei vollen Wochen
im Horizont löst K-RAMPE daher nie aus. Erweiterung möglich, wenn der Ist-Seed
gebraucht wird.
→ Details: `docs/phase-3-konzept-konfliktlogik-prognose.md` §3 (K-RAMPE).

**Nach-Drop-Feedback (Schritt 5): Browser-Verifikation gegen training-dashboard-dev noch offen**
Delta-Banner, Konflikt-Badges, Push-Warnung und die Re-Render-Verdrahtung
(`onEventsChange`) sind implementiert und unit-getestet (`tests/plan-feedback.test.js`
für die reinen Ableitungen), aber nicht live im Browser gegen einen eingeloggten
Athlet-1-Testaccount durchgeklickt (Karte verschieben → Delta-Zeile mit korrekten
TSB-Werten, betroffene Karten zeigen passende Badges, Event anlegen löst
Neuberechnung ohne Reload aus). Keine Browser-Automatisierung/Testcredentials in der
Session verfügbar, in der Schritt 5 gebaut wurde — vor Vertrauen in die Anzeige einmal
manuell durchspielen.
→ Details: `docs/dashboard-2.0-fahrplan-aktuell.md` Phase 3, `docs/phase-3-konzept-konfliktlogik-prognose.md` §4.

**Push-Warnung/Konflikt-Badges nicht auf verpassten (`missed`) Karten sichtbar**
`ui/planned.js` rendert die Konflikt-Badges (inkl. Push-Warnung) nur in `_renderCard()`
(Struktur mit `.planned-card-header`) — die "Verpasst"-Sektion nutzt ein eigenes,
einfacheres `.planned-done-item`-Markup ohne diese Struktur, obwohl dort ebenfalls ein
„Verschieben"-Button existiert. Praktisch selten relevant (Konflikte werden nur ab heute
berechnet, eine verpasste Karte liegt per Definition in der Vergangenheit), die
Push-Warnung könnte dort theoretisch greifen. Bewusst nicht mitgezogen, um die
Verpasst-Liste nicht auf die aufwendigere Card-Struktur umzustellen.

## Phase 4 — Export/Import-Workflow

**Umsetzung abgeschlossen, im echten Browser gegen `dashboard-dev` bestätigt (24.07.2026)**
`core/export-briefing.js`/`core/proposal-import-parser.js`/`core/proposal-validator.js`
(+ `state/export.js`, `state/proposals.js::previewClaudeImport`/`importClaudeProposals`,
`ui/export-panel.js`, `ui/import-dialog.js`) sind der letzte Baustein aus Phase 4 — s.
Fahrplan-Abschnitt. Per Playwright MCP als `athlete1` durchgespielt: Export-Dialog baut ein
echtes Briefing mit echten `plan_cards`-IDs/`updated_at` aus `dashboard-dev`, Kopieren
(`navigator.clipboard`) und Datei-Download (`claude-briefing-athlete1-2026-07-24.md`)
funktionieren; Import mit einer simulierten Claude-Antwort (1 valider `add`-Vorschlag + 1
mit drei Fehlern — fehlendes `plan_date`/`title`, unbekannter `type`) zeigte die Vorschau
korrekt (Teilerfolg, alle Fehler gesammelt), "1 von 2 importieren" landete reaktiv im
Vorschläge-Zähler (Banner + Trainer-Leiste, ohne manuellen Refresh) und in der
Vorschlagsliste mit korrekt berechneter Konfliktanzeige (`core/proposal-preview.js`
funktioniert unverändert auch für `source: "claude"`-Einträge). Test-Vorschlag danach
wieder gelöscht (RLS erlaubte `DELETE` auf die eigene `open`-Zeile).

**Keine Dedup-Erkennung für doppelten Claude-Import (bewusste v1-Einschränkung)**
Importiert ein Athlet dieselbe Claude-Antwort zweimal (z. B. versehentlich erneut
eingefügt), erzeugt jeder Import unabhängig neue offene `proposals`-Zeilen — es gibt
keinen Content-Hash- oder Zeitfenster-Vergleich, der das erkennt. Der Athlet sieht die
doppelten Vorschläge im normalen Review wie jeden anderen offenen Vorschlag und lehnt
sie dort ab. Bewusst zurückgestellt, da eine Erkennung einen Mechanismus bräuchte, der
im Vorschlags-Schema (v1) nirgends vorgesehen ist.
→ Details: `docs/phase-4-konzept-export-import-workflow.md` §6.

## Phase 4 — Trainer-Dashboard + proposals-CRUD

**Ultra-Review vor dem ersten Commit gefunden + behoben (zur Historie)**
Ein `/code-review --level high` auf den vollständigen Diff (8 Finder-Agenten, mehrfach
unabhängig bestätigt) deckte vor dem Commit einen kritischen Architekturfehler auf: Die
RLS-Policy "proposals: Athlet entscheidet" erlaubt das Setzen von `status` (Annehmen/
Ablehnen) ausschließlich dem Athleten selbst (`athlete_id = auth.uid()`) — die
Vorschlagsliste/Vergleichsansicht war aber ursprünglich NUR über die Trainer-Leiste
erreichbar (nur sichtbar für den Trainer). Ein Trainer hätte beim Klick auf "Übernehmen"
die Karte erfolgreich geändert (RLS erlaubt das via `is_coach_of`), aber `decideProposal`
wäre an der RLS gescheitert — der Vorschlag wäre für immer "offen" hängen geblieben, ohne
klaren Fehlertext. Behoben: neuer Athleten-Banner (`ui/proposal-banner.js`, "N Vorschläge
offen" über dem Plan, nur bei `isAthlete()`) als tatsächlicher Entscheidungs-Einstieg;
Accept/Reject-Buttons in `ui/proposal-list.js`/`ui/proposal-compare.js` nur noch bei
`isAthlete()` gerendert, sonst read-only Hinweistext für den Trainer. Zusätzlich im selben
Review-Durchlauf behoben: `acceptProposal` prüfte `target_updated_at` nie gegen den
Live-Stand der Karte (Schema-Konzept §4, Veraltet-Erkennung) — jetzt bricht Annehmen ab
und markiert sich selbst `stale`, wenn die Karte seit Vorschlagserstellung geändert wurde;
`acceptGroup`s Teilerfolg-Ergebnis wurde von `ui/proposal-list.js` stillschweigend
verworfen (jetzt Fehleranzeige); Annehmen löste keinen Refresh des Planungstabs/Overview/
Analyse aus (jetzt über `Planned.onAdjustmentChange`, wie bei Move/Cancel/Anlegen);
`loadTrainerContext` hatte keinen requestId-Schutz gegen schnellen Athletenwechsel; die
`payload`-CHECK-Constraint der Migration validierte nach der Umstellung gar keine
Feldform mehr (jetzt op-abhängige Mindestprüfung); die Vorschau eines `move`-Vorschlags
reaktivierte eine ausgefallene Zielkarte nicht (anders als das echte `movePlanCard`).
Alle Fixes unit-getestet, 331 Tests grün.

**Migration 0006 gegen `dashboard-dev` verifiziert (24.07.2026, Befund behoben) — zur Historie**
Prüfliste am Ende von `supabase/migrations/0006_proposals_v1.sql` per Playwright MCP
(`browser_evaluate`, dynamischer Import von `data-access/supabase/{auth,client}.js`,
Login als `trainer-st`/`athlete1`) gegen `dashboard-dev` durchlaufen — sechs von sieben
Punkten bestätigt:
- Spalten-Check (`created_by`/`group_id`/`op`/`target_card_id`/`target_updated_at`/`reason`) ✓
- Trainer A (Trainer-ST, coacht Stuhlsen/athlete1) legt Vorschlag für Athlet A an ✓,
  für Athlet B (hc_diZee/athlete2, gecoacht von Trainer-DZ) `RLS`-abgelehnt ✓
- Athlet A legt Vorschlag für sich selbst an (Claude-Import-Pfad, `source: 'claude'`) ✓,
  setzt Status auf `accepted` ✓, liest fremden Vorschlag (Athlet B) → 0 Zeilen ✓
- Trainer A liest alle Vorschläge von Athlet A inkl. `created_by = Athlet A` (Claude-Import) ✓,
  Status-Änderung durch den Trainer selbst → RLS filtert still (0 Zeilen aktualisiert) ✓
- `trainer_view_prefs`: Trainer A legt Zeile für Athlet A an ✓, für Athlet B RLS-abgelehnt ✓;
  Athlet A selbst kann weder lesen (0 Zeilen) noch schreiben (RLS-abgelehnt) ✓
- **`payload`-CHECK-Constraint ✗ — nicht wie in der Datei:** `op='add'`/`'replace'`/`'move'`
  mit `payload={}` wurden alle klaglos eingefügt (sollten laut Zeile 72–83 der Migration mit
  `23514`/`violates check constraint "proposals_payload_check"` abgelehnt werden — genau der
  Fall, den der Kommentar in der Migration als Grund für die op-abhängige Mindestprüfung nennt).
  Die live-Constraint prüft nachweislich nur noch `jsonb_typeof(payload) = 'object'`
  (bestätigt: ein nicht-Objekt-Payload `[]` UND ein ungültiger `op`-Wert wurden korrekt
  abgelehnt — die Constraint existiert und greift, nur mit einer älteren/schwächeren
  Bedingung als im aktuellen Dateistand). Wahrscheinlichste Erklärung: eine frühere
  Version von Migration 0006 wurde eingespielt, bevor die op-abhängige Payload-Prüfung
  (Zeile 54–83) in die Datei kam, und die aktualisierte Datei wurde seither nicht erneut
  gegen `dashboard-dev` ausgeführt.
  **Behoben (24.07.2026):** Alex hat Zeile 72–83 aus `0006_proposals_v1.sql` erneut im
  Supabase SQL-Editor gegen `dashboard-dev` ausgeführt. Per Playwright MCP re-verifiziert:
  `op='add'`/`'replace'` mit `payload={}` jetzt korrekt mit `23514`
  (`violates check constraint "proposals_payload_check"`) abgelehnt, `op='cancel'` weiterhin
  ohne Pflichtfelder erlaubt. Test-Zeilen wieder gelöscht. Migration 0006 damit vollständig
  gegen `dashboard-dev` verifiziert — kein offener Punkt mehr. (Test-Zeilen aus der ersten
  Prüfrunde wurden ebenfalls wieder gelöscht; eine `accepted`-Testzeile aus dem Claude-
  Import-Pfad-Test ließ sich per RLS nicht mehr löschen (nur `status='open'` löschbar) und
  bleibt als harmlose Dev-Testzeile stehen.)

**Move/Ausfallen als Vorschlag über die Planungstab-Buttons (behoben, zur Historie)**
Beim ersten Browser-Test als Trainer reproduziert: Der Direkt/Vorschlag-Umschalter zeigte
sichtbar "Vorschlag", das Verschieben einer Karte änderte `plan_cards` aber trotzdem sofort
direkt (persistiert über F5 hinweg) — der Umschalter wirkte nur im Karten-Dialog
(`add`/`replace`), nicht in `ui/planned.js`s "Verschieben"-/"Ausfallen"-Formularen und nicht
beim Drag & Drop. Behoben: `_handleMove`/`_handleCancel` prüfen jetzt `_isTrainerProposalMode()`
und rufen bei "Vorschlag" `createTrainerProposal()` (`op: "move"`/`"cancel"`) statt
`movePlanCard()`/`cancelPlanCard()` direkt auf — die Argumentbildung sitzt dafür als reine,
getestete Funktion in `core/proposal-payload.js` (`moveProposalArgs`/`cancelProposalArgs`,
s. `tests/proposal-payload.test.js`). Drag & Drop sollte im Vorschlag-Modus für Trainer
deaktiviert sein (kein Begründungsfeld, optimistische Sofort-Bewegung passt nicht zu "erzeugt
nur einen Vorschlag", Design-Entscheidung in `docs/phase-4-konzept-trainer-sicht.md` §3
nachgetragen) — die Button-/Formular-Seite war beim ersten Fix korrekt, der Drag-Grip blieb im
zweiten Testlauf aber trotzdem aktiv (s. nächster Punkt). Die DOM-gebundene Verzweigung selbst
(welcher Zweig bei Klick/Drop tatsächlich läuft) ist nicht per `node:test` abgedeckt — dieses
Repo verifiziert `ui/`-Änderungen laut AGENTS.md/CLAUDE.md über `node -c` + Browser-Test, nicht
über eine jsdom-Suite; entsprechend im Browser bestätigt.

**Drag-Grip im Vorschlag-Modus ignorierte den Umschalter — Ursache: Race zwischen zwei onSessionChange-Abos (behoben, im echten Browser bestätigt)**
Zwei Fixversuche (Render-Reihenfolge in `app.js`, dann ein `onSessionChange`-Abo direkt in
`ui/planned.js`) zeigten beide keine Wirkung im Browser-Test — beide isoliert aus dem Code
plausibel, aber der TATSÄCHLICHE Ablauf war ein dritter, subtilerer Fall: Ein Athlet lädt die
Seite ANONYM (oder mit einer noch nicht wiederhergestellten Supabase-Session), `renderAll()`
zeichnet die Karten also zunächst korrekt OHNE Trainer-Kontext. Loggt sich der Trainer DANACH
über das Modal ein (oder wird eine bereits persistierte Session erst nachträglich restauriert),
ändert das nur `state/session.js` — kein `renderAll()`-Zyklus läuft erneut. Ein Abo auf
`onSessionChange` allein (erster Versuch) reicht nicht: es feuert, SOBALD sich die Session
ändert, aber `ui/trainer-bar.js`s `loadTrainerContext()` (ein echter Supabase-Request) ist dann
oft noch nicht fertig — während `plan_cards` an der Stelle häufig schon aus dem State-Cache
bedient wird (schneller). `ui/planned.js`s eigener `onSessionChange`-Listener gewann das Rennen
und rendert mit demselben veralteten `trainerContext` neu, bevor `ui/trainer-bar.js`s Listener
die korrekte Kontext-Auflösung überhaupt abgeschlossen hatte.

Per Playwright MCP (`@playwright/mcp`, live gegen `dashboard-dev` als Trainer-ST) live bestätigt:
`state/trainer-view.js::getState()` zeigte `trainerContext.isTrainer: true` und
`saveMode: "proposal"` korrekt im Speicher, während gleichzeitig 41 `.planned-card-grip`-Elemente
im DOM standen — der Bruch lag also nachweislich zwischen korrektem State und veraltetem
Render, nicht in `canDragCard()` selbst (isoliert aufgerufen lieferte die Funktion immer das
richtige Ergebnis). Ein manueller `Planned.render()`-Aufruf zur Laufzeit (mit dem bereits
korrekten State) entfernte alle Griffe sofort — das bestätigte die Diagnose vor dem Fix.

Behoben: `ui/planned.js` abonniert jetzt `state/trainer-view.js::onTrainerViewChange` statt
`state/session.js::onSessionChange` — dieses Event feuert garantiert ERST NACH dem
Abschluss von `loadTrainerContext()` (der `notify()`-Aufruf steht dort hinter der
Kontext-Zuweisung), race-frei. Per Playwright end-to-end geprüft (frischer Seitenaufbau mit
bereits persistierter Trainer-Session, keine manuelle Zwischenaktion): 0 Griffe im
Vorschlag-Modus, 41 Griffe sofort nach Umschalten auf "Direkt" — beide Richtungen reaktiv
ohne Reload. **Zusätzlich von Alex im eigenen Browser manuell nachgetestet und bestätigt
(24.07.2026)** — abgeschlossen.

**Wichtige Lehre für künftige UI-/Timing-Bugs:** Zwei rein code-lesebasierte Fixversuche
(Render-Reihenfolge in `app.js`, dann ein naives `onSessionChange`-Abo) waren beide in sich
logisch schlüssig, aber beide wirkungslos — die Ursache war eine Race Condition zwischen zwei
unabhängigen Event-Listenern, die sich durch reines Lesen des Codes nicht zuverlässig auflösen
ließ (die relative Reihenfolge zweier konkurrierender async-Operationen ist keine Eigenschaft,
die im Quelltext sichtbar ist). Erst die Einrichtung von Playwright MCP (`.mcp.json`, s. u.) und
die direkte Inspektion des Laufzeit-Zustands per `browser_evaluate` (dynamisches `import()` der
laufenden App-Module) machte die Diagnose eindeutig — s. Konvention weiter unten unter
„Playwright MCP für UI-nahe Bugs" bzw. `CLAUDE.md`.

**Drag & Drop friert nach dem ersten Drop für ALLE Karten ein — unter realen Bedingungen nicht mehr reproduzierbar (Härtung bleibt bestehen, bestätigt)**
Dritter Fund des ersten Testlaufs: nach einem erfolgreichen Drop ließ sich keine Karte mehr
ziehen. `endDrag()` wurde vorsorglich gehärtet (komplette Aufräumlogik in `try`, Listener-
Abmeldung + `drag = null` in `finally`, s. Commit `85c7c4e`). Mit Playwright MCP wurden danach
vier reale Drag-Sequenzen gegen den echten `dashboard-dev`-Server nachgestellt (native
`PointerEvent`-Dispatches über Griff → Tages-Slot → Drop, inkl. eines bewussten Stresstests mit
zwei Drags ohne Wartezeit dazwischen): alle vier Karten wurden korrekt verschoben, keine
Konsolenfehler, keine hängengebliebene `is-card-dragging`-Klasse, keine verwaisten
Tages-Slot-Zeilen, Griffe nach jedem Zyklus wieder normal vorhanden. Der Freeze ließ sich also
NICHT reproduzieren — entweder hat die Härtung das ursprüngliche Problem tatsächlich behoben,
oder die Ursache hing an einer Eigenheit der echten Maus-/Touch-Interaktion (z. B. deutlich mehr
Zwischenereignisse über eine längere reale Geste), die die synthetischen Events nicht abbilden.
Kein automatisierter Regressionstest möglich (DOM-/Pointer-Event-Integration, kein jsdom in
diesem Projekt). **Von Alex im eigenen Browser manuell nachgetestet und bestätigt (24.07.2026):
mehrere aufeinanderfolgende Drag-Verschiebungen funktionieren wie erwartet, kein Einfrieren
mehr** — abgeschlossen. Die `try/finally`-Härtung in `endDrag()` (Commit `85c7c4e`) bleibt
bestehen; sollte das Symptom in einer späteren Session dennoch wieder auftreten, ist ein
Playwright-Nachbau mit `browser_drag`/langsameren, vielstufigen Bewegungen statt der hier
verwendeten Zwei-Schritt-Simulation der nächste Schritt (echte Maus-/Touch-Gesten erzeugen
deutlich mehr Zwischenereignisse als die synthetischen Events dieser Diagnose).

**Trainer-Leiste/Athleten-Banner verschwinden nach F5 (behoben, zur Historie)**
Ebenfalls beim ersten Browser-Test reproduziert: Nach einem echten Seiten-Reload (nicht nur
Athleten-Toggle) blieb die Trainer-Leiste leer, obwohl der eingeloggte User weiterhin Trainer
des angezeigten Athleten war. Ursache: `app.js`s Haupt-IIFE ruft `renderAll()` (und darin
`TrainerBar.render()`/`ProposalBanner.render()`) VOR `initSession()` auf — beim ersten
Seitenaufbau ist die Supabase-Session dadurch noch nicht wiederhergestellt,
`loadTrainerContext()` sieht (korrekt für diesen Moment) keinen eingeloggten User, und nichts
löste einen erneuten Render aus, sobald `initSession()` die Session später asynchron nachlud.
Behoben: `ui/trainer-bar.js` und `ui/proposal-banner.js` abonnieren jetzt selbst
`state/session.js::onSessionChange` und rendern mit dem bereits gecachten Kontext
(Athlet-ID/briefing/tsb/rides) erneut, sobald sich der Session-Status ändert — kein Eingriff
in `app.js`s Init-Reihenfolge nötig. Auch hier: DOM-gebunden, nicht per `node:test` abgedeckt,
Browser-verifiziert.

**Trainer kann eine Karte nie hart löschen (bewusst, nicht nur zurückgestellt)**
`ui/plan-card-dialog.js` blendet den "Löschen"-Button für jeden Trainer-Speichervorgang
aus, unabhängig vom Direkt/Vorschlag-Umschalter — das Vorschlags-Schema kennt v1 bewusst
kein `delete`-Op (Streichen läuft über `cancel`), und T2 verlangt ohnehin, dass Löschen nie
unilateral passiert. Kein offener Punkt, nur hier vermerkt, falls später ein `delete`-Op
diskutiert wird.

**"withdrawn"-Status ohne UI-Pfad**
Das Schema (`proposals.status`) kennt `withdrawn` als Wert, aber kein Mockup/keine
UI-Aktion dieses Schritts erzeugt ihn — Zurückziehen eines eigenen offenen Vorschlags läuft
aktuell nur über die RLS-erlaubte harte Löschung (DELETE, `status = 'open'`), für die es
ebenfalls noch keinen UI-Button gibt. Nicht dringend (Vorschläge lassen sich stattdessen
einfach ablehnen), aber eine Lücke zum Schema.

**CTL/ATL-Verlauf-Kachel zeigt nur den aktuellen Snapshot, keinen echten Verlauf**
Die optionale Trainer-Leisten-Kachel "CTL/ATL-Verlauf" (`ui/trainer-bar.js::ctlAtlTile`)
zeigt nur `projection.startCtl`/`startAtl` (den heutigen Ist-Stand), keine Sparkline über
die Zeit — eine echte Verlaufsdarstellung hätte die bestehende SVG-Chart-Infrastruktur
(`ui/charts/`) angebunden, was für eine Standardmäßig-aus-Kachel nicht im Verhältnis zum
Aufwand stand. Name der Kachel ("Verlauf") ist dadurch etwas großzügig ausgelegt.

**RLS-Testfälle für `proposals`/`trainer_view_prefs` noch nicht ergänzt**
`tests/supabase-rls.test.js` existiert weiterhin nicht (s. bestehender Punkt oben zu Phase
2) — die in Migration `0006` beschriebene Prüfliste (Trainer sieht Athlet-A-Vorschläge
inkl. Claude-Importen, nicht Athlet B; `trainer_view_prefs` nur für den eigenen Trainer)
ist manuell gegen `dashboard-dev` zu prüfen, sobald Live-Credentials verfügbar sind.

**Review-Restpunkte, bewusst nicht behoben (niedrigere Priorität)**
Aus demselben Review-Durchlauf zurückgestellt, da sie keine Korrektheit gefährden, nur
Performance/Wartbarkeit:
- `core/proposal-preview.js::previewProposal` läuft pro Zeile in `ui/proposal-list.js`
  neu (volle PMC-Projektion + Konfliktsuche, 2× `projectLoad`/`detectConflicts` pro
  offenem Vorschlag) — bei vielen offenen Vorschlägen (z. B. ein großer Claude-Import)
  spürbar langsamer als nötig, da die "Vorher"-Projektion für alle Vorschläge identisch
  ist und nur einmal berechnet werden müsste.
- `ui/trainer-bar.js::TrainerBar.render()` lädt Trainer-Kontext, Kategorien, Vorschläge
  und die Check-in-Range sequentiell statt der drei unabhängigen letzten drei parallel
  (`Promise.all`) — unnötige zusätzliche Round-Trip-Latenz beim Öffnen des Planungstabs.
- Dialog-Grundgerüst (Overlay/Modal/Escape-Handler) ist jetzt ein viertes Mal separat
  implementiert (`ui/proposal-list.js`, `ui/proposal-compare.js`, neben
  `ui/checkin-dialog.js`/`ui/plan-card-dialog.js`) — kein gemeinsamer Dialog-Helper in
  `ui/dom.js`. Größerer Umbau, nicht im Rahmen dieses Schritts angegangen.
- `core/proposal-payload.js::payloadToCardData` liefert immer alle Felder (auch als
  `undefined`, wenn im payload nicht vorhanden) — bei einem hypothetisch unvollständigen
  `replace`-Payload würde `ui/proposal-compare.js`s Vorschau-Spread ein vorhandenes Feld
  fälschlich als "–" zeigen. Heute folgenlos, da der einzige Erzeuger
  (`ui/plan-card-dialog.js`) immer ein vollständiges Payload sendet; relevant erst, wenn
  der Claude-Import (noch nicht gebaut) unvollständige Payloads zulassen sollte.

**Browser-Verifikation des gesamten Trainer-Flows noch offen**
Trainer-Leiste, Vorschlagsliste, Vergleichsansicht und der Karten-Dialog-Hook sind
unit-getestet (`tests/proposals.test.js`, `tests/proposal-*.test.js`), aber nicht live im
Browser gegen einen eingeloggten `trainer-test`-Account durchgeklickt (Kategorien-Toggle
speichert wirklich, Vorschlag anlegen → in der Liste sichtbar → Vergleichsansicht zeigt
korrekte TSB-Delta/Konflikt-Badges → Annehmen ändert die Karte tatsächlich). Keine
Browser-Automatisierung/Testcredentials in dieser Session verfügbar — konsistent mit dem
bereits etablierten Muster aus Phase 2/3 (s. entsprechende Punkte oben).

## Erledigt (zur Historie, nicht mehr offen)

**Kartentausch → Wahoo-Push-Duplikate, falsche Fahrtenbuch-Zuordnung, fehlende Ausrollen-Erkennung**
Drei zusammenhängende Bugs im Planungstab/Sync, sichtbar beim Kartentausch
(Gruppenfahrt ↔ Intervalleinheit): mehrfach gebundener Klick-Listener löste
Duplikat-Pushes aus, `mapActivity`/`mapActivity2` ignorierten `adjustments.json`
bei der Plankarten-Zuordnung, Ausrollen nach einem Renn-Workout erbte die
Renn-Plankarte. Alle drei behoben in einem Commit.
→ Commit `626110b` (14.07.2026), siehe Commit-Message für Details je Bug.
