# Fahrplan: Trainingsdashboard 2.0

> **Ziel:** Ausbau des statischen Dashboards zu einer interaktiven Mehrbenutzer-App mit Login, editierbarem Trainingsplan, Trainer-Rolle (Mensch oder Claude) und Besucher-Feedback.
>
> **Architektur-Grundsatz:** Lesedaten (Metriken aus intervals.icu / Apple Health / Amazfit) bleiben in der bestehenden GitHub-Actions-Pipeline (`data/*.json`). Alle **Schreibdaten** (Ziele, Events, Befinden, Trainingskarten, Vorschläge, Feedback) wandern nach **Supabase** (Free Tier, Zugriff via CDN-Script, RLS für Rechte).
>
> **Getroffene Entscheidungen:**
> - Backend: Supabase (Free Tier, Kosten = 0 €)
> - Login: Echte Accounts mit E-Mail + Passwort, Modal (kein Router)
> - Claude als Trainer: **kein** API-Aufruf aus der App — stattdessen Export/Import-Workflow
> - Jeder Athlet hat seinen **eigenen** Trainer
> - Athleten-Toggle bleibt auch eingeloggt frei (Portfolio-Charakter)
> - Trainer-Settings: nur Display-Name änderbar
> - Schichtenarchitektur: `core/` → `data-access/` → `state/` → `ui/`
> - Dev/Prod-Trennung: Branch `dashboard-2.0` + zwei Supabase-Projekte
> - Supabase-CDN: `https://esm.sh/@supabase/supabase-js@2`
>
> **Arbeitsweise:** Jede Phase = eigenes Konzept (+ Mockup, wo markiert). Checkboxen abhaken, wenn erledigt. Modell-Empfehlung pro Schritt in `[Klammern]`.

---

## Modell-Empfehlung (Legende)

| Kürzel | Modell | Wofür |
|---|---|---|
| **[F5]** | Claude Fable 5 | Architektur-Entscheidungen, Sicherheitskonzepte (RLS!), komplexes Debugging |
| **[OP]** | Claude Opus 5 | Große Refactorings, anspruchsvolle UI-Logik (Drag & Drop, State-Sync) |
| **[SO]** | Claude Sonnet 5 | Das Arbeitspferd: normale Implementierung in Claude Code, Mockups, CRUD-Features |
| **[HA]** | Claude Haiku 4.5 | Kleinkram: Texte, Umbenennungen, Commit-Messages, simple Fixes |

> Fable 5 sitzt über Opus in Anthropics Mythos-Tier. Es läuft mit Safeguards, die
> einzelne Anfragen an Opus 5 umleiten — laut Anthropic im Schnitt unter 5 % der
> Sitzungen.

---

## Phase 0 — Architektur & Datenmodell ✅

- [x] Rollenmatrix: Athlet / Trainer / Besucher → `docs/phase-0-architektur-datenmodell.md`
- [x] Supabase-Schema: `goals`, `events`, `wellbeing`, `plan_cards`, `proposals`, `feedback`, `profiles`
- [x] RLS-Policies + GRANTs → `supabase/migrations/0001_initial_schema.sql` + `0002_grants.sql`
- [x] Lese- vs. Schreibdaten-Abgrenzung festgeschrieben
- [x] Schichtenarchitektur: neue `data-access/`-Schicht → `docs/phase-0-schichtenarchitektur.md`
- [x] AGENTS.md erweitert (data-access/, Branch-Modell, Dev/Prod-Konventionen)
- [x] Supabase-dev-Projekt `training-dashboard-dev` angelegt, Migration eingespielt, Prüfliste durchlaufen

**Entscheidungen Phase 0:**
- E1: goals/events/plan_cards öffentlich lesbar ✅
- E2: wellbeing_public-Toggle pro Athlet im Profil (Slider öffentlich, note nie) ✅
- E3: Feedback-Moderation via is_admin-Flag (anfangs nur Stuhlsen) ✅

---

## Phase 1 — Auth & Athleten-Menü ✅

- [x] Konzept: Login-Flow, Session-Handling, Logout → `docs/phase-1-konzept-auth.md`
- [x] Konzept: Einstellungsmenü (Ziele, Profil, Datenquellen-Status)
- [x] Mockup im Konzept-5-Look (dark theme, #0b0e13, Akzent #e08a3c)
- [x] Umsetzung: `client.js`, `auth.js`, `profiles.js`, `goals.js` in `data-access/supabase/`
- [x] Umsetzung: `state/session.js`, `state/goals.js`
- [x] Umsetzung: `ui/auth-modal.js`, `ui/header.js`, `ui/settings-panel.js`
- [x] `app.js` Integration + `index.html` (Tabler Icons CDN, topbar-auth-Container)
- [x] Sicherheits-Review bestanden (5/5 Tests ✅)
- [x] 205 Tests grün, 20+ Commits auf `dashboard-2.0`

**Wichtige Erkenntnisse Phase 1:**
- Fehlende GRANTs (`0002_grants.sql`) waren Root Cause für 403-Fehler — in künftigen Migrationen GRANTs immer mitführen
- `getAuthedClient()` in `client.js` als Fallback für authentifizierte Requests (Token explizit setzen)
- `supabase/migrations/0001_initial_schema.sql` wurde nachträglich ins Repo gezogen (war zunächst nur in Supabase-UI)

---

## Phase 2 — Befinden & Events 📅

*Mockup: Check-in-Dialog + Event-Timeline.*

- [x] Konzept: Tägliches Morgen-Check-in (3-4 Slider: Schlaf, Energie, Muskelgefühl, Stimmung + optionale Notiz) — Kopplung an Belastungsempfehlung; liefert auch an Ruhetagen einen Datenpunkt **[OP]** → `docs/phase-2-konzept-morgen-checkin.md`
- [x] Entschieden: Nach-Fahrt-Befinden (RPE/Feel) läuft über intervals.icu, nicht Supabase
- [x] Umsetzung: `generate-data.js` erweitern — RPE/Feel pro Aktivität aus intervals.icu holen **[SO]** → `rpe`/`feelIcu` in `scripts/lib/map-activity.js`
- [x] Konzept: Event-Verwaltung — Rennen/Touren mit Datum, Priorität, Countdown; Verknüpfung mit "Nächste Einheit"-Karte und FTP-Zielen **[SO]** → `docs/phase-2-konzept-event-verwaltung.md`
- [ ] Mockups erstellen und iterieren **[SO]** (Check-in-Dialog-Mockup erledigt; Event-Timeline-Mockup-Schritt übersprungen, direkt gegen den echten `.plan-toggle`/`.panel-card`-Look implementiert statt separatem Mockup)
- [x] Umsetzung: Check-in-Dialog + `wellbeing`-Tabelle **[SO]** → `supabase/migrations/0003_wellbeing.sql`, `state/wellbeing.js`, `ui/checkin-dialog.js`
- [x] Umsetzung: Event-CRUD + Timeline-Anzeige inkl. Header-Integration **[SO]** → `supabase/migrations/0004_events.sql`, `data-access/supabase/events.js`, `state/events.js`, `ui/event-form.js`, `ui/event-timeline.js`; `#event-timeline`-Mount in `index.html`/`app.js`, Renn-Countdown in der "Nächste Einheit"-Karte (`ui/overview.js`, geteilte `countdownCard()`-Formatierung)
- [x] Belastungsempfehlungs-Logik um Befinden erweitern **[OP]** → Governor (`governLevel()`/`subjectiveSignal()`) in `core/briefing.js`, verdrahtet über `state/wellbeing.js` (2-Tage-Range) in `app.js`/`ui/analysis.js`, nur beim eingeloggten Athleten (`isAthlete()`-Gate), Tests in `tests/analysis-core.test.js`
- [ ] Tests **[SO]** (Subjektiv-Kanal + RPE/Feel-Mapping + Governor getestet; `upsertToday` und `tests/supabase-rls.test.js` offen — s. `docs/offene-punkte.md`)

---

## Phase 3 — Interaktiver Planungstab ✅

*Mockup: Wochenplaner mit Karten-Interaktionen. Technisch anspruchsvollste UI-Phase.*

- [x] Konzept: Trainingskarten hinzufügen / bearbeiten / löschen / per Drag & Drop verschieben **[OP]** → `docs/phase-3-konzept-planungstab.md`
- [x] Konzept: Konfliktlogik — TSS/CTL-Prognose bei Verschiebung **[F5]** → `docs/phase-3-konzept-konfliktlogik-prognose.md`
- [ ] Mockup erstellen und iterieren **[SO]** (wie Phase 2: Schritt übersprungen, direkt gegen den bestehenden `.planned-*`-Look implementiert statt separatem Mockup — Konzeptdokumente enthalten die relevanten Layout-Beschreibungen)
- [x] Umsetzung: Migrationsskript `scripts/migrate-plan-to-supabase.js` — Basisplan + adjustments einmalig nach `plan_cards` materialisiert (Konzept §8.4); `ui/planned.js` liest/schreibt jetzt gegen `state/plan-cards.js`. Nebenprodukt Median-TSS pro Typ nur geloggt (Dry-Run), noch nicht in Konfliktlogik verdrahtet (kommt mit Schritt 4). M3 (Wahoo-Push-Umzug) zurückgestellt → `docs/offene-punkte.md` **[SO]**
- [x] Umsetzung: Karten-CRUD gegen `plan_cards` **[SO]** → `ui/plan-card-dialog.js` (Anlegen/Bearbeiten/Löschen, wiederholbare Workout-Blöcke), `createPlanCard`/`updatePlanCard`/`deletePlanCard` in `data-access/supabase/plan-cards.js` + `state/plan-cards.js`; M3 (Wahoo-Push-Umzug nach `data-access/intervals/push.js`, `external_id`-Upsert statt Heuristik-Duplikat-Check) im selben Schritt miterledigt. Commits `30b6bbe`/`a4169bd`. Live-Test von M3 gegen echten intervals.icu-Account noch offen (s. `docs/offene-punkte.md`)
- [x] Umsetzung: Drag & Drop ohne Framework (Vanilla JS, Pointer Events) **[OP]** → `core/plan-drag.js` (Drop-Regeln, week/phase-Adoption, pure), `ui/plan-drag.js` (Griff, Pointer-Ghost, ephemere Tages-Slots, Kanten-Autoscroll), Anbindung über dieselbe `movePlanCard()` wie der „Verschieben"-Button (Optimistik + requestId-Guard in `state/plan-cards.js`). Vergangene Tage als Drop-Ziel abgewiesen (§6), Drop auf selben Tag No-Op (§7). Zurückgestellt → `docs/offene-punkte.md`: Push-Warnung bei bereits gepushter Karte, Tastatur-Verschieben (A11y), `sort_order`-Umsortierung innerhalb eines Tages. Commits `e54a701`/`71242b1`/`6f9e4f4`/`78c05f3`
- [x] Umsetzung: Prognose-Neuberechnung bei Planänderung **[OP]** → reine Rechen-/Regelschicht: `core/projection.js` (PMC-Fortschreibung `projectLoad` + TSS-Prioritätskette `estimateTss`), `core/conflicts.js` (Regelset v1 K-TSB/K-TSB2/K-HART/K-RAMPE/K-EVENT/K-LEER + K-OVERLAP), Schwellen (K1) + Typ-Default-TSS (K3, echte Median-Werte) zentral in `core/plan-config.js`. Anbindung in `state/plan-cards.js` (`recomputeProjection()` im `notify()` = ein Zusammenlaufpunkt für Drag+Button, erbt requestId-/Rollback-Schutz), `getState()` liefert `projection`+`conflicts`; Provider-Wiring in `app.js` (`configureProjection`). Warnen statt blockieren, Befinden fließt nicht ein. Delta-Zeile/Badges = Schritt 5. Zurückgestellt → `docs/offene-punkte.md`: K3-Defaults dünne Basis (K1-Review), K-RAMPE nur Plan-vs-Plan
- [x] Tests inkl. Edge Cases **[SO]** — Drag-Edge-Cases (Vergangenheit abgewiesen, selber Tag No-Op, Rückgängig nach Drag = nach Button, Rollback-Race) in `tests/plan-drag.test.js` + `tests/plan-cards-move.test.js`; Prognose/Konflikte in `tests/projection.test.js` (handgerechnete PMC-Kurve, 3-stufige TSS-Herkunft, leere/lückenhafte Datenlage) + `tests/conflicts.test.js` (jede Regel Positiv+Negativ, **überlappende Einheiten** = K-OVERLAP jetzt erledigt, zwei Regeln am selben Tag, Konfliktauflösung)
- [x] Umsetzung: Nach-Drop-Feedback (Schritt 5, letzter Schritt) **[SO]** → `core/plan-feedback.js` (reine Ableitungen: `conflictsForCard` gruppiert+sortiert warning vor info, `horizonRaceEvent`/`tsbOnDate` für die Delta-Zeile — kein neuer Rechencode, nur Anzeige-Vorbereitung, s. Konzept §4/§5); `ui/planned.js` rendert Delta-Banner (persistent bis manuell geschlossen, `.planned-delta-banner`) und Konflikt-Badges unter `.planned-card-header` (`.planned-conflict-badges`, gold/rot); Push-Warnung bei gesetztem `pushed_external_id` in derselben Badge-Zeile. Delta-Capture verdrahtet in `_handleMove`/`_handleDrop`/`_handleCancel` (`ui/planned.js`) und im Karten-Dialog (`ui/plan-card-dialog.js`, `PlanCardDialog.onSaved(beforeProjection)` statt Direktimport, um keinen neuen Zirkelimport zu Planned einzuführen). Re-Render-Lücke aus `docs/offene-punkte.md` geschlossen: `onEventsChange` in `app.js` zeichnet den Planungstab jetzt zusätzlich zu `recomputeProjection()` neu. Tests: `tests/plan-feedback.test.js`. Karten-Dialog gegen Konzept (`docs/phase-3-konzept-planungstab.md` §3) abgeglichen — keine Lücke gefunden, keine Änderung nötig. Browser-Verifikation gegen `training-dashboard-dev` (Drag/Move/Event-Änderung live) noch offen — keine Browser-Automatisierung/Testaccount in dieser Session verfügbar, s. `docs/offene-punkte.md`

**Entscheidungen Phase 3:**
- M1: Alle Sessions migrieren, auch erledigte/vergangene ✅
- M2: adjustments.json archivieren (read-only), Schreibpfad stillgelegt ✅
- M3: Wahoo-Push-Umzug nach data-access/ + external_id-Umbau im Zuge der Migration ✅
- K1: Konflikt-Schwellen = Coggan-Defaults, Review gegen Ist-Daten nach Plan 2 ✅
- K2: v1 nur Nach-Drop-Feedback; Drag-Live-Färbung als Polish-Schritt danach ✅
- K3: Typ-Default-TSS als Median pro Typ aus Ist-Fahrten kalibriert ✅

---

## Phase 4 — Trainer-Rolle & Claude-Workflow 🎓

*Mockup: Trainer-Dashboard + Vorschlags-Review-Flow.*

- [x] Konzept: Trainer-Sicht — sieht "seinen" Athleten komplett, kann direkt ändern oder als Vorschlag markieren **[F5]** → `docs/phase-4-konzept-trainer-sicht.md`
- [x] Konzept: Vorschlags-Schema (JSON) — einheitlich für Mensch und Claude **[F5]** → `docs/phase-4-konzept-vorschlags-schema.md`
- [x] Konzept: Export/Import-Workflow (Briefing raus → Claude Pro → Vorschlags-JSON rein) **[OP]** → `docs/phase-4-konzept-export-import-workflow.md`
- [x] Prompt-Vorlage für Claude-Trainer schreiben **[F5]** → `docs/phase-4-prompt-vorlage-claude-trainer.md`
- [x] Mockups erstellen und iterieren **[SO]** — im Chat iteriert und abgenommen (kein separates Mockup-Artefakt, wie bereits bei Phase 2/3 gehandhabt), Beschreibung der drei Ansichten (Trainer-Leiste, Vorschlagsliste, Vergleichsansicht) im Umsetzungs-Prompt festgehalten
- [x] Umsetzung: Trainer-Dashboard + `proposals`-Tabelle mit Annehmen/Ablehnen-Flow **[SO]** → Migration `supabase/migrations/0006_proposals_v1.sql` (proposals auf Schema v1 additiv umgestellt, `plan_cards.updated_by`, neue Tabelle `trainer_view_prefs`); `data-access/supabase/proposals.js` + `trainer-view-prefs.js`; `core/proposal-payload.js`/`proposal-preview.js`/`proposal-groups.js`/`proposal-summary.js` (reine Ableitungen, Wiederverwendung von `core/projection.js`/`core/conflicts.js`); `state/proposals.js` (Annehmen wendet den Vorschlag über die bestehenden `state/plan-cards.js`-Aktionen an statt die Karten-Logik zu duplizieren) + `state/trainer-view.js` (Kontext/Kategorien/Speicher-Modus); `ui/trainer-bar.js`, `ui/proposal-list.js`, `ui/proposal-compare.js`, `ui/proposal-banner.js`; `ui/plan-card-dialog.js` um einen Speichern-Modus-Hook erweitert (Trainer + Modus "Vorschlag" → `createTrainerProposal` statt Direktschreiben, einzige Stelle, an der ein menschlicher Trainer in dieser Umsetzung Vorschläge erzeugen kann — s. Einschränkung unten). **`/code-review --level high` vor dem Commit** deckte einen kritischen RLS-Rollen-Mismatch auf (nur der Athlet darf laut Policy über einen Vorschlag entscheiden, die Review-UI war aber nur über die Trainer-Leiste erreichbar) + vier weitere Korrektheitslücken (Veraltet-Erkennung fehlte, Teilerfolg von "Alle übernehmen" wurde verschluckt, kein Refresh nach Annehmen, keine requestId-Absicherung) — alle behoben, Details in `docs/offene-punkte.md`.
- [x] Umsetzung: Export-Generator + Import-Parser mit Validierung **[SO]** → `core/export-briefing.js` (Markdown-Briefing + JSON-Anhang, feste Prompt-Vorlage `PROMPT_TEMPLATE` 1:1 aus `docs/phase-4-prompt-vorlage-claude-trainer.md`, per Test abgeglichen), `core/proposal-import-parser.js` (letzter ```json-Block), `core/proposal-validator.js` (Hülle + pro-Vorschlag Struktur/Semantik, sammelt alle Fehler); `state/export.js::buildClaudeExport()` zieht Profil/Events/Plan/Ist-Fahrten/Wellbeing/Projektion zusammen, `state/proposals.js::previewClaudeImport()`/`importClaudeProposals()` kapseln Parser+Validator bzw. den Insert (wiederverwendet denselben `insertProposalsAdapter`-Pfad wie der menschliche Trainer, `source: "claude"`, geteilte `group_id`); `ui/export-panel.js` (Leiste + Export-Dialog, Copy+Download) und `ui/import-dialog.js` (Textfeld/Upload → Prüfen → Vorschau mit Status pro Eintrag ist zugleich die Bestätigung → Importieren, Teilerfolg). `KNOWN_PLAN_TYPES` aus `ui/planned.js` nach `core/plan-config.js` verschoben (Validator + Karten-Dialog teilen sich jetzt eine Quelle). Browser-Testzyklus gegen `dashboard-dev` per Playwright MCP durchgespielt (24.07.2026): Export erzeugt echtes Briefing mit echten Karten-IDs, Kopieren/Download funktionieren, Import mit Teilerfolg (1 valide/1 ungültig) zeigt korrekte Vorschau, landet nach Bestätigen reaktiv im Vorschläge-Zähler und in der Vorschlagsliste (inkl. korrekt berechneter Konfliktanzeige). Damit ist der Karten-Dialog nicht mehr der einzige Weg, `proposals`-Zeilen anzulegen.
- [x] Tests **[SO]** → `tests/proposals.test.js` (State-Layer, data-access gemockt wie `tests/plan-cards-move.test.js`), `tests/proposal-preview.test.js`/`proposal-groups.test.js`/`proposal-summary.test.js` (reine core-Module); RLS-Erweiterung in `tests/supabase-rls.test.js` weiterhin offen — braucht Live-Credentials gegen `dashboard-dev`, s. `docs/offene-punkte.md`/AGENTS.md „Test-Sicherheit"
- [x] Browser-Testzyklus (Trainer-Modus) **[SO]** → zwei Bugs gefunden und behoben, beide von Alex im echten Browser bestätigt (24.07.2026): (1) Direkt/Vorschlag-Umschalter wurde beim Drag & Drop ignoriert — Ursache eine Race Condition zwischen zwei `onSessionChange`-Abos, erst per Playwright-Live-Diagnose gefunden, nachdem zwei code-lesebasierte Fixversuche wirkungslos blieben (`ui/planned.js` reagiert jetzt auf `state/trainer-view.js::onTrainerViewChange` statt `onSessionChange`); (2) Drag & Drop fror nach einem Drop für alle Karten ein — `endDrag()` in `ui/plan-drag.js` defensiv gehärtet (`try`/`finally`), unter realen Bedingungen nicht mehr reproduzierbar. Nebenbefund + behoben: `events`-Query scheiterte mit 400 (interne Athleten-ID gegen `uuid`-Spalte, `state/events.js`). Dabei Playwright MCP projektlokal eingerichtet (`.mcp.json`) — Konvention zur künftigen Nutzung in `CLAUDE.md`.

**Entscheidungen Phase 4:**
- T1: Check-in-Notiz für Trainer nur per Athleten-Toggle (Default aus); Slider immer ✅
- T2: Trainer-Direktrechte nur ändern/verschieben; Anlegen/Löschen stets als Vorschlag ✅
- V1: Claude-Importe landen immer als offene Vorschläge im Review ("Alle übernehmen" als Abkürzung) ✅
- V2: Entschiedene Vorschläge werden unbegrenzt aufbewahrt ✅
- Review-Kern: Vergleichsansicht alte/neue Karte nebeneinander, Direkt-Übernahme ohne Vergleich möglich ✅
- Kategorien-Auswahl der Trainer-Leiste: **DB-persistiert** pro Trainer-Athlet-Paar (neue Tabelle `trainer_view_prefs`) statt nur Session-Zustand ✅ *(Nutzerentscheidung, erweitert bewusst die bisherige Trainer-Settings-Entscheidung aus Phase 4 §1)*

---

## Phase 5 — Explorative Datenansichten 🔍

*Mockup: Explorer-Ansicht — im Chat iteriert und abgenommen.*

- [x] Konzept: Verknüpfte Charts, Zeitraum-Brushing, Vergleichsmodus, What-if-Szenarien **[OP]** → `docs/phase-5-konzept-explorer.md` (Entscheidungen X1–X11)
- [x] Chart-Grundlagen aus dem Claude-Design-Entwurf abgeleitet **[OP]** → `docs/chart-grundlagen.md` (Entscheidungen G1–G14): Tokens, Zeichenprimitiven, Interaktionskonventionen, sechs Chart-Familien
- [x] Mockup erstellen und iterieren **[SO]** — drei Varianten im Chat, Variante B (Fokus mit Kennzahlenzeile) gewählt, mit Claude Design gegengeprüft. Zurückgestellt: lückige Messreihen und bucketweise Kopplung
- [x] Erste Umsetzungsrunde als separater Explorer-Tab gebaut, danach **korrigiert**: kein
  eigener Tab, direkte Modernisierung der Bestandscharts war das eigentliche Ziel.
  X2/G12 revidiert, s. `docs/phase-5-konzept-explorer.md` §2.1/§2.3, `docs/chart-grundlagen.md` §8.
- [x] **Schritt 0 (korrigiert) — `renderPMC()` direkt umgebaut.** `densifyDays()`/
  `joinSeries()` in `core/days.js`, `makeIndexScale()` + Interaktions-Primitiven in
  `ui/charts/base.js`, `state/chart-view.js` (Ansichtszustand), PMC-Chart auf neue Achse
  + Optik nach `chart-grundlagen.md` Schicht A **[SO]**. Fünf Commits: Revert des
  fälschlich angelegten Explorer-Tabs (`50049ee`), direkte PMC-Modernisierung (`4d0ace3`),
  Doku-Korrektur verbliebener `state/explorer.js`-Referenzen (`d34dcef`), Nahtstelle bei
  `asOf` und Zebra-Unsicherheitsband korrigiert (`9a3fb53`), Infrastruktur-Punkt zum
  Cron-auf-Default-Branch-Verhalten dokumentiert (`90b2fd6`). Für beide Athleten mit
  Screenshots verifiziert — die anfänglich sichtbare Lücke/Zebra-Streifen waren zwei
  echte Bugs (`absence`-Semantik für abgeleitete Größen, Rechteck-statt-Band beim
  Unsicherheitsband) plus ein Infrastruktur-Effekt (Datenstand 12 Tage alt, weil
  `sync-data.yml` per Cron nur auf `main` läuft, nicht auf `dashboard-2.0` — s.
  `docs/offene-punkte.md`); mit frischen Testdaten lag die Naht praktisch bei „heute",
  kein dritter visueller Zustand nötig.
  → `docs/phase-5-konzept-explorer.md`, `docs/chart-grundlagen.md`
- [x] **Schritt 1 — Zeitraum-Brushing im PMC-Chart.** Übersichtsleiste (immer
  voller Horizont) trägt den Brush (Pointer Events, Griffe + Pan, `MIN_W=7`
  Tage); Presets 30/90/365 Tage, Plan 2, Alles. `presetWindow()`/
  `brushHitTest()`/`nextBrushWindow()` als reine, getestete Indexarithmetik in
  `base.js`. Y-Skalen reagieren jetzt auf das sichtbare Fenster statt auf das
  volle Skelett **[SO]**. Commit `3ac10e1`.
- [x] **Schritt 2 — Verknüpfte Charts: Selektion, dann Cursor-Sync.** Teil A:
  `state/chart-view.js::hoveredIndex` (nie genutztes Schritt-0-Gerüst) durch
  dateISO-basiertes `hoveredDate` (`setHovered`/`clearHovered`) ersetzt — der
  Zustand wird über die Tagesachse eines einzelnen Charts hinaus gebraucht.
  Teil B: `crosshair()`/`hoverDot()` als neue Primitiven in `base.js`
  (`chart-grundlagen.md` §4.1/§4.2); `renderPMC()` hinterlegt Skelett,
  Fenster und CTL/ATL/TSB im Geometrie-Objekt, `paintHover()` zeichnet nur in
  die Hover-`<g>`, nie das ganze Chart neu — alle drei Serien hovern
  gemeinsam auf denselben Tagesindex. Teil C: Fahrtenbuch-Zeile folgt dem
  Hover über eine bewusst NEUE, leichte `Table.setHoverDate()` (nur
  `.row-hover`-Klasse) statt der bestehenden `Table.highlightByDate()` — die
  setzt Filter/Suche/Sortierung zurück und scrollt, was bei jedem Mausmove
  über den Chart die Fahrtenbuch-Ansicht laufend umgebaut hätte. Der
  Planungstab-Sprung (`Planned.scrollToDate()`) bleibt auf Klick beschränkt,
  nicht Hover — Scrollen bei jeder Mausbewegung wäre unruhig, und der Tab ist
  beim Chart-Betrachten meist gar nicht aktiv. Für beide Athleten gegen
  `training-dashboard-dev` (lokaler Dev-Server, Hostname-Config bindet
  `localhost` an das Dev-Projekt) verifiziert: Crosshair + Doppelkreise auf
  allen drei Serien, Fahrtenbuch-Highlight, Klick löst Tab-Wechsel +
  Planungstab-Highlight aus **[SO]**. Drei Commits (`fee6e4c`, `9908ff2`,
  `1f40cf2`). Vorbedingung war beim Auftragsstart fälschlich als „Schritt 1
  bereits committet" angenommen — lag unfertig im Arbeitsverzeichnis und
  wurde vor Schritt 2 nachgeholt (s. Commit `3ac10e1`).
- [ ] Schritt 3 — What-if-Szenarien auf `core/projection.js`, kein eigener Prognose-Layer **[OP]**
- [ ] Schritt 4 — Vergleichsmodus: zwei Zeiträume, selber Athlet, relative x-Achse **[OP]**
- [ ] Schritt 5 — `power.js` modernisieren (Chart-Familie 4) **[SO]**
- [ ] Schritt 6 — `training.js` modernisieren (Chart-Familie 3) **[SO]**
- [ ] Schritt 7 — `wellness.js` modernisieren (Chart-Familien 1/2) **[SO]**
- [ ] Tests **[SO]**

**Entscheidungen Phase 5:**
- X1: Vergleichsachse = zwei Zeiträume, selber Athlet, relative x-Achse ✅
- X2 (revidiert): Kein separater Tab — Bestandscharts werden direkt modernisiert, `pmc.js` zuerst ✅
- X3: Dichtes Tagesgerüst (`densifyDays`) + Indexskala statt Zeitstempelskala ✅
- X4: Skalen-Migration der Bestandscharts ist Nicht-Zielpunkt von Phase 5 ✅
- X5: Heute-/Zukunftsmarke separat zeichnen, `pickLabelIndices()` unangetastet ✅
- X6: Explorer öffentlich; Serien nach Quelle führen, nie nach Thema zusammenfassen ✅
- X7: `projection.asOf` ist die einzige Naht; Historie wird nie neu gerechnet ✅
- X8: Achse reicht immer bis `horizonEnd`; What-if parametrisch auf `core/projection.js` ✅
- X9: Zustandspersistenz über `localStorage("chart_view_<athleteId>")`, kein Router ✅
- X10: Kein eigener Trainer-Modus in v1 ✅
- X11: Mobil Presets statt Brush unterhalb einer Viewport-Schwelle ✅

---

## Phase 6 — Feedback & Öffentlichkeit 💬

*Mockup: Feedback-Widget + Sichtbarkeitskonzept.*

- [x] Konzept: Besucher-Feedback (anonym oder mit Name, Moderation, Spam-Schutz) **[F5]** → `docs/phase-6-konzept-besucher-feedback.md`
- [x] Konzept: Öffentlich vs. hinter Login — finale Sichtbarkeits-Entscheidung pro Datentyp **[F5]** → `docs/phase-6-konzept-sichtbarkeit.md`
- [ ] Mockup erstellen und iterieren **[SO]**
- [ ] Umsetzung: `feedback`-Tabelle + Widget **[SO]**
- [ ] Finaler Privacy-/Security-Review Gesamtsystem **[F5]** (Prüfliste = Sichtbarkeits-Matrix)
- [ ] README + Portfolio-Doku aktualisieren **[HA]**

**Entscheidungen Phase 6:**
- F1: Pre-Moderation — nichts erscheint vor Admin-Freigabe ✅
- F2: Kein Captcha in v1; Turnstile via Edge Function als Nachrüstpfad ✅
- S1: proposals öffentlich lesbar; reason gilt als öffentlich und wird ausschließlich lastbasiert formuliert ✅
- S2: wellbeing_public-Toggle Default: aus ✅

---

## Nächster Schritt

➡️ **Phase 3 ist abgeschlossen** (Migration, Karten-CRUD, Drag & Drop, Prognose/Konfliktlogik, Nach-Drop-Feedback — s. Phase-3-Abschnitt oben). Offen bleibt nur die manuelle Browser-Verifikation von Schritt 5 gegen `training-dashboard-dev` (Drag/Move/Event-Änderung live prüfen, s. `docs/offene-punkte.md`) sowie die Drag-Live-Färbung (K2) als späterer Polish-Schritt — beides kein Blocker für Phase 4.

➡️ **Phase 4 — Trainer-Rolle & Claude-Workflow ist vollständig abgeschlossen ✅.**
Trainer-Dashboard + `proposals`-CRUD (Migration `0006`, Trainer-Leiste, Vorschlagsliste,
Vergleichsansicht) UND der Export/Import-Workflow (Export-Generator, Import-Parser,
Validator, Vorschau mit Teilerfolg) sind umgesetzt, getestet und im echten Browser gegen
`training-dashboard-dev` durchgespielt (24.07.2026, s. Phase-4-Abschnitt oben und
`docs/offene-punkte.md`). Migration-0006-Prüfliste vollständig verifiziert (ein Befund
unterwegs — veraltete `payload`-CHECK-Constraint — von Alex im SQL-Editor neu eingespielt,
re-verifiziert). Damit erzeugt ein Athlet Vorschläge jetzt auf zwei Wegen: direkt durch
seinen menschlichen Trainer (Karten-Dialog) oder durch Claude über den Export/Import-Workflow.

➡️ **Phase 5 — Explorative Datenansichten läuft, Kurs korrigiert.** Konzept
(`docs/phase-5-konzept-explorer.md`, X1–X11, X2 revidiert) und Chart-Grundlagen
(`docs/chart-grundlagen.md`, G1–G14, G12 revidiert) sind geschrieben und abgenommen; die
Mockup-Runde ist durch. Eine erste Umsetzungsrunde legte einen separaten Explorer-Tab an
— nach Rücksprache mit Alex korrigiert: **kein eigener Tab**, die Bestandscharts werden
direkt modernisiert, `pmc.js` zuerst. Der Explorer-Tab-Commit wird verworfen oder
umgewidmet (Entscheidung liegt bei Alex, s. `docs/offene-punkte.md`).

➡️ **Phase 5, Schritt 0 ist abgeschlossen.** `renderPMC()` läuft auf der neuen dichten
Tagesachse mit korrekter Naht bei `asOf`, zusammenhängendem Unsicherheitsband und der
Schicht-A-Optik aus `chart-grundlagen.md`. Für beide Athleten verifiziert. Ein
Infrastruktur-Punkt (Cron läuft nur auf `main`) ist in `docs/offene-punkte.md`
dokumentiert und wartet auf eine separate Entscheidung — kein Blocker für die
nächsten Schritte.

➡️ **Phase 5, Schritt 1 (Zeitraum-Brushing) und Schritt 2 (Verknüpfte
Charts/Cursor-Sync) sind abgeschlossen.** Der PMC-Chart hat jetzt eine
Übersichtsleiste mit Brush + Presets, ein Fadenkreuz, das CTL/ATL/TSB
gemeinsam markiert, und ist über den geteilten Hover-Zustand
(`state/chart-view.js`) mit Fahrtenbuch (Hover) und Planungstab (Klick)
verkabelt. Für beide Athleten gegen `training-dashboard-dev` verifiziert.

➡️ **Nächster Schritt: Phase 5, Schritt 3 — What-if-Szenarien** —
**[OP]**. Parametrische Szenarien (Wochen-TSS ±%, zusätzliche Ruhetage,
Rampenrate) über `core/scenario.js` (neu, pure) → `core/projection.js::
projectLoad()` mit synthetischem Kartensatz, Ergebnis in
`state/chart-view.js` statt `getState()`. `uncertain`-Flag muss sichtbar
bleiben (§6.3) — keine Präzision vortäuschen, die die K3-Typ-Default-TSS
nicht hergibt.
