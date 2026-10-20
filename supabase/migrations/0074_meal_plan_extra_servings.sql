-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0074: Gaeste-Portionen am Plan-Eintrag
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-30-bewertung-zeit-portionen.md — B2 (P-1, P-2)
--
-- ZIEL
--   meal_plan_entries.extra_servings: Portionen fuer Besuch, zusaetzlich zu
--   servings (den eigenen Portionen des Athleten). Sie zaehlen fuer Kochmenge
--   und Einkaufsliste, NICHT fuer die Naehrwerte des Athleten (kcal, Eiweiss
--   rechnen weiter nur mit servings).
--
-- WERTEBEREICH
--   numeric, not null, default 0, 0..20. Obergrenze grosszuegig ueber der
--   App-Grenze fuer die Gesamtportionen (12), damit die App sie spaeter
--   anheben kann, ohne die Datenbank anzufassen.
--
-- RLS / GRANTS
--   Keine Aenderung: neue Spalte einer Tabelle, deren Policies (0064) zeilen-,
--   nicht spaltenbezogen sind; Grants gelten tabellenweit.
-- ============================================================

alter table public.meal_plan_entries
  add column if not exists extra_servings numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'meal_plan_entries_extra_servings_range'
      and conrelid = 'public.meal_plan_entries'::regclass
  ) then
    alter table public.meal_plan_entries
      add constraint meal_plan_entries_extra_servings_range
      check (extra_servings >= 0 and extra_servings <= 20);
  end if;
end
$$;

comment on column public.meal_plan_entries.extra_servings is
  'Gaeste-Portionen (zusaetzlich zu servings). Zaehlen fuer Kochmenge und '
  'Einkaufsliste, nicht fuer die Naehrwerte des Athleten. 0..20, Standard 0.';

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
