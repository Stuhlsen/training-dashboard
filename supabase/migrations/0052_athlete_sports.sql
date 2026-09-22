-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0052: Sportarten als self-service Spalte
-- auf profiles (Fahrplan 21, E1). Einspielen: dev-Projekt zuerst
-- (dashboard-dev), danach apps01 — Rückfrage bei Alex vor Prod.
--
-- Vertrag V1: Sportarten werden von config.ts in die DB verschoben.
-- Athlet selbst + zugeordneter Trainer sehen sie über profiles_visible
-- (Q5); self-service UPDATE läuft über die bestehende RLS-Policy
-- "profiles: eigenes Profil ändern" (0001).
-- ============================================================

alter table public.profiles
  add column if not exists sports text[] not null default array['ride'];

alter table public.profiles
  add constraint profiles_sports_valid
  check (
    coalesce(array_length(sports, 1), 0) >= 1
    and sports <@ array['ride','run','swim']::text[]
  );

-- Self-Service-UPDATE, spalten-restriktiv wie ftp_public (0025)/
-- units_preference (0020). Die bestehende RLS-Policy "profiles: eigenes
-- Profil ändern" (0001, using id = auth.uid()) deckt die neue Spalte
-- automatisch ab.
grant update (sports) on public.profiles to authenticated;

-- Der Sync könnte sports später brauchen (z.B. um Aktivitäten einer
-- abgewählten Sportart gar nicht erst zu verarbeiten) — Grant vorsorglich
-- wie bei anderen Athletenwerten, kein Sync-Code in diesem Fahrplan.
grant select (sports) on public.profiles to service_role;

-- profiles_visible (0022, zuletzt erweitert in 0025/0026) um sports
-- ergänzen — Selbst + zugeordneter Trainer sehen die Sportarten (Q5).
-- Spaltenreihenfolge/-set 1:1 aus 0026, nur sports angehängt.
create or replace view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at,
         ftp_public, plan_offset_weeks, sports
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

-- Seed: Athlet 3 ("Hendrik", Pseudonym — s. AGENTS.md) trägt heute in
-- config.ts bereits {ride,run,swim}. Idempotent (WHERE-Filter), Golden-
-- Master-Anforderung von E2: kein Athlet darf durch diese Migration einen
-- ANDEREN Wert bekommen als config.ts ihm heute schon gibt. Alle übrigen
-- Athleten bleiben beim Spalten-Default {ride}, exakt wie ihr heutiges
-- config.ts-Fehlen von `sports` (⇒ ["ride"] gelesen).
update public.profiles set sports = array['ride','run','swim']
where display_name = 'Hendrik';

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
