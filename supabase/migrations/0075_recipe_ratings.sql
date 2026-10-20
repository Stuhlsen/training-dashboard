-- migrate:up

-- ============================================================
-- Dashboard 2.0 -- Migration 0075: recipe_ratings (Sterne-Bewertung)
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion -- NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-30-bewertung-zeit-portionen.md -- B3 (R-1, R-3, R-4)
--
-- ZWECK: Angemeldete Athleten bewerten FREIGEGEBENE Rezepte mit 1-5 Sternen.
--   Das ist etwas anderes als recipe_votes (Daumen, Meinung fuer den Admin,
--   Rezepte in Pruefung, B4) -- die Tabelle wird hier nicht beruehrt.
--
-- REGELN (alle in der Datenbank, nicht nur in der App)
--   * Sterne 1..5 (CHECK).
--   * Eine Bewertung je Athlet und Rezept (UNIQUE), aenderbar (UPDATE) und
--     zurueckziehbar (DELETE), jeweils nur die eigene Zeile.
--   * Nur auf Rezepte mit status = 'approved'.
--   * Nicht auf das eigene Rezept (recipes.submitted_by = Bewerter).
--   Beides prueft der Trigger recipe_ratings_check_rules (auch bei UPDATE von
--   recipe_id), weil eine Policy die zweite Tabelle nur ueber Umwege sieht.
--
-- LESEN: Fremde Einzelwerte gehen NIE nach aussen.
--   * Basistabelle: SELECT-Policy nur auf die eigene Zeile (athlete_id = auth.uid()).
--   * Schnitt und Anzahl liefert die View recipe_rating_stats (ohne Athlet-ID),
--     nur fuer freigegebene Rezepte und nur fuer authenticated.
--   * anon: nichts (weder Tabelle noch View).
--
-- FK on delete cascade wie bei recipe_votes (0063): Rezept oder Athlet weg ->
--   die Bewertungen verschwinden mit.
--
-- WENN EIN BEWERTETES REZEPT SPAETER NICHT MEHR 'approved' IST: Die Zeilen
--   bleiben, die View blendet das Rezept aus (sie joint auf status = 'approved').
-- ============================================================

create table if not exists public.recipe_ratings (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint recipe_ratings_unique_rating unique (recipe_id, athlete_id)
);

comment on table public.recipe_ratings is
  'Fahrplan 30 B3: Sterne (1-5) fuer freigegebene Rezepte. Eine Zeile je (recipe_id, athlete_id). '
  'Nur approved, nicht das eigene Rezept (Trigger). Einzelwerte sind nur dem Bewerter lesbar; '
  'Schnitt und Anzahl liefert die View recipe_rating_stats.';

-- Der unique-Constraint deckt "alle Bewertungen eines Rezepts" ab; dieser Index
-- ergaenzt "alle Bewertungen eines Athleten" (eigene Bewertungen laden).
create index if not exists recipe_ratings_athlete_idx on public.recipe_ratings (athlete_id);

alter table public.recipe_ratings enable row level security;

-- ------------------------------------------------------------
-- Policies: nur die eigene Zeile
-- ------------------------------------------------------------
drop policy if exists "recipe_ratings_select_own" on public.recipe_ratings;
create policy "recipe_ratings_select_own"
  on public.recipe_ratings for select to authenticated
  using (athlete_id = (select auth.uid()));

drop policy if exists "recipe_ratings_insert_own" on public.recipe_ratings;
create policy "recipe_ratings_insert_own"
  on public.recipe_ratings for insert to authenticated
  with check (athlete_id = (select auth.uid()));

drop policy if exists "recipe_ratings_update_own" on public.recipe_ratings;
create policy "recipe_ratings_update_own"
  on public.recipe_ratings for update to authenticated
  using (athlete_id = (select auth.uid()))
  with check (athlete_id = (select auth.uid()));

drop policy if exists "recipe_ratings_delete_own" on public.recipe_ratings;
create policy "recipe_ratings_delete_own"
  on public.recipe_ratings for delete to authenticated
  using (athlete_id = (select auth.uid()));

-- ------------------------------------------------------------
-- Trigger: nur approved, nicht das eigene Rezept
-- ------------------------------------------------------------
-- security definer, damit der Trigger das Rezept unabhaengig von dessen
-- Lese-Policies sieht (ein eigenes pending/rejected Rezept waere sonst fuer
-- die Pruefung unsichtbar). Wird nur vom Trigger aufgerufen, nie direkt.
create or replace function public.recipe_ratings_check_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status       text;
  v_submitted_by uuid;
begin
  select r.status, r.submitted_by
    into v_status, v_submitted_by
    from public.recipes r
   where r.id = new.recipe_id;

  if v_status is distinct from 'approved' then
    raise exception 'recipe_ratings: only approved recipes can be rated';
  end if;

  if v_submitted_by is not null and v_submitted_by = new.athlete_id then
    raise exception 'recipe_ratings: you cannot rate your own recipe';
  end if;

  return new;
end;
$$;

-- Supabase vergibt EXECUTE ueber die Default-Privileges direkt an anon/authenticated;
-- "from public" allein nimmt es ihnen nicht (s. Revoke in 0071). Ein Trigger braucht
-- kein EXECUTE-Recht des Aufrufers.
revoke all on function public.recipe_ratings_check_rules() from public, anon, authenticated;
grant execute on function public.recipe_ratings_check_rules() to service_role;

drop trigger if exists recipe_ratings_check_rules on public.recipe_ratings;
create trigger recipe_ratings_check_rules
  before insert or update of recipe_id, athlete_id on public.recipe_ratings
  for each row execute function public.recipe_ratings_check_rules();

-- updated_at (set_updated_at() aus 0003_wellbeing.sql)
drop trigger if exists recipe_ratings_set_updated_at on public.recipe_ratings;
create trigger recipe_ratings_set_updated_at
  before update on public.recipe_ratings
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- View: Schnitt und Anzahl je freigegebenem Rezept, ohne Athlet-ID
-- ------------------------------------------------------------
-- security_invoker = off: die View liest die Basistabelle mit den Rechten des
-- Besitzers und umgeht damit die "nur eigene Zeile"-Policy -- aber sie gibt nur
-- Aggregate heraus. Rezepte ohne Bewertung tauchen nicht auf (die App zeigt dann
-- "noch nicht bewertet", keine Null).
create or replace view public.recipe_rating_stats
with (security_invoker = off) as
  select rr.recipe_id,
         round(avg(rr.stars)::numeric, 2) as avg_stars,
         count(*)::integer                as rating_count
    from public.recipe_ratings rr
    join public.recipes r on r.id = rr.recipe_id and r.status = 'approved'
   group by rr.recipe_id;

comment on view public.recipe_rating_stats is
  'Fahrplan 30 B3: Schnitt (avg_stars, 2 Nachkommastellen) und Anzahl (rating_count) je freigegebenem Rezept. '
  'Keine Athlet-ID, keine Einzelwerte. Nur authenticated.';

revoke all on public.recipe_rating_stats from public, anon, authenticated;
grant select on public.recipe_rating_stats to authenticated, service_role;

-- ------------------------------------------------------------
-- Tabellen-Grants
-- ------------------------------------------------------------
revoke all on public.recipe_ratings from public, anon;
grant select, insert, update, delete on public.recipe_ratings to authenticated;
grant all on public.recipe_ratings to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
