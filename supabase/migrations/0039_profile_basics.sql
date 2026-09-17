-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0039: Profil-Basisdaten
--             (has_password, gender, height_cm, weight_kg, hr_max,
--              updated_at + Sync-Trigger; athlete_sync_config-Ortsname)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
-- Referenz: planning/fahrplan-17-onboarding-assistent-profildaten.md,
--           Etappe E1, Verträge V1 + V2
--
-- BEFUND: Der Onboarding-Assistent (E7) und die Settings-Profilsektion
-- (E3) brauchen editierbare Basisdaten (Geschlecht, Größe, Gewicht, HFmax)
-- und einen Hinweis, ob ein Account noch das reine Invite-Magic-Link-
-- Passwort trägt oder schon ein echtes eigenes Passwort gesetzt hat
-- (has_password). birthdate/resting_hr existieren schon aus Migration
-- 0035, waren aber bewusst ohne Schreibrecht/Oberfläche — das kommt jetzt.
--
-- WICHTIG (Datenschutz-Nuance aus 0035 übernommen): profiles' SELECT-
-- Policy ist "using (true)" — jede eingeloggte Person kann jede Zeile
-- lesen, nur Spalten-GRANTs schränken ein. Die neuen Felder dürfen deshalb
-- NICHT per `grant select (...) to authenticated` auf der Basistabelle und
-- NICHT in `profiles_visible` (öffentlich lesbare Sicht, 0022) landen —
-- das wäre für ALLE Nutzer lesbar. Stattdessen eine neue, echte self-only
-- View `profiles_own` (id = auth.uid()).
-- ============================================================

alter table public.profiles add column if not exists has_password boolean not null default false;
alter table public.profiles add column if not exists gender text
  check (gender is null or gender in ('maennlich','weiblich','divers'));
alter table public.profiles add column if not exists height_cm smallint
  check (height_cm is null or height_cm between 100 and 250);
alter table public.profiles add column if not exists weight_kg numeric(5,1)
  check (weight_kg is null or (weight_kg > 0 and weight_kg < 400));
alter table public.profiles add column if not exists hr_max smallint
  check (hr_max is null or hr_max between 100 and 230);
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();  -- wiederverwendet, s. 0005

-- Update-Grant erweitern (RLS "eigenes Profil ändern", 0001, filtert schon
-- auf id = auth.uid() — für UPDATE reicht die Spalten-Erweiterung):
revoke update on public.profiles from authenticated;
grant update (display_name, wellbeing_public, birthdate, resting_hr, gender,
              height_cm, weight_kg, hr_max) on public.profiles to authenticated;

-- has_password bleibt NICHT direkt user-schreibbar (kein grant update) —
-- wird ausschließlich vom Trigger unten gesetzt.

-- ACHTUNG (Abweichung vom Fahrplan-Wortlaut, live gegen dashboard-dev
-- verifiziert): V1 nannte "security_invoker = true", das scheitert aber
-- mit "permission denied for table profiles" (42501) — authenticated hat
-- KEIN allgemeines SELECT auf die Basistabelle, nur einzelne Spalten via
-- eigener Grants (0022). profiles_visible löst dieselbe Lücke bereits mit
-- security_invoker = off (Owner-Rechte) — hier identisch übernommen. Die
-- Selbst-Beschränkung bleibt unverändert durch "where id = auth.uid()"
-- erzwungen, security_invoker ändert daran nichts.
create or replace view public.profiles_own
  with (security_invoker = off) as
select id, has_password, birthdate, resting_hr, gender, height_cm, weight_kg,
       hr_max, updated_at
from public.profiles
where id = auth.uid();

grant select on public.profiles_own to authenticated;

-- ------------------------------------------------------------
-- has_password-Sync-Trigger (V2): setzt has_password=true, sobald
-- auth.users.encrypted_password von leer auf gesetzt wechselt (echtes
-- Passwort-Setzen nach Invite-Magic-Link). Analog zum bestehenden
-- handle_new_user()-Trigger (0001) — Trigger auf auth.users sind in
-- diesem Projekt schon etabliertes Muster.
-- ------------------------------------------------------------

create or replace function public.sync_has_password()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.encrypted_password is not null and new.encrypted_password <> ''
     and (old.encrypted_password is null or old.encrypted_password = '') then
    update public.profiles set has_password = true where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists auth_users_sync_has_password on auth.users;
create trigger auth_users_sync_has_password
  after update on auth.users
  for each row execute function public.sync_has_password();

-- service_role braucht has_password lesend für die künftige Admin-
-- Athletenübersicht (Fahrplan 17 V4/E5) — Muster wie ftp_public (0025) /
-- plan_offset_weeks (0026) / birthdate+resting_hr (0035): jede profiles-
-- Spalte einzeln an service_role grantet, keine pauschale Freigabe.
grant select (has_password) on public.profiles to service_role;

-- athlete_sync_config: Ortsname zur Anzeige (Koordinaten bleiben wie
-- bisher gerundet, s. Migration 0023).
alter table public.athlete_sync_config add column if not exists
  weather_location_label text;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- als Athlet A: GET /profiles_own -> nur eigene Zeile, alle neuen Felder
-- als Athlet A: GET /profiles_visible bzw. ?select=birthdate auf der
--               Basistabelle als anderer Nutzer -> KEIN Zugriff auf die
--               neuen Felder
-- PATCH /profiles?id=eq.<fremde-id> mit gender=... als Athlet A -> RLS-Fehler
-- PATCH /profiles_own?id=eq.<eigene-id> mit has_password=true -> Fehler
--       (kein Grant, nur der Trigger darf das setzen)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
