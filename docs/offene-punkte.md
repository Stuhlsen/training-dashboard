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

**`tests/supabase-rls.test.js` fehlt**
Geplanter Test gegen das echte `dashboard-dev`-Supabase-Projekt (Testaccounts
`athlet-test`/`trainer-test`): anon+kein Login → nichts schreibbar, Athlet A
sieht nur eigene Daten, Trainer A nur zugeordnete Athleten, Admin-Only-Ops
geprüft. Braucht Live-Credentials, die in normalen Sessions nicht vorliegen.
→ Details: `AGENTS.md` (Abschnitt „Test-Sicherheit"), `docs/phase-2-konzept-morgen-checkin.md` Abschnitt zu RLS-Grundannahmen.

**Schlafscore noch nicht im Governor/UI verrechnet (bewusste Folge-Lücke)**
`sleepScore` (intervals.icu) wird seit Commit `c8c7975` in den Wellness-
Datenpipeline gezogen (`scripts/lib/wellness.js`), fließt aber noch NICHT in
`core/readiness.js::assessReadiness()` oder den Governor (`core/briefing.js`)
ein — das wäre ein kalibrierungssensibler Eingriff in bereits getestete
Schwellenwerte, den der Konzeptpunkt nicht explizit verlangt (Fahrplan nennt
das selbst als „nach readiness-Refactor"-Folgeschritt). Auch keine eigene
Chart-Darstellung, der bestehende Schlaf-Chart zeigt weiterhin nur die Dauer
(`sleepHours`). Eigener späterer Schritt, wenn gewünscht.
→ Details: `docs/phase-2-konzept-morgen-checkin.md`, Abschnitte 2 und 5.1.

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

**`planAdherence()`/`buildWeekReview()`s "verpasst"-Titel zeigt immer generisch "Einheit" (vorbestehende Lücke, unverändert)**
`core/adherence.js::planAdherence()` liest `s.title || "Einheit"` für die
Liste der verpassten Termine — sowohl die alten `plannedSessions`-Objekte
(`scripts/lib/plan2.js`/`plan-athlete2.js`, Feld `name`) als auch die neuen
`plan_cards`-Sessions (`toSession()`, Feld `name`) tragen aber nie ein
`.title`-Feld, nur `.name`. Der Fallback greift also seit jeher IMMER —
kein Regressions-Effekt der `plan_cards`-Migration (Teil 4 unten), sondern
eine bereits vorher bestehende, bei der Migration nur mit-verifizierte
Lücke. Nicht mitgefixt, um Teil 4 nicht mit einer fachlich unabhängigen
Änderung zu vermischen.

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

## Phase 4 — Trainer-Leiste erschien fälschlich beim Athleten selbst (behoben, per Playwright live bestätigt)

Von Alex im manuellen Nachtest gefunden (25.07.2026): Als Athlet „Stuhlsen" (kein
Trainer-Account) eingeloggt, zeigte der Planungstab trotzdem „Du trainierst
Stuhlsen" mit vollem Direkt/Vorschlag-Toggle — Widerspruch zu Trainer-Sicht-
Konzept §5 (Leiste nur für den zugeordneten Trainer, nie beim Athleten selbst).

**Live reproduziert** (frischer Login als `stuhlsen@training-dashboard.dev` über
das echte Formular, kein Trainer-Account beteiligt): `state/session.js`/
`state/trainer-view.js` hatten den korrekten Zustand (`isCoach(): false`,
`trainerContext.isTrainer: false`), trotzdem stand `.trainer-bar` im DOM.
Gezielt nachgestellt: `#trainer-bar-container` manuell geleert (simuliert den
korrekten leeren Render), dann `loadProposals('athlete1')` direkt aufgerufen
(genau das, was `ui/proposal-banner.js::ProposalBanner.render()` bei JEDEM
`renderAll()` für den eingeloggten Athleten selbst tut) — die Trainer-Leiste
erschien dadurch sofort wieder.

**Ursache:** `ui/trainer-bar.js::_draw()` prüfte `trainerContext.isTrainer`
nirgends selbst — nur der AUFRUFENDE `TrainerBar.render()` tat das vor dem
ersten `_draw()`-Aufruf. Der modul-globale Listener `onProposalsChange(() => {
if (container) _draw(); })` (unten in derselben Datei) feuert aber bei JEDER
Änderung am geteilten `proposals`-State — auch wenn diese Änderung vom
Athleten-eigenen `ProposalBanner`-Ladevorgang stammt, nicht von einer echten
Trainer-Aktion. Da `container` nach dem ersten (korrekten) Render bereits
gesetzt war, rendert dieser Listener unconditional neu, ohne den Trainer-Gate
erneut zu prüfen — deterministisch bei jedem Seitenaufbau eines eingeloggten
Athleten mit Planungstab, kein Timing-Zufall.

**Sicherheitsfolge geprüft, keine gefunden:** Die sichtbaren Buttons waren
technisch „live" (`setSaveMode()` änderte echten State), aber jeder tatsächliche
Schreibpfad prüft `isCoach() && trainerContext.isTrainer` selbst noch einmal
unabhängig (`ui/planned.js::_isTrainerProposalMode()`,
`ui/plan-card-dialog.js::isTrainerSaving`) — für Stuhlsen beides `false`, also
kein Vorschlag an sich selbst erzeugbar, keine Trainer-Rechte nutzbar. Die
„⚙ Ansicht anpassen"-Speicherung scheiterte sicher (No-op, `athleteProfileId`
war `null`). Rein ein Anzeige-/Vertrauensproblem, keine RLS-Umgehung.

**Behoben:** `_draw()` prüft jetzt selbst `trainerContext.isTrainer` als
erste Zeile und leert den Container statt zu rendern, wenn falsch — schützt
damit ALLE Aufrufer von `_draw()`, nicht nur `render()`. Per Playwright erneut
bestätigt: Athlet selbst → Leiste leer; Trainer-ST auf seinem Athleten
(Stuhlsen) → Leiste korrekt sichtbar; Trainer-ST auf fremdem Athleten
(hc_diZee) → weiterhin leer.

## Phase 4 — Export/Import-Workflow

**Umsetzung abgeschlossen, im echten Browser gegen `dashboard-dev` bestätigt (24.–25.07.2026)**
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

**Manueller Nachtest (Finding 2, 25.07.2026) fand einen echten Datumswiderspruch im
Briefing — behoben.** `projection.asOf` (core/pmc.js::currentPmc) ist der ANKER (letzte
Fahrt mit TSB-Signal), NICHT "heute" — `startCtl`/`startAtl` sind aber bereits lastfrei bis
`today` fortgeschrieben (dieselben Zahlen wie im Analyse-Tab). Eine frühere Fassung von
`core/export-briefing.js` beschriftete den Form-Abschnitt trotzdem mit `Heute
(${projection.asOf})` — im Live-Test zehn Tage älter als das `today`-Feld im JSON-Anhang
desselben Briefings. Behoben: „Heute" zeigt immer `today`, ein Hinweis macht die
Fortschreibung transparent, wenn der Anker abweicht (Konvention aus `ui/analysis.js`/
`ui/charts/pmc.js`: „Stand …, fortgeschrieben"). Regressionstest in
`tests/export-briefing.test.js`.

**Übrige Finding-2-Punkte, kein Bug:**
- „Keine Events erfasst" — Testevent für `athlete1` angelegt (`Playwright-Testevent
  (Export-Nachtest)`, 06.09.2026, `priority: 'main'`), Export danach inhaltlich
  aussagekräftiger. Kann bei Bedarf gelöscht werden.
- RPE/Feel bei den Ist-Fahrten durchgehend „–": kommt aus `data/rides.json`
  (JSON-Sync-Pipeline, echte intervals.icu-Werte) — bewusst NICHT fabriziert, das würde
  echte Trainingsdaten verfälschen. Bleibt Testdaten-bedingt, bis ein echter Sync-Lauf
  mit RPE/Feel-Werten für diese Fahrten vorliegt.
- Befinden-Notiz „–": nicht befüllt, da eine vorhandene echte Check-in-Zeile ohne Notiz
  nicht mit einer erfundenen Notiz überschrieben werden sollte (könnte reale Athleten-
  Eingabe verfälschen) — bewusst unangetastet gelassen, Alex kann bei Bedarf selbst eine
  echte Notiz im Morgen-Check-in ergänzen.

**Nebenbefund beim Testevent-Anlegen: K-EVENT feuert nie mehr (`priority`-Skalen-Mismatch,
s. „Erledigt" unten, behoben Commit `f09481d`).**

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

**K-EVENT feuert nie mehr — priority-Skalen-Mismatch main/secondary statt A/B (behoben)**
`core/conflicts.js` (K-EVENT-Regel) verglich `events.priority` gegen die alten Werte
`"A"`/`"B"`, obwohl `0004_events.sql` (`events_priority_check`) seit der Migration nur
noch `"main"`/`"secondary"` erlaubt — der Vergleich war seither für jedes reale Event
`false`, K-EVENT konnte nie mehr auslösen (Nebenbefund beim Testevent-Anlegen für den
Export/Import-Nachtest, 25.07.2026, s. Phase-4-Abschnitt oben). Behoben:
`core/conflicts.js` und `core/plan-config.js` (`eventWindowA`/`eventWindowB` →
`eventWindowMain`/`eventWindowSecondary`, keine weiteren Aufrufer) auf `main`/`secondary`
umgestellt. `ui/trainer-bar.js::tsbTile()`/`core/plan-feedback.js::horizonRaceEvent()`
verifiziert nicht betroffen (filtern nur auf `type === "race"`). Regressionstests in
`tests/conflicts.test.js` auf `main`/`secondary` umgestellt.
→ Commit `f09481d`. Details: `docs/phase-3-konzept-konfliktlogik-prognose.md` §3 (K-EVENT).

**`ui/planned.js` berechnete `today` für die Abschnitts-Filterung in UTC statt lokal (behoben)**
`render()` nutzte `new Date().toISOString().split("T")[0]` für die Abschnitts-Filterung
(Ausstehend/Verpasst/Absolviert) — in deutscher Sommerzeit (UTC+2) zeigte das zwischen
00:00 und 02:00 Uhr lokaler Zeit noch den Vortag, eine Karte von gestern erschien in dem
Fenster fälschlich unter „Ausstehend" statt „Verpasst". Behoben: auf die bereits
vorhandene, für die Drag-Regeln bereits genutzte `localISODate()` (`core/format.js`)
umgestellt — eine einzige `todayLocal`-Variable statt zwei parallelen „heute"-Quellen.
Die Drag-Regeln (`ui/plan-drag.js`, `_renderCard()`-Gate) waren davon nicht betroffen und
blieben unverändert. Kein automatisierter Regressionstest ergänzt: `ui/`-Änderungen
werden in diesem Repo über `node -c` + Browser-Test verifiziert, nicht über eine
jsdom-Suite (keine jsdom-Dependency, `render()` braucht `document`) — ein
Mitternachts-/UTC-Rollover-Test bräuchte einen Mocking-Seam für die Systemzeit in
`render()`, den es nicht gibt.
→ Commit `d3e6996`.

**wellbeing_public/wellbeing_shared — kein Frontend-Konsument (behoben)**
`data-access/supabase/wellbeing.js::getSharedRange()` liest jetzt die öffentliche
`wellbeing_shared`-View (0003_wellbeing.sql). `state/wellbeing.js::loadSharedToday()`
löst die Athleten-ID wie überall sonst über `resolveAthleteProfileId()`
(state/plan-cards.js) auf. `ui/wellbeing-card.js` zeigt die freigegebenen Werte
(Energie/Muskeln/Stimmung, nie `note`) des per Athleten-Toggle betrachteten
Athleten für Betrachter ohne Athlet-Rolle (Besucher, fremder Coach) — der
eingeloggte Athlet behält weiterhin seine eigene, vom Toggle unabhängige
Editor-Karte (bestehende, bewusste Design-Entscheidung, nicht angetastet).
Live gegen `training-dashboard-dev` per Playwright MCP verifiziert: Toggle an +
Eintrag vorhanden → Werte sichtbar; kein Eintrag für heute → Karte verschwindet;
Toggle aus (athlete2, `wellbeing_public=false`) → View liefert leer, RLS greift.
→ Commit `73f1190`. Details: `docs/phase-2-konzept-morgen-checkin.md` Abschnitt 10.

**`upsertToday`-Unit-Test fehlt (behoben)**
Erster direkter Test einer `data-access/supabase/*`-Datei (`tests/wellbeing.test.js`)
über einen neuen, wiederverwendbaren Fake-Supabase-Client-Seam
(`tests/helpers/fake-supabase-client.js`) statt nur über eine gemockte `state/`-
Grenze — `client.js` selbst wird per `mock.module()` ersetzt. Deckt Query-Aufbau,
Row-Mapping und Result-Konvention für `upsertToday`/`getRange`/`getSharedRange` ab.
Bewusst nur an diesem einen Modul eingeführt — die übrigen `data-access/supabase/*`-
Module (goals.js, profiles.js, events.js, …) bleiben vorerst ungetestet, das wäre
ein eigener, größerer Schritt.
→ Commits `73f1190`, `0afe075`.

**Schlafscore-Pull aus intervals.icu (Datenerfassung behoben, Governor/UI bewusst offen gelassen)**
`scripts/lib/wellness.js::WELLNESS_FIELDS` liest jetzt `sleepScore` (intervals.icu-
API-Schema: gemessener float-Score) — bewusst NICHT `sleepQuality` (kleine
Integer-Skala, self-reported, gehört zur selben Feldfamilie wie soreness/fatigue/
stress/mood/motivation). Feldname per offiziellem OpenAPI-Schema
(`intervals.icu/api/v1/docs`) geprüft, nicht geraten. Alle drei Pflichtstellen
ergänzt (`scripts/lib/wellness.js`, `core/validate.js`, `types.js`); `generate-data.js`
selbst brauchte keine Änderung, ruft `mapWellnessList()`/`logWellnessCoverage()`
bereits generisch auf. Verrechnung in `core/readiness.js`/dem Governor sowie eine
eigene Chart-Darstellung bewusst NICHT gemacht (s. neuer Punkt oben unter Phase 2 —
kalibrierungssensibel, vom Konzept nicht explizit verlangt).
→ Commit `c8c7975`. Details: `docs/phase-2-konzept-morgen-checkin.md` Abschnitte 2, 5.1.

**Dualität: `weekreview.js`/`adherence.js`/`ftp-progress.js` + Hero/Analyse-Panels lasen die alte JSON-Pipeline (behoben)**
`core/weekreview.js`/`core/adherence.js`/`core/ftp-progress.js` selbst brauchten
KEINE Änderung: `plan_cards`-Zeilen kommen über `toSession()`
(`data-access/supabase/plan-cards.js`) bereits in exakt der „effektiven"
Session-Shape (Verschiebung/Ausfall schon eingerechnet), die
`core/planning.js::effectiveSessions()` vorher aus `plannedSessions`+`adjustments`
zusammengebaut hat — ein leeres `{}` als `adjustments`-Argument reicht. Geändert
wurden die 5 Aufrufstellen (`app.js` ×3 inkl. `refreshAfterAdjustment()`,
`ui/overview.js`, `ui/analysis.js` ×2): lesen jetzt `getState().cards` aus
`state/plan-cards.js` statt `Data.plannedSessions`/`Data.adjustments`. `app.js::
renderAll()` lädt `plan_cards` jetzt früh (vor der Hero/Wochenrückblick-Berechnung,
nicht erst in `Planned.render()` weiter unten) — sonst hätte auch der allererste
Render nach einem Athletenwechsel noch die alte Datenquelle gezeigt;
`Planned.render()` erkennt den bereits geladenen Stand und lädt nicht doppelt.
Nebenbei: `refreshAfterAdjustment()` berechnete `todayISO` in UTC statt lokal
(gleiche Bugklasse wie Commit `d3e6996`) — auf `localISODate()` umgestellt.
Live gegen `training-dashboard-dev` per Playwright MCP verifiziert (kein Login in
der Session verfügbar, daher Kartenmutation direkt am `plan_cards`-State simuliert
statt über `movePlanCard()`/`cancelPlanCard()` — deren Schreibpfade selbst sind
bereits in `tests/plan-cards-move.test.js` abgedeckt): Karte als ausgefallen
markiert → Hero-Pill, Wochenrückblick (Plan 2/3 → 2/2) und Analyse-Briefing
aktualisieren sich SOFORT ohne Reload; Rückgängig stellt den Ursprungszustand
wieder her. Athlet 2 (GFNY-Plan, `hasPlanningTab` ohne `ownPlan`) ebenfalls
geprüft — Konsistenz-Panel zeigt weiterhin bewusst keine Plan-Adhärenz. Bestehende
`core/`-Tests unverändert grün, da `core/` selbst nicht angefasst wurde.
→ Commit `a549249`. Details: `docs/phase-3-konzept-planungstab.md` §8.

**Kartentausch → Wahoo-Push-Duplikate, falsche Fahrtenbuch-Zuordnung, fehlende Ausrollen-Erkennung**
Drei zusammenhängende Bugs im Planungstab/Sync, sichtbar beim Kartentausch
(Gruppenfahrt ↔ Intervalleinheit): mehrfach gebundener Klick-Listener löste
Duplikat-Pushes aus, `mapActivity`/`mapActivity2` ignorierten `adjustments.json`
bei der Plankarten-Zuordnung, Ausrollen nach einem Renn-Workout erbte die
Renn-Plankarte. Alle drei behoben in einem Commit.
→ Commit `626110b` (14.07.2026), siehe Commit-Message für Details je Bug.
