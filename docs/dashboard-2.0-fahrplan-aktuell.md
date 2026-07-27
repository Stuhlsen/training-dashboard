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
- [x] **Schritt 3 — What-if-Szenarien (4A) auf `core/projection.js`, kein
  eigener Prognose-Layer.** Teil A: `core/scenario.js` (neu, pure) —
  `buildScenario()` skaliert Wochen-TSS ± %, entfernt pro ISO-Woche die N
  höchstbelasteten Karten als zusätzliche Ruhetage (bewusst entfernt statt auf
  0 genullt — Begründung im Kopfkommentar) und verkettet die Rampenrate
  wochenweise; `uncertain`-Herkunft (K3-Typ-Default/Workout-Schätzung) wird
  VOR der Skalierung über das bereits exportierte `estimateTss()` erfasst und
  als Karten-ID-Set zurückgegeben, `core/projection.js` bleibt dadurch
  unangetastet. Teil B: `state/chart-view.js` bekommt einen zweiten,
  nicht-persistierenden `projectLoad()`-Aufrufpfad (`configureScenarioSources`
  als Provider-Muster wie `plan-cards.js::configureProjection`,
  `setScenarioParams`/`setScenarioEnabled`) — die Karten-ID-Brücke verknüpft
  die `uncertain`-Herkunft nachträglich über `day.cardIds` in
  `scenarioProjection.days[].uncertain`. Teil C: `SERIES_STYLE` (neu in
  `base.js`, Konvention für Schritt 4 mitgebaut) + Szenario-CTL-Kurve in
  `renderPMC()`, startet bei "heute" (nicht `seamIdx`), eigenes
  Unsicherheitsband; Achsenhorizont bleibt an der Basisprognose verankert
  (X8) — bestätigt beim Ein-/Ausschalten unverändert. Teil D: Ein/Aus-Toggle +
  drei Regler unter dem PMC-Chart, visueller Stil des Hero-What-if-Sliders
  geteilt (`.wi-label`/`.wi-readout`), keine Logik-Wiederverwendung (§6.2).
  Parameter (nicht das Ergebnis) persistieren im bestehenden
  `chart_view_<athleteId>`-Schlüssel. Code-Review vor dem letzten
  Implementierungscommit fand einen echten Bug: `app.js::
  updateChartExplainers()` überschreibt `explainer-pmc` bei jedem Render für
  beide Athleten-Zweige — der neue What-if-Erklärtext musste dort zusätzlich
  zur statischen `index.html`-Fassung ergänzt werden (AGENTS.md-Hinweis
  „Explainer-Texte … BEIDE Athleten-Varianten" bestätigt). Für beide Athleten
  gegen `training-dashboard-dev` verifiziert (Playwright): zweite gestrichelte
  Kurve erscheint/verschwindet mit dem Toggle, Achsenhorizont bleibt stabil
  (Pfadanzahl/Tick-Beschriftung geprüft), zwei getrennte Unsicherheitsbänder
  (Basis + Szenario) sichtbar, Parameter überleben Reload bei
  `enabled:false` **[OP]**. Vier Commits (`71d9b22`, `e2451d1`, `02f28f0`,
  `dac9e93`).
- [x] Schritt 4 — Vergleichsmodus: zwei Zeiträume, selber Athlet, relative x-Achse **[OP]**.
  Teil A: `core/compare.js` (neu, pure) — `buildCompare(rides, slotA, slotB)`
  richtet auf `dayOffset` aus (`densifyDays`/`joinSeries` aus `core/days.js`
  wiederverwendet, kein neuer Kontinuitätsalgorithmus), Kennzahlen (Σ TSS,
  ⌀ CTL, Rampe, harte Tage über `intensityClass` aus `core/plan-config.js`),
  ungleiche Slot-Längen werden nicht gestreckt. Teil B: additives
  `compareSlots`-Feld (`{enabled, a, b}`) in `state/chart-view.js`, Muster
  wie `scenario` — Slots bleiben gemerkt, auch wenn der Modus aus ist;
  bestehender `ws`/`we`-Hauptbrush aus Schritt 1 unverändert (Nutzer-
  entscheidung gegen den im Konzept vorausgesetzten Umbau auf eine
  Slot-Liste, s. §7.1). Teil C: `drawCompareView()` in `renderPMC()` ersetzt
  bei aktivem Vergleich die normale Historie/Prognose-Zeichnung komplett
  (relative + absolute Achse passen nicht in dieselbe `<svg>`), Serie A
  `--z2` durchgezogen, Serie B `--ss` über `SERIES_STYLE.secondary`
  (Konvention aus Schritt 3 wiederverwendet). Wochen-Aggregation je Slot
  getrennt (zwei farbige Tick-Zeilen), `weekDisplayLabels()` auf der
  vollständigen geordneten Wochenliste vor dem Ausdünnen (§1.4). Teil D:
  Cursor pro Slot fällt aus dem bestehenden Mehrserien-Hover-Muster heraus
  (ein Crosshair, zwei `hoverDot()`s) — bewusst lokal am SVG-Knoten, nicht
  über `state/chart-view.js::hoveredDate` (zwei echte Daten pro `dayOffset`
  passen nicht auf ein einzelnes globales Datum). Teil E: „Als A/B merken"
  + Ein-/Ausschalten + Kennzahlen-Anzeige unter dem PMC-Chart, Explainer-Text
  in BEIDEN `app.js::updateChartExplainers()`-Athleten-Zweigen UND der
  statischen `index.html`-Fassung ergänzt (AGENTS.md-Hinweis bestätigt).
  Playwright-Verifikation deckte einen Scoping-Bug auf (`scenario`/
  `compareSlots` nur im neuen Compare-Zweig sichtbar, brach den Szenario-
  Regler-Sync bei JEDEM Render, nicht nur im Vergleichsmodus) — Fix in den
  verursachenden Commit zurück-amendet statt separatem Fixup-Commit. Für
  beide Athleten gegen `training-dashboard-dev` verifiziert (Playwright).
  Fünf Commits (`1e915b4`, `a480da5`, `7efd90e`, `2bbf432`, `940ab8f`).
- [x] Schritt 5 — `power.js` modernisieren (Chart-Familie 4) **[SO]**.
  Scope bewusst auf `renderPowerCurve()` begrenzt (Rückfrage vor der
  Umsetzung, da der Auftrag nur die Power-Curve beschrieb) —
  `renderEfficiency`/`renderScatter`/`renderSmallMultiples` in derselben
  Datei bleiben offen, s. `docs/offene-punkte.md`. Schicht A vollständig
  übernommen: Design-Tokens (`CHART_THEME`, inkl. `BLOCK_COLORS` jetzt aus
  Zonenfarben statt eigener Hex-Literale), abgestuftes Gitter (`gradedGrid`),
  Achseneinheit über der obersten Achsenzahl (`axisUnit`, "Watt"/"W/kg"),
  gemessene Breite + `ResizeObserver` statt festem `viewBox 780×260`,
  `pathD()`/`xLabel()` statt Handschrift. Schicht B nach Familie 4: kein
  Brush, keine Fadenkreuz-Kopplung zu anderen Charts, kein Glow, keine
  Kurvenbeschriftung (Achsentitel statt `halo()`/`flat()`) — Hover ist
  "nächstgelegener Punkt" auf der Dauer-Achse, rein lokal am SVG-Knoten über
  eine eigene Hover-`<g>` mit `crosshair()`/`hoverDot()` als Zeichen-
  primitiven (kein `state/chart-view.js`, analog zum Vergleichsmodus-Hover
  in `pmc.js`). Achsenlogik (Watt-/W-kg-Rundung, Bucket-Labels aus
  `core/powercurve.js`) unverändert übernommen. Für beide Athleten gegen
  einen lokalen Dev-Server per Playwright verifiziert: Gesamt-/Block-/W-kg-
  Ansicht, Hover-Tooltip + Crosshair, `ResizeObserver`-Redraw bei
  Viewport-Resize (1202px → 807px), keine Konsolenfehler.
- [x] Schritt 6 — `training.js` modernisieren (Chart-Familie 3) **[SO]**.
  Scope bewusst auf `renderWeeklyVolume()` + `renderWeatherWeekly()` begrenzt
  (Rückfrage vor der Umsetzung, wörtlich mit `docs/phase-5-konzept-
  explorer.md` §2.4 abgeglichen) — `renderTrimp()`/`renderConsistency()`/
  `renderZoneWeekly()` bleiben offen, s. `docs/offene-punkte.md`. Teil A:
  Schicht A vollständig übernommen (`gradedGrid`, `axisUnit` "km"/"°C"/
  "km/h", gemessene Breite + `ResizeObserver` statt festem `viewBox`,
  `pathD()` statt `<polyline points>` für die Windlinie, Hover-`<g>` statt
  Neuzeichnen); `measuredWidth()` aus `pmc.js` nach `base.js` zentralisiert.
  Tooltip bleibt bewusst `Tooltip` aus `ui/dom.js` (Präzedenzfall `pmc.js`).
  Teil B: `core/chart-buckets.js` (neu) — `dateToWeekBucket()`/
  `weekBucketDateRange()`, pure, konsistent mit `core/aggregate.js::
  rideWeekKey()`; `core/days.js::pmcSkeletonAnchor()` extrahiert den
  bisher inline in `pmc.js::renderPMC()` berechneten Skelett-Anker als
  geteilte Funktion (verhaltensgleiches Refactoring), damit Teil D
  denselben Datums→Index-Anker trifft. Teil C: bucketweise Fadenkreuz-
  Kopplung — Hover in `pmc.js` hebt den passenden Wochen-Balken hervor.
  Teil D: Klick auf einen Balken setzt das PMC-Brush-Fenster auf die
  entsprechende Kalenderwoche, bestehendes Fahrtenbuch-Filter-Verhalten
  bleibt erhalten. Teil C/D nur für `period === "week"` aktiv (Monats-
  Periode bewusst nicht unterstützt, zwei inkonsistente Bucket-
  Konventionen zwischen den Charts, s. `docs/offene-punkte.md`). 14 neue
  Tests (`tests/chart-buckets.test.js`). Für beide Athleten gegen einen
  lokalen Dev-Server per Playwright verifiziert (Hover-Highlight,
  Brush-Klick, `ResizeObserver`-Redraw, keine neuen Konsolenfehler).
- [x] Schritt 7 — `wellness.js` modernisieren (Chart-Familie 2) **[SO]**.
  Scope-Rückfrage vor der Umsetzung ergab: alle 5 Render-Funktionen
  (`renderSleep`, `renderPlanCompareHRV`/`renderPlanCompareRHF` — beide über
  die interne `renderHrvRhfChart` —, `renderEnergy`, `renderHydration`) sind
  Familie 2, keine Familie 3/6 in dieser Datei — anders als bei Schritt 5/6
  bleibt deshalb nichts in dieser Datei zurückgestellt. Teil A: Schicht A
  vollständig übernommen (`gradedGrid`/`axisUnit` statt `gridLines()` mit
  Y-Achsen-Zahlenreihe, gemessene Breite + `ResizeObserver` für
  `renderHrvRhfChart`/`renderEnergy`/`renderHydration`, neu responsiv statt
  festem `viewBox 780`). Teil B: dichtes Tagesgerüst
  (`core/days.js::densifyDays`/`joinSeries`) statt kompaktem Index, jede
  Serie mit `absence:"gap"` (reine Messmetriken). Neue reine Funktion
  `splitRuns()` in `ui/charts/base.js` (+6 Tests in
  `tests/chart-layout.test.js`) zerlegt eine Werteserie in zusammenhängende
  Nicht-Null-Läufe — Linien-/Flächenserien brechen jetzt korrekt an
  Messlücken statt sie unsichtbar zu überbrücken; die bestehende Plan-1/W0/
  Plan-2-Segmentierung im HRV/Ruhepuls-Chart bleibt erhalten (Breakpoints
  weiter auf der kompakten Liste ermittelt, dann auf Skelett-Indizes
  übersetzt); Direktbeschriftung der Hauptserie (`haloLabel`/
  `flattestIndex`, Familie-2-Konvention). Teil C: tagesgenaue
  Fadenkreuz-Kopplung an `state/chart-view.js`, analog `pmc.js` — neue
  lokale, geteilte `paintDayHover(svg, geoKey)` (Muster wie
  `training.js::paintBucketHover`), `series[].color` darf eine feste Farbe
  oder eine Funktion `(i)=>color` sein (gebraucht vom HRV/Ruhepuls-Chart,
  dessen Punktfarbe je nach Plan-Segment wechselt). Bewusst NICHT
  übernommen: das PMC-Brush-Fenster (`ws`/`we`) — die Charts zeigen weiter
  ihre volle Historie, analog zu Familie 3 in Schritt 6, weil
  `renderPlanCompareHRV`/`RHF` bewusst Plan 1 GANZ gegen Plan 2 GANZ
  vergleicht und ein 90-Tage-Default-Fenster das verdecken würde — s.
  `docs/offene-punkte.md` (Abweichung von der Familie-2-Tabellenzeile
  „Brush: ✅ Fläche"). Für beide Athleten gegen einen lokalen Dev-Server per
  Playwright verifiziert: Fadenkreuz-Sync zwischen HRV/RHF (gemeinsame
  Messlücken korrekt als reine Crosshair-Linie ohne Punkt dargestellt) und
  Sleep, korrekter Abbruch außerhalb des jeweils eigenen Datumsbereichs
  (Energie/Sleep haben einen kürzeren Bereich als HRV/RHF), sichtbare echte
  Messlücken (z.B. Sleep-Chart Athlet 2: mehrtägige Lücke Anfang Februar als
  echte Leerstelle statt komprimiert), keine neuen Konsolenfehler.
- [x] Tests **[SO]** — `splitRuns()` in `tests/chart-layout.test.js` (6 neue
  Tests: durchgehender Lauf, einzelne/mehrtägige Lücke, führende/
  nachgestellte Lücken, leere Serie, `0` als gültiger Wert vs. Lücke).

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

➡️ **Phase 5, Schritt 3 (What-if-Szenarien) ist abgeschlossen.**
`core/scenario.js` (neu, pure) erzeugt aus den drei Parametern (Wochen-TSS
± %, N Ruhetage, Rampenrate) einen synthetischen Kartensatz; ein zweiter,
nicht-persistierender `projectLoad()`-Aufrufpfad in `state/chart-view.js`
(`configureScenarioSources`/`setScenarioParams`/`setScenarioEnabled`) legt
daraus eine zweite, gestrichelte CTL-Kurve über die Basisprognose —
`core/projection.js` bleibt unverändert, die `uncertain`-Herkunft wird über
eine Karten-ID-Brücke nachträglich verknüpft (§6.3). Ein/Aus-Toggle + drei
Regler unter dem PMC-Chart im Hero-What-if-Slider-Stil (nur Optik geteilt).
Achsenhorizont bleibt beim Ein-/Ausschalten stabil (X8), Szenario-Parameter
persistieren, das Ergebnis selbst nie (§6.4). Für beide Athleten gegen
`training-dashboard-dev` per Playwright verifiziert.

➡️ **Phase 5, Schritt 4 (Vergleichsmodus) ist abgeschlossen.**
`core/compare.js` (neu, pure) richtet zwei Zeiträume auf `dayOffset`
(Tag 1 = Blockstart) aus, komplett auf bereits vorhandenen, getesteten
Primitiven aufgebaut (`densifyDays`/`joinSeries` aus `core/days.js`,
`intensityClass` aus `core/plan-config.js` für „harte Tage") — keine neue
Kontinuitätslogik. `state/chart-view.js` bekam ein additives
`compareSlots`-Feld (`{enabled, a, b}`, Muster wie `scenario`) statt eines
Umbaus von `ws`/`we` auf eine Liste (Nutzerentscheidung: der bestehende
Hauptbrush aus Schritt 1 bleibt unangetastet). `renderPMC()` schaltet bei
aktivem Vergleich komplett auf die relative Achse um (ersetzt, überlagert
nicht — eine relative und eine absolute Achse passen nicht in dieselbe
`<svg>`), Serie A in `--z2`, Serie B über `SERIES_STYLE.secondary` in
`--ss`. Cursor pro Slot fiel aus dem bestehenden Mehrserien-Hover-Muster
heraus (ein Crosshair, zwei `hoverDot()`s), bewusst lokal am SVG-Knoten statt
über das globale `hoveredDate` (zwei echte Daten pro `dayOffset` lassen sich
nicht auf ein einzelnes Datum abbilden). Wochen-Aggregation ab ~40px/Tag,
`weekDisplayLabels()` läuft je Slot auf der vollständigen geordneten
Wochenliste vor dem Ausdünnen (§1.4-Reihenfolge). Playwright-Verifikation
deckte einen Scoping-Bug auf (`scenario`/`compareSlots` nur im neuen
Zweig sichtbar, brach den Szenario-Regler-Sync bei jedem Render) — in den
verursachenden Commit zurück-amendet, kein separater Fixup-Commit. Für
beide Athleten gegen `training-dashboard-dev` verifiziert (Playwright):
Serien überlagert, ungleiche Längen strecken nicht, Cursor zeigt pro Slot
korrekte Werte/Tooltip, Wochen-Umschaltung inkl. Athlet-2-Lückenfall
(`joinSeries("carry")`, 2+ fehlende Tage bleiben Lücke statt fortgeschrieben).
Fünf Commits (`1e915b4`, `a480da5`, `7efd90e`, `2bbf432`, `940ab8f`).

➡️ **Phase 5, Schritt 5 (`power.js`/Power-Curve, Chart-Familie 4) ist
abgeschlossen.** Scope bewusst auf `renderPowerCurve()` begrenzt, s.
Phase-5-Abschnitt oben und `docs/offene-punkte.md`.

➡️ **Phase 5, Schritt 6 (`training.js`, Chart-Familie 3) ist abgeschlossen.**
Scope bewusst auf `renderWeeklyVolume()` + `renderWeatherWeekly()` begrenzt,
s. Phase-5-Abschnitt oben und `docs/offene-punkte.md`.

➡️ **Phase 5, Schritt 7 (`wellness.js`, Chart-Familie 2) ist abgeschlossen —
letzter planmäßiger Baustein von Phase 5 (§2.4).** Scope umfasste alle 5
Render-Funktionen der Datei (keine Zurückstellung nötig, anders als bei
Schritt 5/6), s. Phase-5-Abschnitt oben und `docs/offene-punkte.md`.

➡️ **Nächster Schritt: Phase 6 — Feedback & Öffentlichkeit**, s. Abschnitt
unten.
