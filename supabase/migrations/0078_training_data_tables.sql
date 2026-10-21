-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0078: Trainingsdaten je Profil (Fahrplan 26, E1)
-- Einspielen: dbmate / migrate-Container; vorher lokal gegen den Demo-Stack
--             oder dashboard-dev prüfen, NIE zuerst gegen apps01.
-- Referenz: planning/fahrplan-26-dynamische-athleten.md (Q1–Q18, E1)
--
-- ZWECK: Schema für Trainingsdaten, die bisher als statische rides-N.json
-- ohne Login abrufbar sind. E1 legt nur das Schema an — nichts schreibt oder
-- liest diese Tabellen, bis E2 (Sync) und E3 (Frontend) folgen.
--
-- AUFTEILUNG (Q6/Q8):
--   training_rides         eine Zeile je Fahrt
--   training_wellness      eine Zeile je Tag
--   training_profile_data  eine Zeile je Profil: der kleine Rest
--                          (Power-Kurven, Prognose, Gewicht, Meta)
--   athlete_profile_extras Stammdaten aus app/src/config.ts (Q3)
-- Die Fahrt bzw. der Tag liegt komplett in `data` (jsonb), nur die Felder für
-- Schlüssel, Sortierung und Filter sind eigene Spalten. Grund: Das Frontend
-- setzt über einen Adapter die heutige Payload-Form zusammen (Q9) und
-- validate.js bleibt unverändert; ein neues Datenfeld braucht dann keine
-- Migration, nur die drei Pflichtstellen aus AGENTS.md.
--
-- SICHTBARKEIT (Q5/Q7/Q13/Q16): lesen darf self, Trainer, Admin — und alle
-- Eingeloggten, wenn `profiles.training_data_public` an ist (Standard aus).
-- Schreiben der Trainingsdaten nur die Service-Rolle (Sync). Den Schalter
-- ändern nur der Athlet selbst (Spalten-Grant) und Admin (RPC unten).
-- `profiles.ftp_public` (0025) bleibt als zweiter, unabhängiger Schalter
-- innerhalb sichtbarer Daten bestehen.
--
-- DATENSCHUTZ: keine Koordinaten, keine Schlüssel, keine echten Namen in
-- dieser Datei. Der Schalter bei den vier Bestandsathleten wird NICHT hier
-- gesetzt (das bräuchte Namen/UUIDs) — s. Plan, E1-Befund.
-- ============================================================

-- --- 1. Schalter an profiles -----------------------------------------
alter table public.profiles
  add column if not exists training_data_public boolean not null default false;

-- Self-Service wie ftp_public (0025): die Policy "eigenes Profil ändern" (0001)
-- ist spaltenagnostisch, der Spalten-Grant begrenzt auf diese Spalte.
grant update (training_data_public) on public.profiles to authenticated;
-- Seed-/Admin-Werkzeug über service_role.
grant select (training_data_public), update (training_data_public)
  on public.profiles to service_role;

-- profiles_visible um die Spalte erweitern (Settings-Toggle liest die eigene
-- Zeile darüber). Spaltenset 1:1 aus 0071, nur training_data_public angehängt.
create or replace view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at,
         ftp_public, plan_offset_weeks, sports,
         is_verified_author, training_data_public
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

revoke all on public.profiles_visible from anon, authenticated;
grant select on public.profiles_visible to authenticated;

-- Admin ändert den Schalter eines fremden Profils nur über diese Funktion.
-- Eine allgemeine Admin-UPDATE-Policy auf profiles würde ALLE Spalten mit
-- Update-Grant (display_name, ...) für fremde Zeilen öffnen. Der Athlet selbst
-- darf sie ebenfalls aufrufen, der direkte Spalten-Grant bleibt daneben gültig.
create or replace function public.set_training_data_public(aid uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not (aid = auth.uid() or public.is_admin()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.profiles set training_data_public = val where id = aid;
end;
$$;

revoke all on function public.set_training_data_public(uuid, boolean) from public, anon;
grant execute on function public.set_training_data_public(uuid, boolean) to authenticated;

-- --- 2. Lese-Regel als Funktion (security definer, wie is_coach_of) ----
-- Liest den Schalter ohne RLS-Rekursion über profiles. anon: auth.uid() ist
-- null, damit immer false (zusätzlich haben die Tabellen keinen anon-Grant).
create or replace function public.can_read_training_data(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (
    aid = auth.uid()
    or public.is_coach_of(aid)
    or public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = aid and p.training_data_public
    )
  );
$$;

-- --- 3. training_rides: eine Zeile je Fahrt ------------------------------
create table if not exists public.training_rides (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  -- Upsert-Schlüssel je Profil: intervals.icu-Activity-ID, bei Fahrten ohne
  -- Quelle (eingefrorene Plan-1-Historie) ein vom Sync vergebener Ersatz.
  ride_key    text not null,
  ride_date   date not null,
  start_time  text,
  sport       text not null default 'ride'
              check (sport in ('ride', 'run', 'swim', 'other')),
  -- Die komplette Fahrt in der heutigen Payload-Form (types.js: Ride).
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, ride_key)
);

create index if not exists training_rides_profile_date_idx
  on public.training_rides (profile_id, ride_date desc);

-- --- 4. training_wellness: eine Zeile je Tag ------------------------------
create table if not exists public.training_wellness (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (profile_id, day)
);

-- --- 5. training_profile_data: der Rest, eine Zeile je Profil -------------
create table if not exists public.training_profile_data (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  power_curves   jsonb,
  forecast       jsonb,
  athlete_weight jsonb,
  wellness_meta  jsonb,
  -- updated, source, count, ftp, ftpPublic, ... (Kopf der heutigen Payload)
  meta           jsonb not null default '{}'::jsonb,
  -- Platz für abgeleitete Teile ohne eigene Tabelle (plannedSessions,
  -- adjustments, ftpHistory) — Entscheidung dazu in E2, s. Plan, E1-Befund.
  extra          jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

-- --- 6. athlete_profile_extras: Stammdaten aus config.ts (Q3) -------------
-- Name, Sportarten, HFmax und Ruhepuls stehen schon in profiles
-- (display_name, sports, hr_max, resting_hr) und werden hier nicht doppelt geführt.
create table if not exists public.athlete_profile_extras (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  ftp_measured       int2 check (ftp_measured is null or ftp_measured > 0),
  ftp_measured_date  date,
  e_ftp              int2 check (e_ftp is null or e_ftp > 0),
  ftp_goal           int2 check (ftp_goal is null or ftp_goal > 0),
  season_start_ftp   int2 check (season_start_ftp is null or season_start_ftp > 0),
  data_sources       text[] not null default '{}',
  -- { heightCm, age, sex, weightKg }: Grundumsatz-Fallback. Enthält Alter und
  -- Gewicht, darum gleiche Lese-Regel wie die Trainingsdaten, nie öffentlich.
  bmr                jsonb,
  generated_plan     boolean not null default false,
  updated_at         timestamptz not null default now()
);

-- --- 7. updated_at-Trigger (set_updated_at aus 0003) -----------------------
drop trigger if exists training_rides_set_updated_at on public.training_rides;
create trigger training_rides_set_updated_at
  before update on public.training_rides
  for each row execute function public.set_updated_at();

drop trigger if exists training_wellness_set_updated_at on public.training_wellness;
create trigger training_wellness_set_updated_at
  before update on public.training_wellness
  for each row execute function public.set_updated_at();

drop trigger if exists training_profile_data_set_updated_at on public.training_profile_data;
create trigger training_profile_data_set_updated_at
  before update on public.training_profile_data
  for each row execute function public.set_updated_at();

drop trigger if exists athlete_profile_extras_set_updated_at on public.athlete_profile_extras;
create trigger athlete_profile_extras_set_updated_at
  before update on public.athlete_profile_extras
  for each row execute function public.set_updated_at();

-- --- 8. RLS + Grants --------------------------------------------------------
alter table public.training_rides         enable row level security;
alter table public.training_wellness      enable row level security;
alter table public.training_profile_data  enable row level security;
alter table public.athlete_profile_extras enable row level security;

-- Nur SELECT für Eingeloggte; keine Insert/Update/Delete-Policy und kein Grant,
-- damit Schreiben ausschließlich die Service-Rolle (RLS-Bypass) kann.
drop policy if exists "training_rides: lesen" on public.training_rides;
create policy "training_rides: lesen"
  on public.training_rides for select to authenticated
  using (public.can_read_training_data(profile_id));

drop policy if exists "training_wellness: lesen" on public.training_wellness;
create policy "training_wellness: lesen"
  on public.training_wellness for select to authenticated
  using (public.can_read_training_data(profile_id));

drop policy if exists "training_profile_data: lesen" on public.training_profile_data;
create policy "training_profile_data: lesen"
  on public.training_profile_data for select to authenticated
  using (public.can_read_training_data(profile_id));

drop policy if exists "athlete_profile_extras: lesen" on public.athlete_profile_extras;
create policy "athlete_profile_extras: lesen"
  on public.athlete_profile_extras for select to authenticated
  using (public.can_read_training_data(profile_id));

grant select on public.training_rides         to authenticated;
grant select on public.training_wellness      to authenticated;
grant select on public.training_profile_data  to authenticated;
grant select on public.athlete_profile_extras to authenticated;
-- KEIN grant an anon.

-- Explizit, weil der Self-Host-Stack Default-Privilegien für service_role bei
-- neuen Tabellen entzieht (s. 0023).
grant select, insert, update, delete on public.training_rides         to service_role;
grant select, insert, update, delete on public.training_wellness      to service_role;
grant select, insert, update, delete on public.training_profile_data  to service_role;
grant select, insert, update, delete on public.athlete_profile_extras to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (Demo-Stack / dev, nie zuerst apps01):
-- Neues Profil:  training_data_public ist false.
-- als anon:      alle vier Tabellen lesen ✗
-- als Athlet A:  eigene Zeilen lesen ✓ · fremde ✗ (Schalter aus)
--                · Insert/Update/Delete auf alle vier Tabellen ✗
--                · eigenen Schalter per PATCH auf profiles setzen ✓
--                · Schalter eines anderen setzen ✗
-- Schalter an:   jede eingeloggte Person liest die Zeilen von A ✓, anon ✗
-- als Trainer A: Zeilen von Athlet A lesen ✓, fremde ✗ (Schalter aus)
-- als Admin:     alle Zeilen lesen ✓ · set_training_data_public(fremd) ✓
-- als Nicht-Admin: set_training_data_public(fremd) ✗ (42501)
-- als service_role: schreiben/lesen/löschen ✓
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
