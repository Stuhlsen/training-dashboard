-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0066: recipes.external_id eindeutig
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-23-ernaehrung.md — Etappe E3 (Seed eigener
--           Rezepte), spaeter E4 (Spoonacular-Sync)
--
-- BEFUND: scripts/seed-own-recipes.js schreibt per Upsert
-- (PostgREST on_conflict=external_id, Prefer resolution=merge-duplicates).
-- Dafuer verlangt PostgreSQL eine EINDEUTIGE Bedingung auf external_id.
-- Migration 0060 hat dort nur einen normalen Teil-Index
-- (recipes_external_id_idx, where external_id is not null) — der Upsert
-- scheiterte mit 42P10 ("no unique or exclusion constraint matching the
-- ON CONFLICT specification"). Ein Teil-Index reicht auch dann nicht, weil
-- PostgREST kein Index-Praedikat im Konfliktziel mitgeben kann.
--
-- LOESUNG: voller UNIQUE-Constraint auf external_id. NULL-Werte bleiben
-- mehrfach erlaubt (Athleten-Rezepte und eigene Rezepte ohne Quelle haben
-- keine external_id). Der Constraint legt seinen eigenen eindeutigen Index
-- an; der alte Teil-Index ist damit ueberfluessig und entfaellt.
--
-- Idempotent: der Constraint wird nur angelegt, wenn er fehlt.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recipes_external_id_key'
      and conrelid = 'public.recipes'::regclass
  ) then
    alter table public.recipes
      add constraint recipes_external_id_key unique (external_id);
  end if;
end
$$;

drop index if exists public.recipes_external_id_idx;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
