-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0069: recipes — Service-Rolle darf Inhalt aendern
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-25-ernaehrung-ausbau.md — S1b (S1-10, S1-12)
--
-- PROBLEM: Der Trigger recipes_check_content_update (0062) verlangt bei
-- Inhaltsaenderungen old.submitted_by = auth.uid(). Der admin-api-Dienst
-- schreibt mit dem Service-Key; der hat kein 'sub' (auth.uid() = NULL) und
-- scheitert damit an "only the submitter may modify content fields".
-- PUT /api/recipes/:id kann also nicht funktionieren.
--
-- AENDERUNG (nur das):
--   Die Einreicher-Pruefung entfaellt fuer auth.role() = 'service_role'.
--   Der Dienst prueft Besitz und Status selbst (nur eigenes pending-Rezept).
--
-- UNVERAENDERT:
--   * E18-Statusregel: Inhalt aendern nur bei old.status = 'pending' —
--     gilt weiter fuer ALLE Rollen inkl. service_role (der Seed-Test
--     "geaenderter Inhalt an freigegebenem Rezept wird abgelehnt" bleibt gueltig).
--   * E16: status/rejection_reason nur Admin oder service_role.
--   * Athleten und Admins ueber PostgREST: gleiches Verhalten wie zuvor.
--
-- NICHT TEIL DIESER MIGRATION (S1-12): die RLS-Sperre fuer direkte
-- Athleten-Writes auf recipes. Sie kommt als eigene Migration nach S2.
-- ============================================================

create or replace function public.recipes_check_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Pruefen, ob irgendein Inhaltsfeld geaendert wurde (E18)
  if new.title is distinct from old.title
     or new.ingredients is distinct from old.ingredients
     or new.instructions is distinct from old.instructions
     or new.contains_tags is distinct from old.contains_tags
     or new.meal_type is distinct from old.meal_type
     or new.diet_tags is distinct from old.diet_tags
     or new.servings is distinct from old.servings
     or new.nutrition is distinct from old.nutrition
     or new.image_url is distinct from old.image_url
  then
    if old.status is distinct from 'pending' then
      raise exception 'E18: content fields can only be modified while recipe status = pending';
    end if;
    -- Service-Rolle (admin-api) hat kein sub und prueft den Einreicher selbst.
    if auth.role() <> 'service_role'
       and old.submitted_by is distinct from auth.uid() then
      raise exception 'E18: only the submitter may modify content fields';
    end if;
  end if;

  -- Status und rejection_reason: nur admin oder service_role darf aendern (E16)
  if new.status is distinct from old.status
     or new.rejection_reason is distinct from old.rejection_reason
  then
    if not public.is_admin() and auth.role() <> 'service_role' then
      raise exception 'E16: only admin or service_role may change status or rejection_reason';
    end if;
  end if;

  return new;
end;
$$;

-- Der Trigger aus 0062 bleibt gebunden: create or replace behaelt die
-- Funktions-OID.

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
