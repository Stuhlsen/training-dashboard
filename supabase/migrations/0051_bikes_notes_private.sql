-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0051: bikes.notes nicht mehr oeffentlich lesbar
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: /security-review Fahrplan 16 — Fund 1 (0047_bikes.sql)
--
-- 0047 hatte "select to authenticated using (true)" auf der GANZEN bikes-
-- Tabelle — bewusst so gedacht fuer OF-6 (Name/Radtyp/Kurbellaenge fuer alle
-- sichtbar, wie shoes-Tabelle Idee 12 S10). Das freie notes-Feld stand aber
-- NICHT im urspruenglichen Datenmodell (Fahrplan 16, Vertrag V1) und war nie
-- Teil dieser Entscheidung — mit "using (true)" war es trotzdem fuer jeden
-- eingeloggten Nutzer lesbar.
--
-- Fix: Basistabelle bikes nur noch fuer Eigentuemer/Coach/Admin lesbar (wie
-- bikefit_fittings), oeffentliche Sicht (alle authenticated) laeuft ab jetzt
-- ausschliesslich ueber die View bikes_public OHNE notes.
-- ============================================================

drop policy if exists "bikes_select_authenticated" on public.bikes;
create policy "bikes_select_owner_coach_admin" on public.bikes
  for select to authenticated
  using (
    profile_id = auth.uid()
    or public.is_coach_of(profile_id)
    or public.is_admin()
  );

-- Oeffentliche Sicht ohne notes — laeuft mit den Rechten des View-Erstellers
-- (bypasst damit bewusst die oben verschaerfte Zeilen-Policy fuer genau diese
-- Spaltenauswahl), matcht OF-6 ("alle Betrachter sehen die Liste").
create or replace view public.bikes_public as
  select id, profile_id, name, bike_type, crank_length_mm, created_at, updated_at
  from public.bikes;

grant select on public.bikes_public to authenticated;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
