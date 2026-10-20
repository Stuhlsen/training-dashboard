-- migrate:up

-- ============================================================
-- Dashboard 2.0 -- Migration 0076: Daumen und Pruefung fuer Rezepte in Pruefung
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion -- NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-30-bewertung-zeit-portionen.md -- B4 (R-1, R-2)
--
-- ZWECK: Rezepte mit status = 'pending' bekommen Daumen hoch/runter von allen
--   angemeldeten Athleten (Meinung fuer den Admin, keine automatische Freigabe).
--   Sterne (recipe_ratings, 0075) gibt es nur auf freigegebene Rezepte -- beides
--   bleibt getrennt. recipe_votes.comment (0063) bleibt ungenutzt.
--
-- AENDERUNGEN
--   1. admin_audit_log.action nimmt 'approve_recipe' und 'reject_recipe' auf
--      (Freigeben/Ablehnen laeuft ueber admin-api und schreibt vorher ein Audit).
--   2. recipe_votes lesen: nur die eigene Zeile, der Admin alle. Vorher durfte
--      jeder Angemeldete alle Zeilen MIT Athlet-ID lesen (0063) -- wer wie
--      abgestimmt hat, sieht damit hoechstens der Admin.
--   3. Trigger recipe_votes_check_rules: nur auf Rezepte in Pruefung, nicht auf
--      das eigene Rezept. Er feuert bei JEDEM Insert und Update (auch wenn nur
--      `vote` geaendert wird), damit ein Daumen auf ein schon entschiedenes
--      Rezept nicht mehr geaendert werden kann.
--   4. View recipe_vote_stats: Daumen-Zahlen je Rezept in Pruefung, ohne
--      Athlet-ID, nur fuer authenticated.
--
-- UNVERAENDERT: kein DELETE fuer Athleten (ein Daumen wird geaendert, nicht
--   entfernt). Der Dienst loescht beim Aendern eines offenen Rezepts alle Daumen
--   dazu (S1-10, admin-api) -- der Trigger greift nur bei INSERT/UPDATE.
--
-- WENN EIN REZEPT DIE PRUEFUNG VERLAESST: Die Zeilen bleiben (Nachvollziehbarkeit
--   fuer den Admin), die View blendet das Rezept aus (sie joint auf pending).
--
-- REIHENFOLGE beim Rollout: Migration VOR dem admin-api-Image von B4. Ohne sie
--   lehnt der Dienst Freigeben/Ablehnen sauber ab (Audit-Log nicht schreibbar).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit-Aktionen
-- ------------------------------------------------------------
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_check
  check (action in (
    'ban', 'unban', 'delete', 'resend_invite', 'resend_recovery',
    'verify_author', 'unverify_author',
    'approve_recipe', 'reject_recipe'
  ));

-- ------------------------------------------------------------
-- 2. Lesen: eigene Zeile, der Admin alle
-- ------------------------------------------------------------
drop policy if exists "recipe_votes_select_all" on public.recipe_votes;
drop policy if exists "recipe_votes_select_own_or_admin" on public.recipe_votes;
create policy "recipe_votes_select_own_or_admin"
  on public.recipe_votes for select to authenticated
  using (athlete_id = (select auth.uid()) or public.is_admin());

-- ------------------------------------------------------------
-- 3. Trigger: nur Rezepte in Pruefung, nicht das eigene
-- ------------------------------------------------------------
-- security definer, damit der Trigger das Rezept unabhaengig von dessen
-- Lese-Policies sieht. Wird nur vom Trigger aufgerufen, nie direkt.
create or replace function public.recipe_votes_check_rules()
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

  if v_status is distinct from 'pending' then
    raise exception 'recipe_votes: only recipes in review can get a thumb';
  end if;

  if v_submitted_by is not null and v_submitted_by = new.athlete_id then
    raise exception 'recipe_votes: you cannot vote on your own recipe';
  end if;

  return new;
end;
$$;

-- Supabase vergibt EXECUTE ueber die Default-Privileges direkt an anon/authenticated;
-- "from public" allein nimmt es ihnen nicht (s. Revoke in 0071 und 0075).
revoke all on function public.recipe_votes_check_rules() from public, anon, authenticated;
grant execute on function public.recipe_votes_check_rules() to service_role;

drop trigger if exists recipe_votes_check_rules on public.recipe_votes;
create trigger recipe_votes_check_rules
  before insert or update on public.recipe_votes
  for each row execute function public.recipe_votes_check_rules();

-- ------------------------------------------------------------
-- 4. View: Daumen-Zahlen je Rezept in Pruefung, ohne Athlet-ID
-- ------------------------------------------------------------
-- security_invoker = off: die View liest die Basistabelle mit den Rechten des
-- Besitzers und umgeht damit die "nur eigene Zeile"-Policy -- sie gibt aber nur
-- Zahlen heraus. Rezepte ohne Daumen tauchen nicht auf (die App zeigt 0 und 0).
create or replace view public.recipe_vote_stats
with (security_invoker = off) as
  select rv.recipe_id,
         count(*) filter (where rv.vote = 'up')::integer   as up_count,
         count(*) filter (where rv.vote = 'down')::integer as down_count
    from public.recipe_votes rv
    join public.recipes r on r.id = rv.recipe_id and r.status = 'pending'
   group by rv.recipe_id;

comment on view public.recipe_vote_stats is
  'Fahrplan 30 B4: Daumen hoch/runter je Rezept in Pruefung (up_count, down_count). '
  'Keine Athlet-ID, keine Einzelwerte. Nur authenticated.';

revoke all on public.recipe_vote_stats from public, anon, authenticated;
grant select on public.recipe_vote_stats to authenticated, service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
