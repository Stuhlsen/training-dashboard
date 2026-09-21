-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0047: bikes (Räder-Verwaltung)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E3, Verträge V1 & V4)
--
-- Tabelle bikes:
--   id                uuid primary key default gen_random_uuid()
--   profile_id        uuid references profiles(id) on delete cascade
--   name              text not null (z. B. "Cube Nuroad Race Gravel")
--   bike_type         text not null check ('road', 'gravel', 'tt', 'mtb')
--   crank_length_mm   integer check (crank_length_mm > 0 and crank_length_mm < 300)
--   notes             text
--   created_at        timestamptz not null default now()
--   updated_at        timestamptz not null default now()
--
-- RLS (OF-6, V4):
--   SELECT: authenticated (alle eingeloggten Nutzer dürfen Räder sehen)
--   INSERT/UPDATE/DELETE: nur eigener Athlet (profile_id = auth.uid()),
--                         sein Trainer (is_coach_of(profile_id))
--                         oder Admin (is_admin())
-- ============================================================

create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  bike_type text not null check (bike_type in ('road', 'gravel', 'tt', 'mtb')),
  crank_length_mm integer check (crank_length_mm is null or (crank_length_mm >= 100 and crank_length_mm <= 250)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists bikes_set_updated_at on public.bikes;
create trigger bikes_set_updated_at
  before update on public.bikes
  for each row execute function public.set_updated_at();

-- RLS aktivieren
alter table public.bikes enable row level security;

-- Policies
drop policy if exists "bikes_select_authenticated" on public.bikes;
create policy "bikes_select_authenticated" on public.bikes
  for select to authenticated
  using (true);

drop policy if exists "bikes_insert_authorized" on public.bikes;
create policy "bikes_insert_authorized" on public.bikes
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    or public.is_coach_of(profile_id)
    or public.is_admin()
  );

drop policy if exists "bikes_update_authorized" on public.bikes;
create policy "bikes_update_authorized" on public.bikes
  for update to authenticated
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

drop policy if exists "bikes_delete_authorized" on public.bikes;
create policy "bikes_delete_authorized" on public.bikes
  for delete to authenticated
  using (
    profile_id = auth.uid()
    or public.is_coach_of(profile_id)
    or public.is_admin()
  );

-- Grants
grant select, insert, update, delete on public.bikes to authenticated;
grant select, insert, update, delete on public.bikes to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
