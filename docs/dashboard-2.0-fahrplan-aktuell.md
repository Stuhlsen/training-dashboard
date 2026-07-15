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
- [ ] Konzept: Event-Verwaltung — Rennen/Touren mit Datum, Priorität, Countdown; Verknüpfung mit "Nächste Einheit"-Karte und FTP-Zielen **[SO]**
- [ ] Mockups erstellen und iterieren **[SO]** (Check-in-Dialog-Mockup erledigt, Event-Timeline-Mockup offen)
- [x] Umsetzung: Check-in-Dialog + `wellbeing`-Tabelle **[SO]** → `supabase/migrations/0003_wellbeing.sql`, `state/wellbeing.js`, `ui/checkin-dialog.js`
- [ ] Umsetzung: Event-CRUD + Timeline-Anzeige **[SO]**
- [ ] Belastungsempfehlungs-Logik um Befinden erweitern (hängt an `core/briefing.js`, subjektiver Kanal in `core/readiness.js` steht bereits als Vertragsfunktion) **[OP]** — s. `docs/offene-punkte.md`
- [ ] Tests **[SO]** (Subjektiv-Kanal + RPE/Feel-Mapping getestet; `upsertToday` und `tests/supabase-rls.test.js` offen — s. `docs/offene-punkte.md`)

---

## Phase 3 — Interaktiver Planungstab 🗂️

*Mockup: Wochenplaner mit Karten-Interaktionen. Technisch anspruchsvollste UI-Phase.*

- [ ] Konzept: Trainingskarten hinzufügen / bearbeiten / löschen / per Drag & Drop verschieben **[OP]**
- [ ] Konzept: Konfliktlogik — TSS/CTL-Prognose bei Verschiebung **[F5]**
- [ ] Mockup erstellen und iterieren **[SO]**
- [ ] Umsetzung: Karten-CRUD gegen `plan_cards` **[SO]**
- [ ] Umsetzung: Drag & Drop ohne Framework (Vanilla JS, Pointer Events) **[OP]**
- [ ] Umsetzung: Prognose-Neuberechnung bei Planänderung **[OP]**
- [ ] Tests inkl. Edge Cases (überlappende Einheiten, Verschieben in die Vergangenheit) **[SO]**

---

## Phase 4 — Trainer-Rolle & Claude-Workflow 🎓

*Mockup: Trainer-Dashboard + Vorschlags-Review-Flow.*

- [ ] Konzept: Trainer-Sicht — sieht "seinen" Athleten komplett, kann direkt ändern oder als Vorschlag markieren **[F5]**
- [ ] Konzept: Vorschlags-Schema (JSON) — einheitlich für Mensch und Claude **[F5]**
- [ ] Konzept: Export/Import-Workflow (Briefing raus → Claude Pro → Vorschlags-JSON rein) **[OP]**
- [ ] Prompt-Vorlage für Claude-Trainer schreiben **[F5]**
- [ ] Mockups erstellen und iterieren **[SO]**
- [ ] Umsetzung: Trainer-Dashboard + `proposals`-Tabelle mit Annehmen/Ablehnen-Flow **[SO]**
- [ ] Umsetzung: Export-Generator + Import-Parser mit Validierung **[SO]**
- [ ] Tests **[SO]**

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

- [ ] Konzept: Besucher-Feedback (anonym oder mit Name, Moderation, Spam-Schutz) **[F5]**
- [ ] Konzept: Öffentlich vs. hinter Login — finale Sichtbarkeits-Entscheidung pro Datentyp **[F5]**
- [ ] Mockup erstellen und iterieren **[SO]**
- [ ] Umsetzung: `feedback`-Tabelle + Widget **[SO]**
- [ ] Finaler Privacy-/Security-Review Gesamtsystem **[F5]**
- [ ] README + Portfolio-Doku aktualisieren **[HA]**

---

## Nächster Schritt

➡️ **Phase 2, erster Punkt:** Konzept Morgen-Check-in ausarbeiten **[OP]**
