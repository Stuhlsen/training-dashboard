-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0060: recipes (shared library)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack.
-- Referenz: planning/fahrplan-23-ernaehrung.md — Etappe E0, E14–E20
--
-- ZWECK: Shared-Recipe-Library fuer das Ernaehrungs-Feature (Idea 4).
-- Rezepte sind keinem Athleten allein zugeordnet (keine owner-RLS,
-- ausser submissions tragen submitted_by). RLS-Policies sind NICHT
-- Teil dieser Migration — sie kommen in einer eigenstaendigen
-- Folge-Migration.
--
-- CHECK-CONSTRAINTS und TRIGGER (Dokumentation fuer den Review):
--   source in ('own','spoonacular','athlete') — erweiterbar per
--     Kommentar + App-Types-Ergaenzung, siehe Tabellenkommentar
--   status in ('pending','approved','rejected'), default 'approved'
--   submitted_by ⇔ source = 'athlete' (beide Richtungen erzwungen):
--     (source <> 'athlete' OR submitted_by IS NOT NULL)
--     AND (source = 'athlete' OR submitted_by IS NULL)
--   source = 'athlete' ⇒ status = 'pending' bei INSERT:
--   Ein BEFORE-INSERT-Trigger (recipes_set_athlete_pending)
--     rejected (raise exception) bei source='athlete' AND status<>'pending'.
--     Der raise ist insert-time-only und blockiert nicht den spaeteren
--     Approval per UPDATE in E16 (Owner-Clarification im Issue).
--     Die langfristige Insert-time-Durchsetzung gehoert zusaetzlich
--     in die RLS-INSERT-Policy von Issue #16.
--   rejection_reason: bewusst KEIN Constraint — laut E17 ist ein
--     Grund optional ("optionaler kurzer Grund"), siehe Owner-
--     Clarification im Issue.
--   meal_type: jedes Element einer der vier Werte
--   diet_tags / contains_tags: jedes Element aus dem erlaubten Set
--   contains_tags = '{}' (Default, nicht nullable):
--     "unremarkable" (keine Exclusion downstream)
--   servings default 2 (uebliche Portionsgroesse einer geteilten
--     Rezeptur)
-- ============================================================

create table if not exists public.recipes (
  id                uuid primary key default gen_random_uuid(),
  source            text not null check (source in ('own','spoonacular','athlete')),
  external_id       text,
  -- ON DELETE RESTRICT: ein Profil, das Athleten-Rezepte eingereicht hat,
  -- kann nicht geloescht werden, ohne dass diese Rezepte vorher geloescht
  -- oder submitted_by angepasst werden. Das bewahrt die Invariante
  -- (source <> 'athlete' or submitted_by is not null) bei Account-Loeschung
  -- (Migration 0021 — admin loescht auth.users, profiles cascaded).
  -- Der manuelle Admin-Loeschprozess muss daher ggf. Rezepte vor dem Loeschen
  -- des Kontos aufraeumen (umsetzen/loeschen). ON DELETE SET NULL wuerde
  -- die Invariante brechen und die gesamte Loesch-Transaktion abbrechen.
  submitted_by      uuid references public.profiles(id) on delete restrict,
  status            text not null default 'approved' check (status in ('pending','approved','rejected')),
  rejection_reason  text,
  title             text not null,
  meal_type         text[] not null check (meal_type <@ ARRAY['breakfast','lunch','dinner','snack']::text[]),
  diet_tags         text[] check (diet_tags <@ ARRAY['veg','vegan','glutenfrei','omnivor']::text[]),
  contains_tags     text[] not null default '{}' check (contains_tags <@ ARRAY['gluten','crustaceans','eggs','fish','peanuts','soybeans','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs','sonstiges']::text[]),
  servings          int not null default 2,
  ingredients       jsonb,
  instructions      jsonb,
  nutrition         jsonb,
  image_url         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- submitted_by ⇔ source = 'athlete' (beide Richtungen)
  -- Normales CHECK-Constraint: beide Richtungen sind invariante
  -- Geschaeftsregeln, keine insert-time-Besonderheit.
  constraint recipes_submitted_by_athlete_check
    check ((source <> 'athlete' or submitted_by is not null)
       and (source = 'athlete' or submitted_by is null))
);

comment on table public.recipes is
  'Shared recipe library (Idea 4, Ernaehrung). '
  'Source is extensible (check constraint plus app types). '
  'ingredients JSONB shape: [{"name": string, "amount": number, "unit": string, "category": string}] '
  'instructions JSONB shape: [{"text": string, "timerSeconds?": number}] '
  'nutrition JSONB shape: {"kcal": number, "protein": number, "carbs": number, "fat": number} per portion';

alter table public.recipes enable row level security;

-- Index: approved recipes for weekly-view pool
create index if not exists recipes_status_idx on public.recipes (status);
-- Index: Spoonacular dedup (partial, nur Zeilen mit external_id)
create index if not exists recipes_external_id_idx on public.recipes (external_id)
  where external_id is not null;

-- ---------------------------------------------------------------
-- BEFORE-INSERT-Trigger: source='athlete' ⇒ status='pending'
-- Bei source='athlete' AND status<>'pending' wird der Insert
-- mit einem Fehler abgewiesen (raise exception).
-- Grund fuer raise statt Normalisierung:
--   Ein Absender, der explizit status='approved' setzt, macht einen
--   App-Fehler oder ehrlichen Irrtum — die sichere Reaktion ist, den
--   Vorgang abzulehnen, damit der Fehler nicht unbemerkt bleibt.
--   Der Admin genehmigt spaeter per UPDATE (E16), was den Check
--   nicht blockieren darf — deshalb ist dies ein Trigger und kein
--   table-wide CHECK-Constraint (Owner-Clarification im Issue).
--   Die echte Sicherheitsgrenze liegt zusaetzlich in der RLS-INSERT-
--   Policy von Issue #16.
-- ---------------------------------------------------------------
create or replace function public.recipes_set_athlete_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'athlete' and new.status is distinct from 'pending' then
    raise exception 'athlete-submitted recipes must have status = ''pending'' at insert time (use UPDATE for approval)';
  end if;
  return new;
end;
$$;

drop trigger if exists recipes_set_athlete_pending on public.recipes;
create trigger recipes_set_athlete_pending
  before insert on public.recipes
  for each row execute function public.recipes_set_athlete_pending();

-- updated_at trigger
drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- migrate:down

drop trigger if exists recipes_set_athlete_pending on public.recipes;
drop function if exists public.recipes_set_athlete_pending();
drop trigger if exists recipes_set_updated_at on public.recipes;
drop table if exists public.recipes;
