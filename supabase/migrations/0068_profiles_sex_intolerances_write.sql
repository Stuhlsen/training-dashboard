-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0068: profiles.sex / intolerances
--             Read-Write-Pfad (E5 Settings-Formular)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-23-ernaehrung.md, Etappe E5,
--           Entscheidungen E20/E21, Migration 0059 (Ankündigung)
--
-- BEFUND: Migration 0059 hat die Spalten sex (text, check 'm'/'f'/null)
-- und intolerances (text[], NOT NULL default '{}') angelegt, aber bewusst
-- OHNE grant update und OHNE Aufnahme in profiles_own — der Schreib- und
-- Lesepfad wurde für E5 angekündigt.
--
-- ZUSÄTZLICHER BEFUND (live gegen dashboard-dev geprüft, 2026-10-07): Migration 0039
-- hat per "revoke update on public.profiles from authenticated" ALLE Spalten-Grants
-- entzogen (PostgreSQL entzieht beim Tabellen-Revoke auch die Spalten-Grants) und nur
-- ihre eigene Liste neu vergeben. Nicht dabei waren die Self-Service-Spalten aus
-- 0018 (ladder_progression_enabled), 0020 (units_preference), 0025 (ftp_public) und
-- 0026 (plan_offset_weeks): Seit 0039 liefert das Speichern dieser vier Einstellungen
-- 42501 (keine Berechtigung). 0052 (sports) und 0059 haben bewusst additiv gegrantet.
--
-- Diese Migration schließt die Lücke:
--   - grant update (sex, intolerances) on public.profiles to authenticated
--     (Schreiben auf der Basistabelle wie die übrigen Self-Service-Felder;
--      die bestehende RLS-Policy "profiles: eigenes Profil ändern" (0001,
--      using id = auth.uid()) schützt bereits vor fremden Schreibzugriffen)
--   - dieselbe Anweisung gibt die vier durch 0039 verlorenen Spalten wieder frei
--     (ladder_progression_enabled, units_preference, ftp_public, plan_offset_weeks)
--   - NUR additiv, KEIN revoke: ein weiteres revoke+grant würde jeden Grant
--     entziehen, den diese Liste nicht kennt (genau das war der Fehler von 0039)
--   - profiles_own (0039) um sex und intolerances ergänzt, neue Spalten am
--     ENDE der Select-Liste (bestehende Spaltenreihenfolge bleibt erhalten)
--   - KEIN select grant auf der Basistabelle für die neuen Columns —
--     der Lesepfad geht ausschließlich über profiles_own (self-only)
-- ============================================================

-- ------------------------------------------------------------
-- 1. UPDATE-Grant ergänzen (spaltenrestriktiv, rein additiv wie 0052)
-- ------------------------------------------------------------
-- Idempotent: ein erneutes grant auf bereits vergebene Spalten ist wirkungslos.
-- Die bestehende RLS-Policy (0001) filtert auf id = auth.uid() und schützt
-- vor fremden Schreibzugriffen.
grant update (sex, intolerances,
              ladder_progression_enabled, units_preference, ftp_public,
              plan_offset_weeks)
  on public.profiles to authenticated;

-- ------------------------------------------------------------
-- 2. profiles_own-View erweitern (0039 → hier)
--    Neue Spalten am ENDE der Select-Liste anfügen, um die
--    bestehende Spaltenreihenfolge nicht zu verändern.
--    Konsumenten lesen per Namen (`.single<ProfileOwnRow>()`),
--    die Reihenfolge im SELECT betrifft nur PostgREST,
--    nicht den TypeScript-Consumer.
-- ------------------------------------------------------------
create or replace view public.profiles_own
  with (security_invoker = off) as
select id, has_password, birthdate, resting_hr, gender, height_cm, weight_kg,
       hr_max, updated_at, sex, intolerances
from public.profiles
where id = auth.uid();

-- ------------------------------------------------------------
-- 3. KEIN select grant auf Basistabelle für die neuen Spalten.
--    Der Lesepfad geht ausschließlich über profiles_own.
--    service_role kann weiterhin alles lesen (Default-Grant
--    auf alle Spalten für service_role bleibt unberührt).
-- ------------------------------------------------------------

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Als Eigentümer:
--   GET /profiles_own -> eigene Zeile mit sex, intolerances
--     (SELECT über die View)
--   PATCH /profiles?id=eq.<eigene-uid> mit sex='m' -> ok
--     (UPDATE-Grant + RLS)
--   PATCH /profiles?id=eq.<eigene-uid> mit sex='x' -> 23514
--     (Check-Verletzung, nicht 42501)
--   PATCH /profiles?id=eq.<eigene-uid> mit
--     intolerances='{"gluten"}' -> ok
--   PATCH /profiles?id=eq.<eigene-uid> mit units_preference / ftp_public /
--     plan_offset_weeks / ladder_progression_enabled (unveraenderter Wert) -> 204
--     (vorher seit 0039: 403 / 42501)
--
-- Als Fremder:
--   GET /profiles_own -> 0 Treffer (View filtert auth.uid())
--   GET /profiles?select=sex from profiles
--     -> sex unsichtbar (kein SELECT-Grant für anon/authenticated
--        auf der Basistabelle für die neue Spalte)
--   PATCH /profiles?id=eq.<fremde-uid> mit sex='m' -> 42501
--     (RLS: id = auth.uid() blockt)
--
-- Als anon:
--   GET /profiles_own -> 42501 (kein GRANT an anon)
--   PATCH /profiles -> 42501
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.