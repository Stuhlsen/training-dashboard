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
| **[F5]** | Opus 4.7/4.8 | Architektur-Entscheidungen, Sicherheitskonzepte (RLS!), komplexes Debugging |
| **[OP]** | Opus 4.6 | Große Refactorings, anspruchsvolle UI-Logik (Drag & Drop, State-Sync) |
| **[SO]** | Sonnet 4.6 | Das Arbeitspferd: normale Implementierung in Claude Code, Mockups, CRUD-Features |
| **[HA]** | Haiku 4.5 | Kleinkram: Texte, Umbenennungen, Commit-Messages, simple Fixes |

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
- [ ] Umsetzung: Export-Generator + Import-Parser mit Validierung **[SO]** — Konzept steht (`docs/phase-4-konzept-export-import-workflow.md`), Umsetzung noch offen; bis dahin ist der menschliche Trainer-Pfad über den Karten-Dialog der einzige Weg, `proposals`-Zeilen anzulegen
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

*Mockup: Explorer-Ansicht.*

- [ ] Konzept: Verknüpfte Charts, Zeitraum-Brushing, Vergleichsmodus, What-if-Szenarien **[OP]**
- [ ] Mockup erstellen und iterieren **[SO]**
- [ ] Umsetzung schrittweise pro Interaktion **[SO]**, bei kniffligen Chart-Interaktionen **[OP]**
- [ ] Vereinheitlichung mit bestehendem Charts-Tab (Datumsformate, Kategorien) **[HA]**
- [ ] Tests **[SO]**

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

➡️ **Phase 4 — Trainer-Rolle & Claude-Workflow:** Trainer-Dashboard + `proposals`-CRUD
sind umgesetzt UND im echten Browser gegen `training-dashboard-dev` getestet (Migration
`0006`, Trainer-Leiste, Vorschlagsliste, Vergleichsansicht, Tests — s. Phase-4-Abschnitt
oben). Zwei dabei gefundene Bugs (Toggle-Race, Drag-Freeze) sind behoben und von Alex
im echten Browser bestätigt (24.07.2026, s. `docs/offene-punkte.md`). Offen: die
Migration-0006-Prüfliste am Ende der Datei einmal vollständig durchgehen (Browser-Verifikation
des Trainer-Flows selbst ist erledigt, s. o.); danach Export-Generator + Import-Parser **[SO]**
(letzter Baustein aus Phase 4, Konzept bereits fertig).
