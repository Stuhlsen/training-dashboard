-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0026: profiles.plan_offset_weeks
--             (Ganzen Trainingsplan um N Wochen verschieben, self-service)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: 6-Punkte-Liste 03.09.2026, Punkt 1
--
-- BEFUND: Athlet 4s Trainingsplan ist eine generierte 12-Wochen-Vorlage
-- (scripts/lib/plan-athlete4.js, Start Mo 2026-08-31 = KW36), einmalig als
-- ~48 plan_cards-Zeilen migriert. Der Athlet kann einzelne Karten per Drag
-- verschieben, aber nicht den GANZEN Plan. Ein reiner Karten-Shift wäre
-- inkohärent, weil das Plan-Wochen-Modell (app/src/core/plan-week-model.js,
-- feste Datumsgrenzen KW36–47) die abgeleiteten Ruhetage, die
-- Erholungswochen-Schattierung und — über die parallele scripts/lib/core/-
-- Kopie — auch der Sync (Hero, Compliance) daran hängen.
--
-- FIX: eine Integer-Spalte nach dem Muster von units_preference (0020) /
-- ftp_public (0025) — Default 0, self-service über den Planungstab. Sie ist
-- die QUELLE DER WAHRHEIT für „um wie viele Wochen ist dieser Plan gegenüber
-- der Code-Vorlage verschoben". planWeekFor()/isDeliberateRestDay() bekommen
-- einen offset-Parameter (Default 0 ⇒ bestehende Aufrufer unverändert), der
-- Sync liest die Spalte per service_role (analog 0024, id/display_name) und
-- verschiebt die Vorlagen-Daten. CHECK begrenzt auf einen sinnvollen Bereich.
-- ============================================================

alter table public.profiles
  add column if not exists plan_offset_weeks integer not null default 0
    check (plan_offset_weeks between -8 and 12);

-- Self-Service-UPDATE, spalten-restriktiv (wie display_name/wellbeing_public
-- 0001, ladder_progression_enabled 0018, units_preference 0020, ftp_public
-- 0025). Die RLS-Policy „profiles: eigenes Profil ändern" (0001,
-- using id = auth.uid()) ist spalten-agnostisch und deckt die neue Spalte ab.
grant update (plan_offset_weeks) on public.profiles to authenticated;

-- Der Sync liest die Spalte per service_role (RLS-Bypass), analog 0024
-- (id, display_name) — scripts/lib/sync-config-fetch.js verschiebt damit die
-- Athlet-4-Vorlage + die Plan-Wochen-Modell-Kopie.
grant select (plan_offset_weeks) on public.profiles to service_role;

-- profiles_visible-View (0022/0025) um die Spalte erweitern — der Planungstab
-- liest die eigene Zeile über diese View. Spaltenreihenfolge/-set 1:1 aus
-- 0025, nur plan_offset_weeks angehängt.
create or replace view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at, ftp_public,
         plan_offset_weeks
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

revoke all on public.profiles_visible from anon, authenticated;
grant select on public.profiles_visible to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als anon:      GET /rest/v1/profiles?select=plan_offset_weeks -> Fehler
--                (kein Grant; unverändert: nur id, display_name, role,
--                 wellbeing_public)
-- als Athlet:    GET /profiles_visible -> eigene Zeile trägt plan_offset_weeks
--                eigenes plan_offset_weeks per API auf 1 setzen -> ok
--                auf 99 setzen -> Fehler (CHECK -8..12)
--                fremdes plan_offset_weeks setzen -> Fehler (RLS)
-- als service_role: GET /rest/v1/profiles?select=id,plan_offset_weeks
--                -> Zeilen (Sync-Lesepfad, sync-config-fetch.js)
-- Sync:          node scripts/generate-data.js -> bei plan_offset_weeks != 0
--                für Athlet 4 sind die rides-4.json-plannedSessions um
--                offset*7 Tage verschoben; bei 0 unverändert
-- Planungstab:   „Plan verschieben…" -> +1 Woche -> alle künftigen Karten
--                datieren um, Ruhetage/Erholungs-Schattierung wandern mit
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
