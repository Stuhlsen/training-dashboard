-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0070: ingredient_requests
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-25-ernaehrung-ausbau.md — S1b (S1-6, S1-11)
--
-- ZWECK: Ein Athlet wuenscht eine Zutat, die in der Zutatentabelle fehlt.
-- Der Admin liest die Wuensche und pflegt die Tabelle von Hand nach.
--
-- RLS (S1-6):
--   INSERT: nur eigene Zeile (requested_by = auth.uid())
--   SELECT: Admin liest alle; Athlet liest nur die eigenen
--   UPDATE/DELETE: kein Grant fuer authenticated (Aufraeumen: Service-Rolle)
--   anon: nichts
--
-- LIMIT: hoechstens 20 Wuensche je Athlet. Der Dienst (POST
-- /api/ingredient-requests) prueft vorab fuer eine freundliche Meldung; der
-- Trigger ist die harte Absicherung fuer direkte PostgREST-Inserts und
-- zaehlt auch fuer die Service-Rolle.
-- ============================================================

create table if not exists public.ingredient_requests (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 100),
  note          text check (note is null or char_length(note) <= 300),
  created_at    timestamptz not null default now()
);

comment on table public.ingredient_requests is
  'Zutaten-Wuensche der Athleten (Fahrplan 25 S1b). '
  'Admin liest alle, Athlet nur die eigenen. Hoechstens 20 je Athlet (Trigger). '
  'Kein UPDATE/DELETE fuer authenticated.';

create index if not exists ingredient_requests_requested_by_idx
  on public.ingredient_requests (requested_by);

alter table public.ingredient_requests enable row level security;

drop policy if exists "ingredient_requests_insert_own" on public.ingredient_requests;
create policy "ingredient_requests_insert_own"
  on public.ingredient_requests for insert to authenticated
  with check (requested_by = auth.uid());

drop policy if exists "ingredient_requests_select_own_or_admin" on public.ingredient_requests;
create policy "ingredient_requests_select_own_or_admin"
  on public.ingredient_requests for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

grant select, insert on public.ingredient_requests to authenticated;
grant all on public.ingredient_requests to service_role;

create or replace function public.ingredient_requests_check_limit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.ingredient_requests where requested_by = new.requested_by) >= 20 then
    raise exception 'ingredient_requests: limit of 20 requests per athlete reached';
  end if;
  return new;
end;
$$;

drop trigger if exists ingredient_requests_check_limit on public.ingredient_requests;
create trigger ingredient_requests_check_limit
  before insert on public.ingredient_requests
  for each row execute function public.ingredient_requests_check_limit();

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
