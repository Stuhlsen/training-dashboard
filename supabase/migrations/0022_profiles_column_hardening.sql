-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0022: profiles SELECT spaltengenau härten
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: GitHub Issue #32 (TonyBoston, 29.08.2026) — "profiles SELECT
--           policy exposes is_admin/coach_id to anon (unauthenticated)"
--
-- BEFUND: Die Policy "profiles: öffentlich lesbar" (0001) ist rein
-- zeilenbasiert (`using (true)`), und 0002 erteilt `grant select on
-- public.profiles to anon, authenticated` OHNE Spaltenliste. Ergebnis:
-- ein unauthentifizierter GET /rest/v1/profiles liefert die kompletten
-- Zeilen aller Konten zurück — inklusive `coach_id` und `is_admin`. Der
-- Policy-Kommentar in 0001 rechtfertigt nur die NAMEN als öffentlich
-- ("Namen stehen ohnehin im Dashboard"); die UPDATE-Seite wurde direkt
-- darunter bereits spaltengenau gehärtet (`grant update (display_name,
-- wellbeing_public) …`), die SELECT-Seite nie.
--
-- FIX (2-teilig, folgt dem Vorschlag aus #32 und ergänzt ihn):
--
-- 1. Basistabelle: SELECT nur noch auf die tatsächlich öffentlichen
--    Spalten. Betrifft ausschließlich SELECT — die column-restricted
--    UPDATE-Grants aus 0001/0018/0020 sind ein anderer Privilege-Typ und
--    bleiben unangetastet. RLS-Policy bleibt `using (true)`: Zeilen sind
--    nicht das Geheimnis, Spalten schon, und das deckt jetzt der
--    Column-Grant ab.
--
-- 2. Die App liest die sensiblen Spalten (`coach_id`, `is_admin`) aber
--    legitim für die EIGENE Zeile (Session/Rolle/Admin-Gate, Ladder-
--    Preset) und für Zeilen SELBST GECOACHTER Athleten (Trainer-Leiste).
--    Ein reines REVOKE für `authenticated` (wie in #32 skizziert) würde
--    diese Pfade brechen. Deshalb ein dedizierter Lesepfad über eine
--    View mit `security_invoker = off` — läuft mit Owner-Rechten, der
--    WHERE-Filter IST die Sicherheitsgrenze. Exakt das Muster, das das
--    Repo für `public.wellbeing_shared` schon nutzt (0003).
-- ============================================================

-- --- 1. Basistabelle: SELECT spaltengenau -------------------
revoke select on public.profiles from anon, authenticated;
grant  select (id, display_name, role, wellbeing_public)
  on public.profiles to anon, authenticated;

-- --- 2. Eigene / gecoachte Zeile inkl. sensibler Spalten ----
-- Nicht gegrantet auf der Basistabelle: coach_id, is_admin, created_at,
-- units_preference, ladder_progression_enabled. Zugriff nur hierüber.
create view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

revoke all on public.profiles_visible from anon, authenticated;
grant select on public.profiles_visible to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
--
-- als anon:      GET /rest/v1/profiles?select=* -> Zeilen OHNE coach_id/
--                is_admin (nur id, display_name, role, wellbeing_public)
--                GET /rest/v1/profiles?select=coach_id -> Fehler (kein Grant)
--                GET /rest/v1/profiles_visible -> 401 / leer
-- als Athlet:    GET /profiles?select=coach_id,is_admin -> Fehler
--                GET /profiles_visible -> GENAU die eigene Zeile, mit
--                coach_id/is_admin
--                eigenes display_name/wellbeing_public/units_preference/
--                ladder_progression_enabled per API ändern -> weiterhin ok
--                (UPDATE-Grants unberührt)
--                coach_id/is_admin an sich selbst setzen -> weiterhin Fehler
-- als Trainer:   GET /profiles_visible -> eigene Zeile UND Zeilen der
--                selbst gecoachten Athleten, keine fremden
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
