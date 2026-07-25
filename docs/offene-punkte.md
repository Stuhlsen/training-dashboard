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
- **`planAdherence()`s „verpasst"-Titel zeigt immer „Einheit"** — liest
  `.title`, alte wie neue Sessions tragen nur `.name`. Vorbestehende Lücke,
  nicht durch die `plan_cards`-Migration verursacht.
- **Drag & Drop, bewusste v1-Einschränkungen:** kein Tastatur-Verschieben
  (A11y-Fallback über `.planned-move-form` existiert bereits); keine
  Umsortierung innerhalb eines Tages (`sort_order` wird nach dem Anlegen nie
  neu vergeben); Karte auf einen komplett leeren Wochenblock behält ihr altes
  `week`-Label. → §4/§7 im Konzept.
- **NEU (25.07.2026, per Playwright bei der Nach-Drop-Feedback-Verifikation
  entdeckt): `undoAdjustment()` (`state/plan-cards.js`) restauriert bei
  einer verschobenen Karte nur `plannedDate`, ruft aber `weekLabelForDate()`
  nicht erneut auf** — die Karte behält nach "Rückgängig" das week/phase-
  Label ihrer zuletzt gezogenen Zielwoche, auch wenn die ursprüngliche
  Woche nicht leer ist (also unabhängig von der oben genannten, bereits
  bekannten Einschränkung). Sichtbar als Karte unter der falschen Wochen-
  überschrift trotz korrektem Datum. Für den Playwright-Testlauf manuell per
  direktem `data-access`-Patch nachkorrigiert, kein Code-Fix in diesem
  Durchgang (Scope-Ausschluss "Drag & Drop … Labels").
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
