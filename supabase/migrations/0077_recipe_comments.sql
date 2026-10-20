-- migrate:up

-- ============================================================
-- Dashboard 2.0 -- Migration 0077: Kommentare zu Rezepten, Daumen auf Kommentare
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion -- NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-30-bewertung-zeit-portionen.md -- B5 (K-1 bis K-4)
--
-- ZWECK: Angemeldete Athleten schreiben Kommentare zu Rezepten in Pruefung und zu
--   freigegebenen Rezepten, damit Verbesserungen sichtbar werden. Kommentare
--   bekommen ihrerseits Daumen hoch oder runter. Sterne (recipe_ratings, 0075) und
--   Daumen auf Rezepte (recipe_votes, 0076) bleiben unveraendert.
--
-- REGELN (alle in der Datenbank, nicht nur in der App)
--   * Mehrere Kommentare je Athlet und Rezept. Nur Text, 1..500 Zeichen, nicht nur
--     Leerraum (CHECK). Kein HTML-Filter: die App zeigt den Text immer als Text.
--   * Nur auf Rezepte mit status pending oder approved (Trigger). Auch auf das
--     eigene Rezept (Antworten auf Kritik).
--   * Schreiben nur mit gesetztem Pseudonym: profiles.display_name darf nicht leer
--     sein und nicht dem Teil der eigenen E-Mail vor dem @ gleichen (so setzt 0001
--     den Namen, wenn bei der Anmeldung keiner angegeben wird). Sonst koennte eine
--     E-Mail-Adresse oeffentlich als Autorname auftauchen.
--   * Kein Aendern: ein Kommentar wird geloescht und neu geschrieben (kein UPDATE-Grant).
--   * Loeschen: der Schreiber den eigenen Kommentar (Policy), der Admin jeden ueber
--     die admin-api (service_role, mit Audit-Eintrag delete_recipe_comment).
--   * Daumen auf Kommentare: ein Daumen je Athlet und Kommentar, aenderbar, nie
--     zurueckzunehmen (wie 0076). Nicht auf den eigenen Kommentar. Nur solange das
--     Rezept pending oder approved ist.
--
-- LESEN: Fremde Athlet-IDs und fremde Einzel-Daumen gehen NIE nach aussen.
--   * Basistabellen: nur die eigene Zeile (Kommentare: der Admin alle).
--   * Die Anzeige liest die View recipe_comment_feed: Kommentar, Pseudonym, Zahlen,
--     "ist meiner" und der eigene Daumen -- ohne Athlet-ID. anon: nichts.
--
-- FK on delete cascade: Rezept oder Athlet weg -> Kommentare und Daumen verschwinden mit.
-- WENN EIN REZEPT ABGELEHNT WIRD: die Zeilen bleiben, die View blendet sie aus.
--
-- REIHENFOLGE beim Rollout: Migration VOR dem admin-api-Image von B5. Ohne sie
--   lehnt der Dienst das Loeschen sauber ab (Audit-Log nicht schreibbar).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Audit-Aktion
-- ------------------------------------------------------------
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_check
  check (action in (
    'ban', 'unban', 'delete', 'resend_invite', 'resend_recovery',
    'verify_author', 'unverify_author',
    'approve_recipe', 'reject_recipe',
    'delete_recipe_comment'
  ));

-- ------------------------------------------------------------
-- 2. recipe_comments
-- ------------------------------------------------------------
create table if not exists public.recipe_comments (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),

  constraint recipe_comments_body_length check (char_length(body) <= 500),
  constraint recipe_comments_body_not_blank check (body !~ '^\s*$')
);

comment on table public.recipe_comments is
  'Fahrplan 30 B5: Kommentare zu Rezepten in Pruefung und freigegebenen Rezepten. Nur Text (1-500 Zeichen), '
  'mehrere je Athlet und Rezept. Nur lesbar fuer den Schreiber und den Admin; die Anzeige nutzt die View '
  'recipe_comment_feed (ohne Athlet-ID).';

create index if not exists recipe_comments_recipe_idx on public.recipe_comments (recipe_id, created_at);
create index if not exists recipe_comments_athlete_idx on public.recipe_comments (athlete_id);

alter table public.recipe_comments enable row level security;

drop policy if exists "recipe_comments_select_own_or_admin" on public.recipe_comments;
create policy "recipe_comments_select_own_or_admin"
  on public.recipe_comments for select to authenticated
  using (athlete_id = (select auth.uid()) or public.is_admin());

drop policy if exists "recipe_comments_insert_own" on public.recipe_comments;
create policy "recipe_comments_insert_own"
  on public.recipe_comments for insert to authenticated
  with check (athlete_id = (select auth.uid()));

drop policy if exists "recipe_comments_delete_own" on public.recipe_comments;
create policy "recipe_comments_delete_own"
  on public.recipe_comments for delete to authenticated
  using (athlete_id = (select auth.uid()));

-- ------------------------------------------------------------
-- 3. Trigger recipe_comments: Rezept offen oder freigegeben, Pseudonym gesetzt
-- ------------------------------------------------------------
-- security definer, damit der Trigger Rezept und Profil unabhaengig von deren
-- Lese-Policies sieht. Wird nur vom Trigger aufgerufen, nie direkt.
-- auth.jwt() liefert die E-Mail des Aufrufers; fehlt sie (service_role), entfaellt
-- nur der E-Mail-Vergleich -- ein leerer Name wird immer abgelehnt.
create or replace function public.recipe_comments_check_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status      text;
  v_name        text;
  v_email_local text;
begin
  select r.status into v_status from public.recipes r where r.id = new.recipe_id;
  if v_status is null or v_status not in ('pending', 'approved') then
    raise exception 'recipe_comments: only recipes in review or approved recipes can be commented';
  end if;

  select p.display_name into v_name from public.profiles p where p.id = new.athlete_id;
  v_email_local := lower(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1));
  if v_name is null
     or btrim(v_name) = ''
     or (v_email_local <> '' and lower(btrim(v_name)) = v_email_local) then
    raise exception 'recipe_comments: set a display name (pseudonym) in the settings first';
  end if;

  return new;
end;
$$;

-- Supabase vergibt EXECUTE ueber die Default-Privileges direkt an anon/authenticated;
-- "from public" allein nimmt es ihnen nicht (s. Revoke in 0071, 0075, 0076).
revoke all on function public.recipe_comments_check_rules() from public, anon, authenticated;
grant execute on function public.recipe_comments_check_rules() to service_role;

drop trigger if exists recipe_comments_check_rules on public.recipe_comments;
create trigger recipe_comments_check_rules
  before insert on public.recipe_comments
  for each row execute function public.recipe_comments_check_rules();

-- ------------------------------------------------------------
-- 4. recipe_comment_votes
-- ------------------------------------------------------------
create table if not exists public.recipe_comment_votes (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.recipe_comments(id) on delete cascade,
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  vote        text not null check (vote in ('up', 'down')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint recipe_comment_votes_unique unique (comment_id, athlete_id)
);

comment on table public.recipe_comment_votes is
  'Fahrplan 30 B5: Daumen hoch/runter auf Kommentare. Eine Zeile je (comment_id, athlete_id), aenderbar, '
  'kein Loeschen. Nicht auf den eigenen Kommentar (Trigger). Einzelwerte nur dem Schreiber lesbar.';

create index if not exists recipe_comment_votes_athlete_idx on public.recipe_comment_votes (athlete_id);

alter table public.recipe_comment_votes enable row level security;

drop policy if exists "recipe_comment_votes_select_own" on public.recipe_comment_votes;
create policy "recipe_comment_votes_select_own"
  on public.recipe_comment_votes for select to authenticated
  using (athlete_id = (select auth.uid()));

drop policy if exists "recipe_comment_votes_insert_own" on public.recipe_comment_votes;
create policy "recipe_comment_votes_insert_own"
  on public.recipe_comment_votes for insert to authenticated
  with check (athlete_id = (select auth.uid()));

drop policy if exists "recipe_comment_votes_update_own" on public.recipe_comment_votes;
create policy "recipe_comment_votes_update_own"
  on public.recipe_comment_votes for update to authenticated
  using (athlete_id = (select auth.uid()))
  with check (athlete_id = (select auth.uid()));

-- Trigger: nicht der eigene Kommentar, Rezept noch offen oder freigegeben.
-- Feuert bei JEDEM Insert und Update (auch ein reiner Wechsel von up zu down),
-- damit sich Daumen unter abgelehnten Rezepten nicht mehr aendern.
create or replace function public.recipe_comment_votes_check_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_status text;
begin
  select c.athlete_id, r.status
    into v_author, v_status
    from public.recipe_comments c
    join public.recipes r on r.id = c.recipe_id
   where c.id = new.comment_id;

  if v_status is null or v_status not in ('pending', 'approved') then
    raise exception 'recipe_comment_votes: the comment is not open for thumbs';
  end if;

  if v_author = new.athlete_id then
    raise exception 'recipe_comment_votes: you cannot vote on your own comment';
  end if;

  return new;
end;
$$;

revoke all on function public.recipe_comment_votes_check_rules() from public, anon, authenticated;
grant execute on function public.recipe_comment_votes_check_rules() to service_role;

drop trigger if exists recipe_comment_votes_check_rules on public.recipe_comment_votes;
create trigger recipe_comment_votes_check_rules
  before insert or update on public.recipe_comment_votes
  for each row execute function public.recipe_comment_votes_check_rules();

-- updated_at (set_updated_at() aus 0003_wellbeing.sql)
drop trigger if exists recipe_comment_votes_set_updated_at on public.recipe_comment_votes;
create trigger recipe_comment_votes_set_updated_at
  before update on public.recipe_comment_votes
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. View: Kommentare mit Pseudonym und Zahlen, ohne Athlet-ID
-- ------------------------------------------------------------
-- security_invoker = off: die View liest die Basistabellen mit den Rechten des
-- Besitzers und umgeht damit die "nur eigene Zeile"-Policies. Sie gibt aber nie eine
-- Athlet-ID heraus: der Autor erscheint nur als Pseudonym (display_name; leer ->
-- "Athlet"), die eigene Zugehoerigkeit als is_mine, der eigene Daumen als my_vote.
-- Nur Kommentare zu Rezepten in Pruefung oder freigegebenen. Ohne Anmeldung leer.
create or replace view public.recipe_comment_feed
with (security_invoker = off) as
  select c.id,
         c.recipe_id,
         coalesce(nullif(btrim(p.display_name), ''), 'Athlet')   as author_name,
         (c.athlete_id = (select auth.uid()))                    as is_mine,
         c.body,
         c.created_at,
         (select count(*) from public.recipe_comment_votes v
           where v.comment_id = c.id and v.vote = 'up')::integer   as up_count,
         (select count(*) from public.recipe_comment_votes v
           where v.comment_id = c.id and v.vote = 'down')::integer as down_count,
         (select v.vote from public.recipe_comment_votes v
           where v.comment_id = c.id and v.athlete_id = (select auth.uid())) as my_vote
    from public.recipe_comments c
    join public.recipes r on r.id = c.recipe_id and r.status in ('pending', 'approved')
    left join public.profiles p on p.id = c.athlete_id
   where (select auth.uid()) is not null;

comment on view public.recipe_comment_feed is
  'Fahrplan 30 B5: Kommentare zu Rezepten in Pruefung und freigegebenen Rezepten mit Pseudonym (author_name), '
  'Daumen-Zahlen, is_mine und my_vote. Keine Athlet-ID. Nur authenticated.';

revoke all on public.recipe_comment_feed from public, anon, authenticated;
grant select on public.recipe_comment_feed to authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Tabellen-Grants
-- ------------------------------------------------------------
-- Kommentare: lesen, anlegen, eigene loeschen -- kein UPDATE.
revoke all on public.recipe_comments from public, anon;
grant select, insert, delete on public.recipe_comments to authenticated;
grant all on public.recipe_comments to service_role;

-- Daumen: lesen, anlegen, aendern -- kein DELETE.
revoke all on public.recipe_comment_votes from public, anon;
grant select, insert, update on public.recipe_comment_votes to authenticated;
grant all on public.recipe_comment_votes to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
