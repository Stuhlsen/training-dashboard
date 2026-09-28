-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0058: recipes (shared library)
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
-- CHECK-CONSTRAINTS (Dokumentation fuer den Review):
--   source in ('own','spoonacular','athlete') — erweiterbar per
--     Kommentar + App-Types-Ergaenzung, siehe Tabellenkommentar
--   status in ('pending','approved','rejected'), default 'approved'
--   submitted_by ⇔ source = 'athlete' (beide Richtungen erzwungen):
--     (source <> 'athlete' OR submitted_by IS NOT NULL)
--     AND (source = 'athlete' OR submitted_by IS NULL)
--   source = 'athlete' ⇒ status = 'pending' bei INSERT:
--     (source <> 'athlete' OR status = 'pending')
--     — Admin approval erfolgt per UPDATE, nicht per INSERT.
--   status = 'rejected' ⇒ rejection_reason NOT NULL:
--     (status <> 'rejected' OR rejection_reason IS NOT NULL)
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
  submitted_by      uuid references public.profiles(id) on delete set null,
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
  constraint recipes_submitted_by_athlete_check
    check ((source <> 'athlete' or submitted_by is not null)
       and (source = 'athlete' or submitted_by is null)),
  -- source = 'athlete' ⇒ status = 'pending' bei INSERT
  constraint recipes_athlete_pending_check
    check (source <> 'athlete' or status = 'pending'),
  -- rejection erfordert Grund
  constraint recipes_rejection_reason_check
    check (status <> 'rejected' or rejection_reason is not null)
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

-- updated_at trigger
drop trigger if exists recipes_set_updated_at on public.recipes;
create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- migrate:down

drop trigger if exists recipes_set_updated_at on public.recipes;
drop table if exists public.recipes;