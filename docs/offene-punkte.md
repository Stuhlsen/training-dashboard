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

## Phase 4 — Trainer-Dashboard & Export/Import

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
- **Schritt 5 modernisierte in `power.js` zunächst bewusst NUR
  `renderPowerCurve()` (Familie 4)** — `renderEfficiency()`/`renderScatter()`/
  `renderSmallMultiples()` blieben damals unangetastet (Nutzerentscheidung,
  Rückfrage vor der Umsetzung). Inzwischen als eigener Nachzug nachgeholt,
  s. „Erledigt".
- **Schritt 6 modernisierte in `training.js` bewusst NUR `renderWeeklyVolume()`
  und `renderWeatherWeekly()`** (Familie 3) — exakt die beiden Charts, die
  `docs/phase-5-konzept-explorer.md` §2.4 wörtlich als „Wochenvolumen/Wetter
  = Familie 3" nennt. `renderTrimp()` (Belastungswächter) ist strukturell
  derselben Familie sehr ähnlich (wochenweise Balken + Ramp-Linie auf
  zweiter Achse), wurde aber vom Auftrag nicht namentlich genannt — Scope
  bewusst nicht ausgeweitet (Rückfrage vor der Umsetzung, analog zu
  Schritt 5). Fadenkreuz/Brush-Nachzug für `renderTrimp()` inzwischen
  nachgeholt (Commit `cb24dfc`, s. „Erledigt"). `renderConsistency()`
  gehört laut Familientabelle zu Familie 6 (Kalender/Matrix), nicht 3.
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
- **`requestId`/`openToken`-Race-Guard extrahiert** — war nicht 4×, sondern
  9× dupliziert (zusätzlich state/plan-cards.js, state/proposals.js,
  state/trainer-view.js, ui/import-dialog.js, ui/plan-card-dialog.js). Neue
  `core/request-guard.js::createRequestGuard()`, alle Race-Tests weiterhin
  grün, Playwright-verifiziert (Commit `5af4fcb`).
- **Glass-Input-Style aus 3 Dateien extrahiert** — `.glass-input/-select/
  -textarea` teilen sich dieselbe Regel wie `.planned-card-dialog-*`
  (Commit `ae59f52`).
- **`addDaysISO()`-Nachzug** in `core/pmc.js::tsbTrend`/`core/adherence.js`/
  `core/consistency.js` — eigene `isoLocal()`-Kopien entfernt (Commit `a1c3c07`).
- **Dedup-Erkennung für doppelten Claude-Import** —
  `isDuplicateOpenProposal()` vergleicht op/target_card_id/payload
  strukturell (ordnungsunabhängig) gegen bereits offene Claude-Vorschläge,
  läuft über den bestehenden `errors[]`-Mechanismus (Commit `8c75487`).
- **CTL/ATL-Verlauf-Kachel bekommt eine Sparkline** (`ui/trainer-bar.js::
  ctlAtlTile`) — reine Funktion, in Node gegen mehrere Fälle geprüft (kein
  Playwright-Login gegen dashboard-dev, da echte Trainer-Zugangsdaten sonst
  im Tool-Transkript sichtbar geworden wären). **Noch nicht im echten
  Browser bestätigt** — bitte bei Gelegenheit kurz gegenprüfen (Commit
  `1814837`).
- **„withdrawn"-Status bekommt einen UI-Pfad** — `withdrawProposal()`
  (derselbe `decideProposal`-Adapter wie accept/reject), Button zeigt
  „Zurückziehen" statt „Aktuelle behalten" bei eigenen (`source: "claude"`)
  Vorschlägen (Commit `500eee5`).
- **Schritt-5-Nachzug: `renderEfficiency`/`renderScatter`/
  `renderSmallMultiples` voll modernisiert** — jeweils nach eigener Familie
  (2/4/5), `paintDayHover()` von `wellness.js` nach `ui/charts/base.js`
  geteilt, tote Plan-1/2-Divider-Logik in `renderSmallMultiples` entfernt
  (Commits `4e4d30f`/`13387f1`).
- **Rückrichtung Fahrtenbuch-Klick → PMC-Chart-Crosshair (Pin)** — neuer
  State-Slot `selectedDate` (getrennt von `hoveredDate`, Hover gewinnt
  visuell), Zeilen-Klick pinnt/entpinnt, Gold-Linie statt gestrichelter
  Hover-Linie. Scope bewusst auf den PMC-Chart begrenzt. Playwright-
  verifiziert (Commit `19dd5d4`).
- **`renderTrimp()` Fadenkreuz/Brush-Nachzug** (Familie 3, wie
  renderWeeklyVolume/renderWeatherWeekly) — Commit `cb24dfc`.
- **Monats-Bucket-Vereinheitlichung + echter Wetter-Monatsbug** —
  `renderWeatherWeekly()` gruppierte im Monats-Modus bislang IMMER nach
  echter ISO-Kalenderwoche (hartkodiert), der Monats-Toggle änderte nur den
  Achsentitel, nie die tatsächliche Gruppierung — kein reines
  Konventions-Problem wie ursprünglich hier vermutet, sondern ein echter
  Bug (auf Rückfrage mitgefixt). `monthlyFromRides()` liefert jetzt den
  rohen `"YYYY-MM"`-Schlüssel, `core/chart-buckets.js` unterstützt beide
  Perioden, Fadenkreuz + Brush-Klick funktionieren jetzt auch im
  Monats-Modus (Commit `567a5de`).
- **Sekundärachsen (`renderSleep`/`renderEnergy`) auf Direktbeschriftung
  umgestellt** — `haloLabel`/`flattestIndex` statt manueller Tick-Zahlenreihe,
  wie schon bei der primären Achse (Commit `4b077c4`).
- **`renderZoneWeekly()` Familie-3-Zuordnung geklärt** — `wk.week` kommt aus
  `weeklyZoneShares(rides, isoWeekKey)`, strukturell derselbe Bucket wie
  `renderWeeklyVolume`/`renderWeatherWeekly` → Fadenkreuz-Kopplung +
  Brush-Klick nachgezogen (Commit `2857dda`).
- **K3 Typ-Default-TSS-Review** — auf Alex' Wunsch vorgezogen (Plan 2 läuft
  noch bis 19.09.2026), gut belegte Typen (n≥5) aktualisiert, dünne Typen
  bleiben ehrlich dünn (Commit `710a43b`).
- **K-RAMPE verglich nur Plan-vs-Plan, kein Ist-Seed** — `detectConflicts()`
  bekommt jetzt optional `actuals`, `lastRiddenWeekTss()` seedet die letzte
  gefahrene Woche als Vorwert für die erste volle Planwoche (Commit `d3a82b3`).
- **Push-Warnung/Konflikt-Badges fehlten in der „Verpasst"-Sektion** —
  `_renderCardBadges()` wird jetzt auch dort aufgerufen (Commit `9989ca4`).
- **`planAdherence()`s „verpasst"-Titel zeigte immer „Einheit"** — las
  `.title`, alte wie neue Sessions tragen aber nur `.name` → Fallback jetzt
  `s.title || s.name || "Einheit"`. Regressionstest in
  `tests/analysis-core.test.js`.
- **`undoAdjustment()` recomputete week/phase nach "Rückgängig" nicht neu**
  (per Playwright am 25.07.2026 entdeckt) → jetzt derselbe
  `weekLabelForDate()`-Aufruf wie in `movePlanCard()`. Regressionstest in
  `tests/plan-cards-move.test.js`.
- **`ui/event-timeline.js`: Inline-Styles + dupliziertes `upcoming`-Filter** —
  `.event-badge`/`.event-timeline-*`-Klassen in `components.css`,
  `isUpcomingEvent()` jetzt geteilt mit `nextRaceEvent()` in
  `state/events.js` (Commit `0e2fe34`).
- **`rpeFeelCoverage()` duplizierte das `WELLNESS_FIELDS`-Zählmuster** —
  geteilte `countFieldCoverage()` in neuem `scripts/lib/coverage.js`,
  Logging-Ton je Aufrufstelle bewusst unterschiedlich belassen
  (Commit `463b0f3`).
- **"Multiple GoTrueClient instances"-Konsolenwarnung** — `getAuthedClient()`
  baute pro authentifiziertem Request (8 Aufrufstellen) einen neuen Client;
  wird jetzt gecacht und nur bei geändertem `access_token` (Login/Refresh/
  Logout) neu gebaut. `client.js` selbst bleibt wie schon dokumentiert
  außerhalb der node:test-Reichweite (esm.sh-URL-Import) — Verifikation über
  `node -c` + Codelesen, ein Login-Playwright-Check hätte echte Zugangsdaten
  im Tool-Transkript sichtbar gemacht (wie beim CTL/ATL-Sparkline-Punkt oben).
  **Noch nicht im echten Browser bestätigt** — bitte bei Gelegenheit die
  Konsole nach einem Login kurz gegenprüfen.
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
