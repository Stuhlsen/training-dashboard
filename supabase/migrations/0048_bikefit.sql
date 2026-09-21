-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0048: bikefit_fittings & bikefit_iterations
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E4, Verträge V1 & V4)
--
-- Tabelle bikefit_fittings:
--   id            uuid primary key default gen_random_uuid()
--   profile_id    uuid not null references public.profiles(id) on delete cascade
--   bike_id       uuid not null references public.bikes(id) on delete cascade
--   status        text not null default 'active' check (status in ('active', 'completed', 'abandoned'))
--   target_goal   text not null default 'balanced' check (target_goal in ('comfort', 'balanced', 'aero'))
--   notes         text
--   created_at    timestamptz not null default now()
--   completed_at  timestamptz
--
--   Constraint (B4): Nur 1 'active' Fitting pro (profile_id, bike_id).
--
-- Tabelle bikefit_iterations:
--   id                uuid primary key default gen_random_uuid()
--   fitting_id        uuid not null references public.bikefit_fittings(id) on delete cascade
--   sequence          integer not null check (sequence >= 1)
--   photo_path_legs   text (Storage-Pfad, wird nach Abschluss/pg_cron genullt)
--   photo_path_riding text
--   points            jsonb not null default '{}'::jsonb
--   angles            jsonb not null default '{}'::jsonb
--   recommendation    jsonb not null default '{}'::jsonb
--   created_at        timestamptz not null default now()
--
-- RLS (V4):
--   Sensible Körperdaten / Fotos: KEIN öffentliches SELECT.
--   SELECT/INSERT/UPDATE/DELETE: ausschließlich eigener Athlet (profile_id = auth.uid()),
--   dessen Coach (is_coach_of(profile_id)) oder Admin (is_admin()).
-- ============================================================

-- 1. bikefit_fittings
create table if not exists public.bikefit_fittings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bike_id uuid not null references public.bikes(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  target_goal text not null default 'balanced' check (target_goal in ('comfort', 'balanced', 'aero')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Maximal ein aktives Fitting pro (profile_id, bike_id) (B4)
drop index if exists public.bikefit_fittings_one_active;
create unique index bikefit_fittings_one_active
  on public.bikefit_fittings (profile_id, bike_id)
  where status = 'active';

alter table public.bikefit_fittings enable row level security;

drop policy if exists "bikefit_fittings_authorized" on public.bikefit_fittings;
create policy "bikefit_fittings_authorized" on public.bikefit_fittings
  for all to authenticated
  using (
    profile_id = auth.uid()
    or public.is_coach_of(profile_id)
    or public.is_admin()
  )
  with check (
    profile_id = auth.uid()
    or public.is_coach_of(profile_id)
    or public.is_admin()
  );

grant select, insert, update, delete on public.bikefit_fittings to authenticated;
grant select, insert, update, delete on public.bikefit_fittings to service_role;

-- 2. bikefit_iterations
create table if not exists public.bikefit_iterations (
  id uuid primary key default gen_random_uuid(),
  fitting_id uuid not null references public.bikefit_fittings(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  photo_path_legs text,
  photo_path_riding text,
  points jsonb not null default '{}'::jsonb,
  angles jsonb not null default '{}'::jsonb,
  recommendation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bikefit_iterations_fitting_id_idx
  on public.bikefit_iterations (fitting_id, sequence);

alter table public.bikefit_iterations enable row level security;

-- Helfer-Funktion für RLS auf bikefit_iterations basierend auf dem zugehörigen Fitting
create or replace function public.is_fitting_owner_or_coach(fid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.bikefit_fittings f
    where f.id = fid
      and (
        f.profile_id = auth.uid()
        or public.is_coach_of(f.profile_id)
        or public.is_admin()
      )
  );
$$;

drop policy if exists "bikefit_iterations_authorized" on public.bikefit_iterations;
create policy "bikefit_iterations_authorized" on public.bikefit_iterations
  for all to authenticated
  using (public.is_fitting_owner_or_coach(fitting_id))
  with check (public.is_fitting_owner_or_coach(fitting_id));

grant select, insert, update, delete on public.bikefit_iterations to authenticated;
grant select, insert, update, delete on public.bikefit_iterations to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
