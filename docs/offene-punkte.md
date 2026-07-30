# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte, die sonst nur
> im Chat-Verlauf existieren würden. **Nur Verweis + kurzer Kontext** — die
> Details leben in den Konzeptdokumenten (`docs/phase-*-konzept-*.md`) und in
> den Commit-Messages, nicht hier (verlinken statt duplizieren). Reihenfolge
> = Priorität, nicht Chronologie. Beim Abschließen eines Punkts: hier auf
> einen Einzeiler unter „Erledigt" kürzen (nicht als Fließtext stehen lassen)
> und im jeweiligen Konzeptdokument als erledigt markieren.

## Phase 2 — Befinden & Events

- **Schlafscore fließt noch nicht in Governor/UI** — `sleepScore` wird seit
  Commit `c8c7975` gezogen, aber `core/readiness.js`/`core/briefing.js`
  nutzen es noch nicht (kalibrierungssensibler Eingriff in bereits getestete
  Schwellenwerte, bewusst zurückgestellt). → `docs/phase-2-konzept-morgen-checkin.md` §2/5.1.

## Dashboard 2.0 — Cleanup (Code-Review-Funde, bewusst nicht angegangen)

Kleinere Duplizierungen/Stilbrüche, keine Bugs — Extraktion würde jeweils
mehrere bereits committete Dateien anfassen:

- `addDaysISO()` (`core/format.js`) nicht überall nachgezogen:
  `core/pmc.js::tsbTrend`, `core/adherence.js` (+ eigene `isoLocal()`-Kopie),
  `core/consistency.js`.
- Glass-Input-Style 3× fast identisch kopiert: `settings-panel.js`,
  `checkin-dialog.js`, `ui/event-form.js::INPUT_STYLE`.
- `openToken`-Race-Guard-Muster 4× unabhängig kopiert: `checkin-dialog.js`,
  `state/wellbeing.js`, `state/events.js` (als `requestId`), `ui/event-form.js`.
- `ui/event-timeline.js`: Inline-Styles statt `components.css`-Klassen (folgt
  aber der `checkin-dialog.js`-Konvention); `upcoming`-Filter dupliziert
  `nextRaceEvent()`; rendert bei jeder Änderung komplett neu (kein
  Perf-Problem bei aktueller Datengröße).
- `rpeFeelCoverage()`/`logRpeFeelCoverage()` (`scripts/lib/map-activity.js`)
  dupliziert das deklarative `WELLNESS_FIELDS`-Muster aus
  `scripts/lib/wellness.js` statt es zu generalisieren.
- **"Multiple GoTrueClient instances"-Konsolenwarnung** — harmlos (s.
  Kommentar in `data-access/supabase/client.js`), aber Hinweis auf echten
  Mehraufwand (jeder authentifizierte Request baut einen neuen Client statt
  einen bestehenden wiederzuverwenden). Kandidat für einen späteren
  Performance-Polish-Schritt.

## Phase 3 — Planungstab

- **M3 — `external_id`-Upsert weiterhin nicht live gegen intervals.icu
  verifiziert** — am 25.07.2026 bewusst gestoppt statt ausgeführt: keine
  Live-intervals.icu-Credentials verfügbar (`INTERVALS_API_KEY`/
  `INTERVALS_ATHLETE_ID` in `.env` auskommentiert), ein Push würde gegen den
  echten Trainingskalender von Athlet 1/2 schreiben — kein Sandbox-Account
  vorhanden. Push nutzt weiterhin `external_id = plan_cards.id`, nur anhand
  von API-Doku recherchiert (s. Kopfkommentar `data-access/intervals/
  push.js`). Vor Produktion: pushen → Karte verschieben → erneut pushen →
  weiterhin nur EIN Event. → `docs/phase-3-konzept-planungstab.md` §5/§8.4.
- **Drag & Drop, bewusste v1-Einschränkungen:** kein Tastatur-Verschieben
  (A11y-Fallback über `.planned-move-form` existiert bereits); keine
  Umsortierung innerhalb eines Tages (`sort_order` wird nach dem Anlegen nie
  neu vergeben); Karte auf einen komplett leeren Wochenblock behält ihr altes
  `week`-Label. → §4/§7 im Konzept.
- **K3 — Typ-Default-TSS auf dünner Datenbasis** (`core/plan-config.js::TYPE_DEFAULT_TSS`,
  n=1–4 bei mehreren Typen) — beim K1-Schwellen-Review nach Plan 2 (mehr
  Historie) zuerst gegenprüfen. → `docs/phase-3-konzept-konfliktlogik-prognose.md` §2/§3.
- **K-RAMPE vergleicht nur Plan-vs-Plan**, kein Ist-Seed für die erste
  Planwoche gegen die letzte tatsächlich gefahrene Woche. → ebd. §3.
- **Push-Warnung/Konflikt-Badges fehlen in der „Verpasst"-Sektion**
  (`ui/planned.js`, eigenes `.planned-done-item`-Markup ohne Badge-Struktur)
  — praktisch selten relevant (Konflikte gelten nur ab heute).

## Phase 4 — Trainer-Dashboard & Export/Import

- **Keine Dedup-Erkennung für doppelten Claude-Import** (bewusste
  v1-Einschränkung) — zwei Importe derselben Antwort erzeugen zwei offene
  Vorschläge. → `docs/phase-4-konzept-export-import-workflow.md` §6.
- **„withdrawn"-Status ohne UI-Pfad** — Schema kennt den Wert, Zurückziehen
  läuft aktuell nur über harte Löschung (RLS erlaubt `DELETE` bei `status='open'`),
  ohne eigenen Button.
- **CTL/ATL-Verlauf-Kachel zeigt nur den Snapshot**, keine Sparkline
  (`ui/trainer-bar.js::ctlAtlTile`) — Name der Kachel etwas großzügig ausgelegt.
- **Trainer kann eine Karte nie hart löschen** — bewusst, kein `delete`-Op in
  proposals v1 (Streichen läuft über `cancel`), kein offener Punkt.
- **Review-Restpunkte, niedrige Priorität** (aus dem Ultra-Review vor dem
  ersten proposals-Commit): `previewProposal()` rechnet die „Vorher"-Projektion
  pro Vorschlag neu statt einmal gemeinsam; `TrainerBar.render()` lädt
  Kontext/Kategorien/Vorschläge/Check-ins sequentiell statt per `Promise.all`;
  Dialog-Grundgerüst ist jetzt 4× separat implementiert (kein
  `ui/dom.js`-Helper); `payloadToCardData()` liefert unvollständige Payloads
  nicht robust (heute folgenlos, einziger Erzeuger sendet immer vollständig).

---

## Phase 5 — Explorer

- **Skalen-Migration der Bestandscharts bewusst zurückgestellt** — `pmc/power/
  training/wellness.js` rechnen ihr x indexbasiert (`pad.l + (i / (n-1)) * cw`
  bzw. slotbasiert), nicht als Zeitachse. Eine Umstellung auf die in Phase 5
  eingeführte kontinuierliche `makeDateScale()` würde Tage ohne Daten als
  Lücken sichtbar machen, wo die Achse sie heute zusammenschiebt — bei
  Athlet 2 (dünne Datenlage) eine optische Regression an öffentlich
  sichtbarer Stelle. Expliziter Nicht-Zielpunkt von Phase 5, nicht Teil des
  [HA]-Vereinheitlichungsschritts (der bleibt auf Datumsformate/Kategorien
  beschränkt). Voraussetzung für Cursor-Sync über den Explorer hinaus.
  → `docs/phase-5-konzept-explorer.md` §1.2/§8, X4.
- **Rückrichtung Fahrtenbuch-Klick → Chart-Crosshair (Schritt 2) nicht
  gebaut** — nur Chart→Fahrtenbuch/Planungstab war Auftragsumfang. Kein
  vernachlässigbarer Zusatzaufwand: eine Zeile in `state/chart-view.js`
  reicht NICHT, weil "eine Zeile anklicken und dauerhaft im Chart markiert
  lassen" semantisch ein **Klick-Pin**, kein Hover ist — genau das Feld
  `selected` aus der ursprünglichen Zustandsskizze (§2.1), das in Schritt 0
  bewusst noch nicht angelegt wurde. Voraussetzung wäre also ein neuer
  State-Slot plus die Frage, wie sich `selected` zu `hovered` verhält
  (welches gewinnt visuell), nicht nur ein zusätzlicher Funktionsaufruf.
  → `docs/phase-5-konzept-explorer.md` §2.1, §3.
- **Vergleichsmodus (Schritt 4) vergleicht nur CTL**, nicht ATL/TSB — bewusste
  Scope-Begrenzung, analog zur Szenario-Zweitserie (Schritt 3), die ebenfalls
  nur CTL überlagert. Eine spätere Erweiterung auf ATL/TSB bräuchte eine
  eigene Entscheidung, wie zwei zusätzliche Serienpaare (4 Kurven auf einer
  Achse) ohne Überladung darstellbar sind.
- **`compareSlots` in `state/chart-view.js` ist ein eigenständiges Feld,
  keine Verallgemeinerung von `ws`/`we` auf eine Liste** — das Konzept (§7.1)
  hatte den Zeitraumzustand ab Schritt 0 als Liste vorausgesehen, tatsächlich
  blieb der Hauptbrush ein Einzelwert. Nutzerentscheidung: additiv statt
  Umbau, geringeres Risiko für Schritt 0–3. Falls ein künftiger Baustein
  einen dritten unabhängigen Zeitraum bräuchte, wäre das wieder eine
  Einzelfall-Erweiterung, kein automatischer Fall für die bestehende Form.
- **Schritt 5 modernisierte in `power.js` bewusst NUR `renderPowerCurve()`
  (Familie 4)** — `renderEfficiency()` (Familie 2, lückige Zeitreihe),
  `renderScatter()` und `renderSmallMultiples()` (Familie 5, Small
  Multiples) blieben unangetastet, obwohl sie in derselben Datei stehen. Der
  Schritt-5-Auftrag beschrieb ausschließlich die Power-Curve, ohne die drei
  anderen Charts zu erwähnen (auch nicht als expliziten Ausschluss) —
  Nutzerentscheidung (Rückfrage vor der Umsetzung): Scope bleibt auf die
  Power-Curve begrenzt. Brauchen bei Bedarf eigene Schritte (5b/5c oder als
  Teil von Schritt 6/7), jeweils nach ihrer eigenen Familie aus
  `docs/chart-grundlagen.md` §7.2. → `docs/phase-5-konzept-explorer.md` §2.4.
- **Schritt 6 modernisierte in `training.js` bewusst NUR `renderWeeklyVolume()`
  und `renderWeatherWeekly()`** (Familie 3) — exakt die beiden Charts, die
  `docs/phase-5-konzept-explorer.md` §2.4 wörtlich als „Wochenvolumen/Wetter
  = Familie 3" nennt. `renderTrimp()` (Belastungswächter) ist strukturell
  derselben Familie sehr ähnlich (wochenweise Balken + Ramp-Linie auf
  zweiter Achse), wurde aber vom Auftrag nicht namentlich genannt — Scope
  bewusst nicht ausgeweitet (Rückfrage vor der Umsetzung, analog zu
  Schritt 5). `renderConsistency()` gehört laut Familientabelle zu
  Familie 6 (Kalender/Matrix), nicht 3. `renderZoneWeekly()` bleibt
  mehrdeutig zwischen Familie 3 (x-Achse = Wochen-Buckets) und der in
  `docs/chart-grundlagen.md` §7.2 genannten Familie-4-Ausnahme
  „Zonenverteilung" (dort ist unklar, ob das dieselbe oder eine andere,
  rein kategoriale Zonenansicht meint) — braucht bei Bedarf eine eigene
  Klärung, kein automatischer Fall für Familie 3.
- **Schritt 6: Monats-Periode nicht an der bucketweisen Fadenkreuz-Kopplung/
  dem Brush-Klick beteiligt** — `renderWeeklyVolume()`/`renderWeatherWeekly()`
  haben einen Wochen-/Monats-Toggle, dessen Monats-Bucket-Schlüssel sich
  zwischen beiden Charts unterscheiden (`renderWeeklyVolume` über
  `monthlyFromRides()` ein bereits lokalisierter Anzeige-String, z.B.
  „Jul '26"; `renderWeatherWeekly` dagegen der rohe `"YYYY-MM"`-Schlüssel,
  von `app.js` vor dem Aufruf gesetzt). `core/chart-buckets.js` unterstützt
  deshalb nur die Wochen-Periode; bei aktivem Monats-Toggle bleibt die
  Optik modernisiert, aber ohne Hervorhebung/Brush-Klick. Eine spätere
  Vereinheitlichung bräuchte zunächst eine gemeinsame Monats-Bucket-
  Konvention für beide Charts.
- **Schritt 7 modernisierte in `wellness.js` ALLE 5 Render-Funktionen**
  (Familie 2) — anders als Schritt 5/6 gab es hier keine Zurückstellung:
  die Scope-Rückfrage vor der Umsetzung ergab, dass `renderSleep`,
  `renderPlanCompareHRV`/`RHF` (→ `renderHrvRhfChart`), `renderEnergy` und
  `renderHydration` durchgängig Familie 2 sind, keine Familie 3/6-Kandidaten
  in der Datei.
- **Schritt 7: PMC-Brush-Fenster (`ws`/`we`) bewusst NICHT übernommen** —
  `docs/chart-grundlagen.md` §7.2 listet Familie 2 mit „Brush: ✅ Fläche"
  (voller Windowing wie PMC), `wellness.js` bekam aber nur die
  Fadenkreuz-Kopplung, keine Fensterung auf `ws`/`we` (analog zu Familie 3
  in Schritt 6, die ebenfalls nicht am Fenster teilnimmt). Grund:
  `renderPlanCompareHRV`/`RHF` vergleicht bewusst Plan 1 GANZ gegen Plan 2
  GANZ (Methodenwechsel RMSSD→SDNN) — ein 90-Tage-Default-Fenster würde
  genau diesen Vergleich im Normalfall verdecken. Eine spätere volle
  Familie-2-Teilnahme (Windowing) bräuchte eine eigene Entscheidung, wie der
  Plan-Vergleich davon ausgenommen bliebe.
- **Schritt 7: rechte Sekundärachsen behalten die alte Tick-Zahlenreihe**
  (Schlaf-HF in `renderSleep`, Gewichts-kg-Skala in `renderEnergy`) statt auf
  `axisUnit()`/Direktbeschriftung umgestellt zu werden — nur die jeweils
  primäre (linke) Achse wurde nach der Familie-2-Konvention konvertiert
  (`gradedGrid`/`axisUnit`, plus `haloLabel`/`flattestIndex` für die
  Hauptserie im HRV/Ruhepuls-Chart). Eine konsistente Umstellung auch der
  Sekundärachsen wäre ein eigener, kleiner Nachzugsschritt.
- **Schritt 7: `renderSleep`-Breite wächst jetzt mit dem dichten
  Tagesgerüst statt der kompakten Anzahl gemessener Nächte** — bei
  sporadischer Schlafaufzeichnung (z.B. Athlet 2, Apple-Health-Import mit
  Lücken) kann der Chart entsprechend breit und mit sichtbaren Leerräumen
  werden. Das ist die beabsichtigte Konsequenz aus dem dichten Tagesgerüst
  (§5) und wurde gegen `training-dashboard-dev` für beide Athleten
  Playwright-verifiziert (Athlet 2 zeigt eine mehrtägige Lücke Anfang
  Februar korrekt als Leerstelle) — als bekannte Eigenheit hier vermerkt,
  falls die Breite bei künftig noch lückenhafteren Daten unhandlich wird.

### Bugfix-Nachtrag zu Schritt 7 (nach erster Live-Sichtung)

- **Sync-Pipeline: `ride.hrv`/`ride.ruhepuls` und `Data.wellness[].hrv`/
  `.restingHR` weichen an einzelnen Tagen voneinander ab, obwohl beide laut
  Code aus demselben `wellness[date].hrvSDNN`/`.restingHR` stammen
  sollten** — bestätigt direkt in `data/rides.json` für Athlet 1: am
  12.06.2026 trägt der Ride `hrv: 73`, der Wellness-Eintrag desselben
  Datums `hrv: 45` (6 von 25 Tagen mit Wert in beiden Quellen weichen so
  ab, nicht nur Rundungsdifferenzen). `scripts/lib/map-activity.js::
  wellnessFields()` und `scripts/lib/wellness.js::WELLNESS_FIELDS` lesen
  strukturell identisch `w.hrvSDNN`/`w.restingHR` aus demselben
  `wellness`-Objekt eines Sync-Laufs.
  **Aktualisierung (30.07.2026):** Die im ursprünglichen Verdacht genannte
  Ursache („`ride.hrv` beim Erst-Sync eingebettet, bei späteren Läufen nicht
  aufgefrischt") passt nicht zum heutigen `scripts/generate-data.js`: der
  `wellness`-Aufruf ([Zeile 103](../scripts/generate-data.js#L103)) läuft
  genau EINMAL pro Sync-Lauf, `mapActivity()` (Z.131, → `ride.hrv`) und
  `mapWellnessList()` (Z.141, → `Data.wellness[].hrv`) lesen danach
  dieselbe Objekt-Referenz — kein Merge mit einem alten `rides.json`, jeder
  Lauf regeneriert `rides[]` komplett neu. Beide Werte MÜSSTEN sich bei
  einem frischen vollständigen Sync-Lauf also decken.
  Alle 6 betroffenen Tage liegen exakt im Übergangsfenster 12.–20.06.2026
  (Beginn Plan 2 / `ftpMeasuredDate: "2026-06-12"`, HRV-Methodenwechsel
  RMSSD→SDNN) — `ride.hrv` zeigt dort durchgängig RMSSD-typische Werte
  (73/82/107/72/95/95), `Data.wellness[].hrv` durchgängig SDNN-typische
  (45/53/57/45/47/50). Das spricht dafür, dass die aktuell committete
  `data/rides.json` ein Snapshot aus einem Lauf VOR der Konsolidierung
  auf die gemeinsame `wellnessFields()`-Funktion ist, nicht ein bis heute
  reproduzierbarer Bug.
  **Nicht abschließend verifizierbar in dieser Runde:** lokales `.env` hat
  kein `INTERVALS_API_KEY`/`INTERVALS_ATHLETE_ID` (identische Lücke wie
  M3 oben) — ein lokaler `npm run sync` überspringt Plan 2 komplett und
  hätte `data/rides.json` sonst auf einen reinen Plan-1-Teilbestand
  zurückgesetzt (passiert, sofort per `git checkout` rückgängig gemacht,
  nichts committet). **Nächster Schritt:** nach dem nächsten Sync mit
  echten intervals.icu-Credentials (z. B. regulärer 6h-Cronlauf oder
  manueller `workflow_dispatch`) `data/rides.json` für die 6 genannten
  Tage gegenprüfen — bei Konvergenz war es das, sonst weitere Recherche
  in `scripts/lib/intervals.js` (evtl. liefert die Wellness-API
  unterschiedliche Werte je nach Query-Zeitraum).
- **Deshalb bewusst kein reiner Wechsel auf `Data.wellness` für HRV/
  Ruhepuls (Eigenplan-Athlet), sondern ein Merge** (`_mergedOwnPlanSeries()`
  in `wellness.js`: wellness-Wert bevorzugt, ride-Wert als Fallback) — ein
  reiner Wechsel hätte zusätzlich die komplette Plan-1-Ära (vor Mitte Juni)
  gelöscht, da `Data.wellness` dafür gar keine HRV/Ruhepuls-Werte trägt.
  Der Merge löst NICHT die obige Werte-Diskrepanz auf (zeigt an den 6
  betroffenen Tagen konsequent den Wellness-Wert), verschiebt sie nur
  sichtbar auf die Sync-Pipeline statt sie im Chart zu verstecken.
- **`PLAN2_SCHEDULE`/`getPlan2WeekPhase()` leben jetzt in `assets/js/core/
  plan2-schedule.js`**, `scripts/lib/plan2.js` re-exportiert von dort
  (Präzedenzfall: `core/planning.js::effectiveSessions`, bereits von
  `scripts/lib/map-activity.js` importiert). Reiner, verhaltensgleicher
  Umzug — `PLANNED_SESSIONS`/`getPlan2Blocks()` unverändert.

### Nachtrag: Umbau „Plan 1/2 → Kalenderwoche" (29.07.2026)

Die obige Schritt-7-Begründung, warum `wellness.js` das PMC-Brush-Fenster
NICHT übernimmt („`renderPlanCompareHRV`/`RHF` vergleicht bewusst Plan 1
GANZ gegen Plan 2 GANZ"), ist mit diesem Umbau in der genannten Form
überholt — es gibt keine Plan-1/2-Segmentierung mehr. Die Entscheidung
selbst (volle Historie zeigen, nicht auf 90 Tage windowen) bleibt aber
gültig, jetzt mit anderer Begründung: der HRV-Methodenwechsel-Marker
(RMSSD → SDNN) soll weiterhin nicht durch ein Default-Fenster verdeckt
werden. `renderPlanCompareHRV`/`RHF` heißen jetzt `renderHrvTrend`/
`renderRhfTrend`. Details: Commits `398da65`/`bb210e5`/`ce49e24`/`4458a3f`.

## Infrastruktur/CI

## Erledigt (Kurzform — Details in Commit-Messages/Konzeptdokumenten)

- **Roadmap-Versionierung**: Fahrplan-Datei liegt jetzt in `docs/`, lag vorher
  nur lokal in Downloads/.
- **`state/events.js` filterte mit der internen Athleten-ID gegen eine
  uuid-Spalte** (400 bei jedem Render) → `resolveAthleteProfileId()`. Test:
  `tests/events-athlete-resolution.test.js`.
- **K-EVENT feuerte nie** (`priority`-Skalen-Mismatch main/secondary statt
  A/B) → Commit `f09481d`.
- **`ui/planned.js` berechnete „heute" in UTC statt lokal** → `localISODate()`.
  Commit `d3e6996`.
- **Kartentausch**: Wahoo-Push-Duplikate, falsche Fahrtenbuch-Zuordnung,
  fehlende Ausrollen-Erkennung → Commit `626110b`.
- **Ultra-Review vor erstem proposals-Commit**: Athleten-Banner als
  Entscheidungs-Einstieg ergänzt, `target_updated_at`-Veraltet-Prüfung,
  `acceptGroup`-Teilerfolg-Anzeige, `Planned.onAdjustmentChange`-Refresh,
  `requestId`-Schutz, payload-CHECK-Constraint, move-Vorschau-Reaktivierung
  — alle unit-getestet.
- **Migration 0006 gegen `dashboard-dev` verifiziert** (Spalten, RLS für
  Trainer/Athlet, `trainer_view_prefs`, payload-CHECK-Constraint nach
  Nachbesserung) — Testzeilen wieder gelöscht.
- **Move/Ausfallen ignorierte den Direkt/Vorschlag-Umschalter** (Formulare/Drag
  & Drop in `ui/planned.js` schrieben immer direkt) → `createTrainerProposal()`-
  Pfad ergänzt (`core/proposal-payload.js`).
- **Drag-Grip im Vorschlag-Modus ignorierte den Umschalter** — Race zwischen
  zwei `onSessionChange`-Abos; behoben durch Umstieg auf
  `state/trainer-view.js::onTrainerViewChange` (feuert erst nach
  `loadTrainerContext()`). Lehrstück für Timing-Bugs, s. `CLAUDE.md`
  (Playwright-MCP-Konvention).
- **Drag & Drop fror nach dem ersten Drop ein** — `endDrag()` mit try/finally
  gehärtet (Commit `85c7c4e`), unter realen Bedingungen nicht mehr
  reproduzierbar, von Alex manuell bestätigt.
- **Trainer-Leiste/Athleten-Banner verschwanden nach F5** — beide abonnieren
  jetzt `onSessionChange` selbst statt sich auf `app.js`-Init-Reihenfolge zu
  verlassen.
- **Trainer-Leiste erschien fälschlich beim Athleten selbst** — `_draw()`
  prüfte `trainerContext.isTrainer` nicht bei jedem Aufruf (nur der
  aufrufende `render()`), ein `onProposalsChange`-Listener umging das Gate.
  Behoben, keine RLS-Umgehung (Schreibpfade prüften unabhängig).
- **Export/Import-Workflow**: gegen `dashboard-dev` durchgespielt
  (Export-Briefing, Claude-Import mit Teilerfolg/Fehleranzeige);
  Datumswiderspruch im Briefing (`asOf` vs. `today`) behoben, Regressionstest
  `tests/export-briefing.test.js`.
- **wellbeing_public/wellbeing_shared — kein Frontend-Konsument** →
  `getSharedRange()` + `ui/wellbeing-card.js`. Commit `73f1190`.
- **`upsertToday`-Unit-Test fehlt** → Fake-Supabase-Client-Seam
  (`tests/helpers/fake-supabase-client.js`). Commits `73f1190`/`0afe075`.
- **Schlafscore-Pull aus intervals.icu** (Datenerfassung) →
  `scripts/lib/wellness.js`. Commit `c8c7975`.
- **Dualität: weekreview/adherence/ftp-progress + Hero/Analyse lasen die alte
  JSON-Pipeline** → alle 5 Aufrufstellen auf `plan_cards` umgestellt. Commit
  `a549249`, live mit echtem Login gegenbestätigt (Nachtrag `9a7e06b`).
- **`tests/supabase-rls.test.js` gegen `dashboard-dev`**: `wellbeing_shared`-
  Toggle-Regression, `proposals`-Zugriff (Trainer/Athlet, RLS statt nur
  App-Gate geprüft), `trainer_view_prefs` nur für den zugehörigen Trainer.
  Accounts Stuhlsen/Trainer-ST (einzige real verknüpfte Coach-Beziehung in
  dashboard-dev — die ursprünglich angenommenen generischen "athlet-test"/
  "trainer-test"-Accounts existieren so nicht). Selbst-korrigiert: ein
  Insert-Test nutzte anfangs die eigene Trainer-ID als "fremde" athlete_id,
  was die Policy trivial erfüllt (OR-Klausel `athlete_id = auth.uid()`) und
  kurzzeitig eine echte Zeile anlegte — gefunden, gelöscht, Test korrigiert.
  10/10 Assertions grün, kein Rest in dashboard-dev. Commit `cb39c59`.
- **Trainer-Flow Ende-zu-Ende per Playwright gegen `dashboard-dev`**
  (Accounts Stuhlsen/Trainer-ST): Kategorien-Toggle inkl. DB-Persistenz über
  Reload, Vorschlag anlegen (Trainer, Vorschlag-Modus respektiert), Liste,
  Vergleichsansicht (read-only für Trainer, interaktiv für Athlet), Annehmen
  → echte `plan_cards`-Änderung sichtbar ohne Reload. Reine Verifikation,
  kein Bug, kein Commit nötig.
- **Nach-Drop-Feedback per Playwright gegen `dashboard-dev` verifiziert**:
  echte mehrstufige Pointer-Event-Geste (down→move×n→up, kein Ein-Schritt-
  Kurzschluss), Delta-Banner mit korrektem TSB-vor/-nach-Inhalt am Eventtag, K-EVENT
  bestätigt aktiv (Fix aus Block A hält), "Verschoben von …"-Badge mit
  Rückgängig. Dabei einen neuen Bug gefunden (`undoAdjustment()` recomputet
  week/phase nicht) — bewusst nicht gefixt, s. Drag-&-Drop-Einschränkungen
  oben. Kein Commit (reine Verifikation + manuelle DB-Korrektur des
  Testartefakts).
- **Git-Vorfall (25.07.2026): `git sync`-Alias hätte `origin/main` um ~70
  Commits zurückgesetzt** — versehentlich von `dashboard-2.0` aus gestartet,
  während lokales `main` seit der Branch-Einführung nie aktualisiert worden
  war; der Alias pusht die lokale `main`-Referenz unabhängig vom
  ausgecheckten Branch. Sofort erkannt und `origin/main` wiederhergestellt
  (keine Daten verloren), lokales `main` auf `origin/main` zurückgesetzt +
  Upstream-Tracking gesetzt. Alias um Branch-Guard + gepinnten
  `--force-with-lease=main:<SHA>`-Erwartungswert ergänzt (lebt in der
  lokalen gitconfig, nicht im Repo). Dokumentiert in AGENTS.md „Git-
  Workflow". Commit `00b3efe`.
- **`sync-data.yml` läuft per Cron nur auf `main`** (GitHub wertet
  `on.schedule` ausschließlich aus dem Default-Branch aus, ein zweites Cron
  auf `dashboard-2.0` feuert nie) — Entscheidung: kein Automatismus während
  der aktiven Entwicklungsphase, stattdessen bei Bedarf manuell per
  `workflow_dispatch` auf `dashboard-2.0` auslösbar. Dafür zwei Fixes
  vorgezogen: `deploy`-Job jetzt `if: github.ref_name == 'main'` (sonst
  würde ein Dispatch auf `dashboard-2.0` den Dev-Stand live auf Pages
  deployen), „Commit data if changed" nutzt `$GITHUB_REF_NAME` statt
  hartkodiertem `origin/main`. Commit folgt.
- **`planAdherence()`s „verpasst"-Titel zeigte immer „Einheit"** — las
  `.title`, alte wie neue Sessions tragen aber nur `.name` → Fallback jetzt
  `s.title || s.name || "Einheit"`. Regressionstest in
  `tests/analysis-core.test.js`.
- **`undoAdjustment()` recomputete week/phase nach "Rückgängig" nicht neu**
  (per Playwright am 25.07.2026 entdeckt) → jetzt derselbe
  `weekLabelForDate()`-Aufruf wie in `movePlanCard()`. Regressionstest in
  `tests/plan-cards-move.test.js`.
- **Umbau „Plan 1/2 → Kalenderwoche" (29.07.2026)**: Athlet 1 lief bisher auf
  einer plan-gebundenen Wochenstruktur (P2-W0…P2-W12), Athlet 2 bereits auf
  ISO-Kalenderwochen — Migrations-Artefakt aus dem Notion→intervals.icu-
  Umstieg, kein fachliches Konzept mehr. Vier Commits: (A) `Data.weekly()`/
  Belastungswächter/Bucket-Helfer einheitlich auf `isoWeekKey()`,
  `PLAN2_SCHEDULE`-Wochen auf echte Kalenderwochen-Strings, Backfill-Migration
  `0007_plan_cards_calendar_week.sql` für bereits migrierte `plan_cards`-Zeilen
  (dev; manuell einzuspielen, dann für prod wiederholen). (B) Plan-1/2-
  Divider/-Farben aus den Charts entfernt, dabei ein bislang nicht erfasstes
  Feature gefunden und mit entfernt: Plan-Filter-Toggle + eigene Plan-1-vs-
  Plan-2-Vergleichstabelle im Analyse-Tab (der generische PMC-Vergleichsmodus
  deckt dieselbe Funktion bereits ab). (C) `ride.plan` → `ride.dataSource`
  ("notion"|"intervals"); HRV/Ruhepuls-Chart umgebaut auf durchgehende
  Kalenderwochen-Linie mit schlankem `hrvMethod`-Flag statt Plan-Segmentierung
  (Methodenwechsel RMSSD→SDNN bleibt als Marker + getrennte Mittelwerte/
  Trendlinien sichtbar). (D) Vergleichsmodus war bereits generisch ("Zeitraum
  A/B", `core/compare.js`), nur zwei Kommentare nachgezogen. Block-/
  Phasenstruktur (Sweet Spot/Schwelle/VO2max/Taper) und Notion-Ära-Historie
  (Wochenlabels „W1"…, HRV-Rohwerte) bewusst unverändert. Commits `398da65`/
  `bb210e5`/`ce49e24`/`4458a3f`. Browser-Verifikation (Playwright, beide
  Athleten, alle Tabs) nach jedem Commit, keine neuen Konsolenfehler.
