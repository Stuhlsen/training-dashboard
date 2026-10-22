-- migrate:up

-- ============================================================
-- Fahrplan 32, Etappe E4 — Migration 0079: profiles.has_indoor_trainer
-- Einspielen: dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
--
-- Profilfeld "Ich habe eine Rolle / einen Smart-Trainer":
--   true  = ja, false = nein, NULL = nie gefragt / nicht angegeben.
-- Der Plangenerator zeigt die Drinnen/Draußen-Wahl pro Trainingstag nur,
-- wenn der Wert true ist (E5).
--
-- Datenschutz / Rechte (Muster hr_max aus 0039, sex aus 0068):
--   - Schreiben: nur der Besitzer — Spalten-UPDATE-Grant, die bestehende
--     RLS-Policy "profiles: eigenes Profil ändern" (0001, id = auth.uid())
--     schützt vor fremden Zeilen. NUR additiv, KEIN revoke (Lehre aus 0039).
--   - Lesen: ausschließlich über die self-only View profiles_own. KEIN
--     SELECT-Grant auf der Basistabelle und KEINE Aufnahme in
--     profiles_visible — es gibt bewusst keinen neuen Lesepfad für Trainer;
--     im Trainer-Fall gilt in der App "nicht angegeben" (null).
--   - service_role: select + update (Seed-/Admin-Werkzeug, wie 0078).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Spalte
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists has_indoor_trainer boolean;

comment on column public.profiles.has_indoor_trainer is
  'Fahrplan 32 E4: Athlet hat eine Rolle / einen Smart-Trainer. NULL = nie gefragt. Lesen nur ueber profiles_own, schreiben nur der Besitzer.';

-- ------------------------------------------------------------
-- 2. Rechte
-- ------------------------------------------------------------
grant update (has_indoor_trainer) on public.profiles to authenticated;
grant select (has_indoor_trainer), update (has_indoor_trainer)
  on public.profiles to service_role;

-- ------------------------------------------------------------
-- 3. profiles_own erweitern (0068 -> hier): neue Spalte ans ENDE der
--    Select-Liste, damit die bestehende Reihenfolge erhalten bleibt
--    (create or replace view verlangt das).
-- ------------------------------------------------------------
create or replace view public.profiles_own
  with (security_invoker = off) as
select id, has_password, birthdate, resting_hr, gender, height_cm, weight_kg,
       hr_max, updated_at, sex, intolerances, has_indoor_trainer
from public.profiles
where id = auth.uid();

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Als Eigentümer:
--   PATCH /profiles?id=eq.<eigene-uid> mit has_indoor_trainer=true/false/null -> ok
--   GET /profiles_own?select=has_indoor_trainer -> der geschriebene Wert
--   PATCH mit has_indoor_trainer='vielleicht' -> 22P02 (kein Boolean)
--
-- Als Fremder / Trainer:
--   PATCH /profiles?id=eq.<fremde-uid> -> 0 Zeilen (RLS)
--   GET /profiles_own -> nur die eigene Zeile
--   GET /profiles_visible -> Spalte nicht vorhanden
--
-- Als anon:
--   GET /profiles?select=has_indoor_trainer -> 42501
--   GET /profiles_own -> 42501
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
