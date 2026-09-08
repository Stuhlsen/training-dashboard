-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0035: profiles.birthdate + profiles.resting_hr
--             (HFmax/Ruhe-HF-Grundlage für den Multi-Sport-TRIMP-Lastpfad)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-10-multi-sport.md, Etappe E5a
--
-- BEFUND: Fahrplan 10 E6 baut einen sportartübergreifenden Banister-TRIMP-
-- Lastpfad (HF-basiert). Die Formel braucht je Athlet HFmax UND Ruhe-HF:
--   HRr = (HRavg − hrRest) / (hrMax − hrRest).
-- HFmax lebt bisher nur als Literal in app/src/config.ts (Frontend) — der
-- Sync liest config.ts nicht. Ruhe-HF gibt es nirgends. E4 hat entschieden:
-- HFmax per Tanaka (208 − 0,7 × Alter) aus einem Geburtsdatum im Profil,
-- ausdrücklich als eigene Migration VOR E6 (Guardrail 2: Kernschicht-Umbau
-- und DB-Migration nie in einer Etappe).
--
-- FIX: zwei nullable Spalten auf profiles nach dem Muster von
-- plan_offset_weeks (0026). Der Sync liest sie per service_role (RLS-Bypass,
-- analog 0024 id/display_name) und rechnet daraus Tanaka-HFmax +
-- Ruhe-HF je Athlet (scripts/lib/sync-config-fetch.js + scripts/lib/hr.js).
-- Für Athlet 1/2/4 bleiben beide Spalten leer → kein Konsument, keine
-- Wertänderung, Golden-Master (E2) unberührt.
--
-- BEWUSST NICHT in dieser Migration:
--   * kein grant update ... to authenticated — es gibt noch kein Settings-
--     Feld für Geburtsdatum/Ruhe-HF (kommt in Phase 2 / E8 mit eigener
--     Migration, dann auch die profiles_visible-Erweiterung).
--   * keine profiles_visible-Änderung — raw birthdate soll von jedem
--     Frontend-Lesepfad fern bleiben (Datenschutz: realer Mensch). Die
--     Frontend-HF-Zonen nutzen weiterhin das config.ts-Literal.
--   Alex setzt Athlet 3s Werte bis dahin per SQL-Editor (wie die
--   profiles-Zeile selbst in E4).
-- ============================================================

alter table public.profiles
  add column if not exists birthdate date
    check (birthdate is null or (birthdate > date '1900-01-01' and birthdate < current_date));

alter table public.profiles
  add column if not exists resting_hr integer
    check (resting_hr is null or resting_hr between 30 and 100);

-- Der Sync liest beide Spalten per service_role (RLS-Bypass), analog 0024
-- (id, display_name) / 0026 (plan_offset_weeks) — scripts/lib/sync-config-fetch.js.
grant select (birthdate, resting_hr) on public.profiles to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als service_role: GET /rest/v1/profiles?select=id,birthdate,resting_hr
--                   -> Zeilen (Sync-Lesepfad, sync-config-fetch.js)
-- als anon:         GET /rest/v1/profiles?select=birthdate -> Fehler
--                   (kein Grant; unverändert: nur id, display_name, role,
--                    wellbeing_public aus 0022)
-- als Athlet:       GET /profiles_visible -> KEINE der neuen Spalten
--                   (bewusst nicht in der View)
-- CHECK:            resting_hr auf 200 setzen -> Fehler (30..100)
--                   birthdate auf morgen setzen -> Fehler (< current_date)
-- Sync:             node scripts/generate-data.js -> Log unverändert
--                   ("✅ athlete_sync_config: N Athleten-Zeile(n)"),
--                   rides-*.json ohne nicht-volatile Diffs (noch kein
--                   TRIMP-Konsument — der kommt in E6)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
