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

## Phase 3 — Interaktiver Planungstab 🗂️

*Mockup: Wochenplaner mit Karten-Interaktionen. Technisch anspruchsvollste UI-Phase.*

- [x] Konzept: Trainingskarten hinzufügen / bearbeiten / löschen / per Drag & Drop verschieben **[OP]** → `docs/phase-3-konzept-planungstab.md`
- [x] Konzept: Konfliktlogik — TSS/CTL-Prognose bei Verschiebung **[F5]** → `docs/phase-3-konzept-konfliktlogik-prognose.md`
- [ ] Mockup erstellen und iterieren **[SO]**
- [x] Umsetzung: Migrationsskript `scripts/migrate-plan-to-supabase.js` — Basisplan + adjustments einmalig nach `plan_cards` materialisiert (Konzept §8.4); `ui/planned.js` liest/schreibt jetzt gegen `state/plan-cards.js`. Nebenprodukt Median-TSS pro Typ nur geloggt (Dry-Run), noch nicht in Konfliktlogik verdrahtet (kommt mit Schritt 4). M3 (Wahoo-Push-Umzug) zurückgestellt → `docs/offene-punkte.md` **[SO]**
- [x] Umsetzung: Karten-CRUD gegen `plan_cards` **[SO]** → `ui/plan-card-dialog.js` (Anlegen/Bearbeiten/Löschen, wiederholbare Workout-Blöcke), `createPlanCard`/`updatePlanCard`/`deletePlanCard` in `data-access/supabase/plan-cards.js` + `state/plan-cards.js`; M3 (Wahoo-Push-Umzug nach `data-access/intervals/push.js`, `external_id`-Upsert statt Heuristik-Duplikat-Check) im selben Schritt miterledigt. Commits `30b6bbe`/`a4169bd`. Live-Test von M3 gegen echten intervals.icu-Account noch offen (s. `docs/offene-punkte.md`)
- [ ] Umsetzung: Drag & Drop ohne Framework (Vanilla JS, Pointer Events) **[OP]**
- [ ] Umsetzung: Prognose-Neuberechnung bei Planänderung **[OP]**
- [ ] Tests inkl. Edge Cases (überlappende Einheiten, Verschieben in die Vergangenheit) **[SO]**

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
- [ ] Konzept: Export/Import-Workflow (Briefing raus → Claude Pro → Vorschlags-JSON rein) **[OP]**
- [x] Prompt-Vorlage für Claude-Trainer schreiben **[F5]** → `docs/phase-4-prompt-vorlage-claude-trainer.md`
- [ ] Mockups erstellen und iterieren **[SO]**
- [ ] Umsetzung: Trainer-Dashboard + `proposals`-Tabelle mit Annehmen/Ablehnen-Flow **[SO]**
- [ ] Umsetzung: Export-Generator + Import-Parser mit Validierung **[SO]**
- [ ] Tests **[SO]**

**Entscheidungen Phase 4:**
- T1: Check-in-Notiz für Trainer nur per Athleten-Toggle (Default aus); Slider immer ✅
- T2: Trainer-Direktrechte nur ändern/verschieben; Anlegen/Löschen stets als Vorschlag ✅
- V1: Claude-Importe landen immer als offene Vorschläge im Review ("Alle übernehmen" als Abkürzung) ✅
- V2: Entschiedene Vorschläge werden unbegrenzt aufbewahrt ✅
- Review-Kern: Vergleichsansicht alte/neue Karte nebeneinander, Direkt-Übernahme ohne Vergleich möglich ✅

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

➡️ **Phase 3, Umsetzung:** Drag & Drop ohne Framework (Vanilla JS, Pointer Events) **[OP]** — Griff an der Karte, Drop-Zone am Zieltag, Vergangenheits-Tage abgewiesen (s. `docs/phase-3-konzept-planungstab.md` §4/§6); danach Prognose-Neuberechnung bei Planänderung (`core/projection.js`/`core/conflicts.js`, Schritt 4)
