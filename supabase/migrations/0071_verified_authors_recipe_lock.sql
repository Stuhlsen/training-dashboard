-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0071: verifizierte Autoren + RLS-Sperre fuer Rezepte
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-29-verifizierte-athleten.md — V1
--           (V-2 .. V-5) und planning/fahrplan-25-ernaehrung-ausbau.md S1-12
--
-- ZIEL
--   1. Der Admin kennzeichnet Athleten als "verifizierter Autor"
--      (profiles.is_verified_author). Nur der Dienst (service_role) setzt die Spalte.
--   2. Rezepte verifizierter Autoren duerfen vom Dienst sofort als 'approved'
--      eingefuegt werden (V-3) und eigene freigegebene Rezepte duerfen vom
--      Dienst geaendert werden (V-4).
--   3. Athleten koennen recipes NICHT mehr direkt schreiben (S1-12): die
--      INSERT- und die Inhalts-UPDATE-Policy fuer 'authenticated' entfallen.
--      Der einzige Schreibpfad ist admin-api (service_role).
--
-- UNVERAENDERT
--   * SELECT-Policies (approved/pending fuer alle, rejected fuer Einreicher/Admin).
--   * Admin: Status-Update und Loeschen ueber die bestehenden Policies.
--   * E16: status/rejection_reason nur Admin oder service_role.
--   * E18 fuer alle anderen Faelle: Inhalt aendern nur bei 'pending'.
--   * Seeds (Datenbank-Owner / service_role, source = 'own') sind nicht betroffen.
--
-- ENTZUG (V-5): Wird die Verifizierung entzogen, bleiben freigegebene Rezepte
--   'approved'. Weil die Pruefung bei jedem Schreibzugriff neu laeuft, kann der
--   Dienst sie danach nicht mehr aendern; nur der Admin.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Spalte + Rechte
-- ------------------------------------------------------------
alter table public.profiles
  add column if not exists is_verified_author boolean not null default false;

comment on column public.profiles.is_verified_author is
  'Fahrplan 29: Admin-gesetzt. Verifizierte Autoren veroeffentlichen Rezepte ohne Admin-Freigabe (sofort approved) und duerfen eigene freigegebene Rezepte aendern. Schreiben nur service_role.';

-- authenticated bekommt bewusst KEIN Spaltenrecht (weder select noch update): Ein Athlet
-- kann das Flag weder setzen noch an der Basistabelle lesen; lesen geht ueber profiles_visible.
grant select (is_verified_author), update (is_verified_author)
  on public.profiles to service_role;

-- ------------------------------------------------------------
-- 2. Hilfsfunktion: ist dieses Profil ein verifizierter Autor?
-- ------------------------------------------------------------
-- security definer, damit die Trigger-Funktionen keine Spaltenrechte auf profiles
-- brauchen. Nur der Dienst darf sie aufrufen; unbekannte/NULL-Profile -> false.
create or replace function public.is_verified_author(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_verified_author from public.profiles p where p.id = p_profile_id),
    false
  );
$$;

-- anon/authenticated ausdruecklich: Supabase vergibt EXECUTE ueber die Default-Privileges
-- direkt an diese Rollen, "from public" allein nimmt es ihnen nicht.
revoke all on function public.is_verified_author(uuid) from public, anon, authenticated;
grant execute on function public.is_verified_author(uuid) to service_role;

-- ------------------------------------------------------------
-- 3. profiles_visible: Spalte ans ENDE (create or replace view verlangt das)
-- ------------------------------------------------------------
-- Der Athlet liest seinen eigenen Status; ein Coach sieht ihn bei seinen Athleten.
create or replace view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at,
         ftp_public, plan_offset_weeks, sports,
         is_verified_author
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

-- ------------------------------------------------------------
-- 4. BEFORE INSERT: Sofort-Freigabe nur Dienst + verifizierter Einreicher (V-3)
-- ------------------------------------------------------------
create or replace function public.recipes_set_athlete_pending()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'athlete' and new.status is distinct from 'pending' then
    -- Verschachtelt statt "and": die Reihenfolge der Pruefungen ist so garantiert.
    if new.status = 'approved' and auth.role() = 'service_role' then
      if public.is_verified_author(new.submitted_by) then
        return new;
      end if;
    end if;
    raise exception 'athlete-submitted recipes must have status = ''pending'' at insert time (use UPDATE for approval)';
  end if;
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. BEFORE UPDATE: Inhalt bei 'approved' nur Dienst + verifizierter Einreicher (V-4)
-- ------------------------------------------------------------
create or replace function public.recipes_check_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
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
      -- Ausnahme V-4: nur der Dienst und nur fuer das freigegebene Rezept eines
      -- (noch) verifizierten Autors. Alles andere bleibt E18.
      if old.status = 'approved' and auth.role() = 'service_role' then
        if not public.is_verified_author(old.submitted_by) then
          raise exception 'E18: content fields can only be modified while recipe status = pending';
        end if;
      else
        raise exception 'E18: content fields can only be modified while recipe status = pending';
      end if;
    end if;
    if auth.role() <> 'service_role'
       and old.submitted_by is distinct from auth.uid() then
      raise exception 'E18: only the submitter may modify content fields';
    end if;
  end if;

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

-- ------------------------------------------------------------
-- 6. RLS-Sperre (S1-12): Athleten schreiben recipes nicht mehr direkt
-- ------------------------------------------------------------
drop policy if exists "recipes_insert_athlete_pending" on public.recipes;
drop policy if exists "recipes_update_own_pending_content" on public.recipes;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
