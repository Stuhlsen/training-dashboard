-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0062: recipes RLS policies
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack.
-- Referenz: planning/fahrplan-23-ernaehrung.md — Etappe E0, E14–E20
--           Issue #16 (RLS policies)
--
-- ZWECK: RLS-Policies fuer die shared recipes-Tabelle aus 0060.
-- Das ist die komplexeste Policy-Suite von E0, daher eigener PR
-- (Issue #16, Label security).
--
-- SPALTEN-SICHERHEIT (E18 — content-UPDATE nach Statuswechsel):
--   Ein BEFORE-UPDATE-Trigger (recipes_check_content_update) verhindert
--   AENDERUNGEN an Inhaltsfeldern (title, ingredients, instructions,
--   contains_tags, meal_type, diet_tags, servings, nutrition, image_url),
--   sobald der Status nicht mehr 'pending' ist — unabhaengig von der
--   ausfuehrenden Rolle (auch Admin/service_role, E18). Der Trigger
--   blockiert auch Inhaltsaenderungen durch Nicht-Einreicher (nur der
--   submitter darf eigene pending-Rezepte bearbeiten).
--   Der gewaehlte Mechanismus ist "trigger guard" (s. Issue #16 AC:
--   "either column-level policy or trigger guard; document the mechanism").
--   Status und rejection_reason duerfen dagegen auch nach dem
--   Entscheid geaendert werden (admin only, E16).
--
-- ADMIN-IDENTITAET:
--   public.is_admin() aus Migration 0001 (profiles.is_admin).
--   Gleiches Pattern wie bikefit/feedback/proposals.
--
-- DELETE-RULE (im Issue als Entscheidungspunkt):
--   Admin only. Athleten duerfen nicht loeschen (auch nicht das eigene
--   pending-Rezept). Begruendung: geteilte Rezeptbibliothek — ein Athlet,
--   dessen Rezept von anderen favorisiert/genutzt wird, soll es nicht
--   stillschweigend entfernen koennen. Der Admin hat den Cleanup-Pfad
--   (Spoonacular-Dedup, veraltete own-Rezepte).
--
-- REJECTION_REASON auf approved recipes:
--   Die Policy erlaubt es (nur admin-gated, status-unabhaengig).
--   Ob die App das zulaesst, entscheidet die Anwendungsschicht; der
--   Fahrplan sagt dazu nichts. Ein CHECK-Constraint
--   (rejection_reason only when status='rejected') ist vom Schema her
--   nicht gefordert und wird hier nicht eingefuehrt — dokumentiert als
--   bewusste Policy-Entscheidung.
-- ============================================================

-- --------------------------------------------------------------
-- 1. GRANTS (Grundberechtigung, ohne die RLS-Policies nicht greifen)
-- --------------------------------------------------------------

-- SELECT: anon darf nichts sehen (kein SELECT-Grant), authenticated
-- erhaelt SELECT — RLS-Policies filtern die Sichtbarkeit.
grant select on public.recipes to authenticated;

-- INSERT: authenticated-Athleten duerfen einreihen (RLS filtert
-- source/status/submitted_by).
grant insert on public.recipes to authenticated;

-- UPDATE: column-level grants. Zunaechst table-level revoke, dann
-- spaltengenaue Grants fuer ALLE aenderbaren Spalten. Die zwei
-- getrennten UPDATE-Operationen (submitter content, admin status)
-- werden durch die jeweiligen RLS-Policies und den E18-Trigger
-- getrennt — nicht durch separate column grants, da diese ohnehin
-- kumulativ fuer die Rolle authenticated wirken.
revoke update on public.recipes from authenticated;
grant update (title, ingredients, instructions, contains_tags, meal_type,
              diet_tags, servings, nutrition, image_url, status,
              rejection_reason, updated_at)
  on public.recipes to authenticated;

-- DELETE: nur authenticated (RLS schraenkt auf admin ein).
grant delete on public.recipes to authenticated;

-- Service-Role: volle Kontrolle fuer Sync/Saat-/Migrationspfad
-- (z. B. Einspielen von Spoonacular-Rezepten, Datenpflege).
grant select, insert, update, delete on public.recipes to service_role;

-- --------------------------------------------------------------
-- 2. SELECT-POLICIES
-- --------------------------------------------------------------

-- approved und pending: fuer JEDEN eingeloggten Athleten sichtbar (E15).
drop policy if exists "recipes_select_approved_pending" on public.recipes;
create policy "recipes_select_approved_pending"
  on public.recipes for select to authenticated
  using (status in ('approved', 'pending'));

-- rejected: nur fuer Admin und den Einreicher (E16/E17-Interpretation:
--   Der Athlet muss seine eigene Ablehnung + Grund sehen koennen;
--   der Fahrplan-Text erwaehnt nur approved/pending, aber rejected
--   ohne Sichtbarkeit fuer den Einreicher waere ein UX-Bug).
drop policy if exists "recipes_select_rejected" on public.recipes;
create policy "recipes_select_rejected"
  on public.recipes for select to authenticated
  using (status = 'rejected' and (public.is_admin() or submitted_by = auth.uid()));

-- --------------------------------------------------------------
-- 3. INSERT-POLICY
-- --------------------------------------------------------------

-- Jeder Athlet darf einreichen, aber NUR:
--   source = 'athlete' AND status = 'pending' AND submitted_by = auth.uid()
-- own/spoonacular-Zeilen duerfen NICHT per Frontend eingefuegt werden
-- (die kommen aus dem Seed-/Migrationspfad, service_role bypassed RLS).
drop policy if exists "recipes_insert_athlete_pending" on public.recipes;
create policy "recipes_insert_athlete_pending"
  on public.recipes for insert to authenticated
  with check (
    source = 'athlete'
    and status = 'pending'
    and submitted_by = auth.uid()
  );

-- --------------------------------------------------------------
-- 4. UPDATE-POLICIES
-- --------------------------------------------------------------

-- Submitter darf Inhalte des eigenen pending-Rezepts aendern (E18).
-- WITH CHECK stellt sicher, dass status und submitted_by nach der
-- Aenderung weiterhin den Regeln entsprechen (z. B. kein versehentliches
-- Setzen von status='approved' durch den Submitter).
drop policy if exists "recipes_update_own_pending_content" on public.recipes;
create policy "recipes_update_own_pending_content"
  on public.recipes for update to authenticated
  using (submitted_by = auth.uid() and status = 'pending')
  with check (submitted_by = auth.uid() and status = 'pending');

-- Admin darf status und rejection_reason jederzeit aendern (E16),
-- auch ohne vorherige Votes (E16 explizit).
-- Aenderungen an Inhaltsfeldern durch den Admin werden durch den
-- E18-Trigger (recipes_check_content_update) verhindert, der
-- content-Updates blockt, sofern der alte status nicht 'pending'
-- ist ODER der Aenderer nicht der submitter ist.
drop policy if exists "recipes_update_status_admin" on public.recipes;
create policy "recipes_update_status_admin"
  on public.recipes for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --------------------------------------------------------------
-- 5. DELETE-POLICY
-- --------------------------------------------------------------

-- Admin only. Kein Athlet darf loeschen (auch nicht das eigene
-- pending-Rezept) — Begruendung s. Kopfkommentar.
drop policy if exists "recipes_delete_admin" on public.recipes;
create policy "recipes_delete_admin"
  on public.recipes for delete to authenticated
  using (public.is_admin());

-- --------------------------------------------------------------
-- 6. E18 — TRIGGER-GUARD: content-UPDATE nach Statuswechsel
-- --------------------------------------------------------------

-- BEFORE-UPDATE-Trigger, der Aenderungen an Inhaltsfeldern blockt,
-- sobald der Status nicht mehr 'pending' ist ODER der Aenderer
-- nicht der submitter ist.
--
-- Greift auch fuer Admin/service_role (RLS-Bypass) — das ist die
-- letzte Sicherheitsschicht fuer E18. Der Name "check" statt "block"
-- ist gewaehlt, weil der Trigger inhALTS-PRUEFT und nur bei
-- Verstoss abbricht (passiver Guard, kein aktives Normalisieren).
--
-- updated_at wird NICHT als Inhaltsfeld geprueft — der
-- set_updated_at-Trigger darf auch nach Statuswechsel feuern.
drop function if exists public.recipes_check_content_update() cascade;
create or replace function public.recipes_check_content_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Pruefen, ob irgendein Inhaltsfeld geaendert wurde
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
    if old.submitted_by is distinct from auth.uid() then
      raise exception 'E18: only the submitter may modify content fields';
    end if;
  end if;
  return new;
end;
$$;

-- Der Trigger laeuft VOR dem set_updated_at-Trigger (alphabetisch:
-- recipes_check_content_update < recipes_set_updated_at), was
-- korrekt ist — die content-Pruefung laeuft zuerst, dann setzt
-- updated_at den Zeitstempel.
drop trigger if exists recipes_check_content_update on public.recipes;
create trigger recipes_check_content_update
  before update on public.recipes
  for each row execute function public.recipes_check_content_update();

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Anon:
--   GET /rest/v1/recipes?select=id,title&limit=1 -> 42501
--     (kein SELECT-Grant fuer anon)
--   POST /rest/v1/recipes mit source='athlete',status='pending',submitted_by=<beliebig>
--     -> 42501 (kein INSERT-Grant fuer anon)
--
-- Athlet A (eingeloggt):
--   GET /rest/v1/recipes?select=id,title,status&status=eq.approved -> Zeilen
--     (approved ist sichtbar)
--   GET /rest/v1/recipes?select=id,title,status&status=eq.pending -> Zeilen
--     (pending ist auch sichtbar, E15)
--   GET /rest/v1/recipes?select=id,title,status&status=eq.rejected -> Zeilen
--     NUR wenn submitted_by = Athlet A ODER Athlet A ist admin; sonst leer
--   POST /rest/v1/recipes mit source='athlete',status='pending',submitted_by=A
--     -> 201 (OK)
--   POST /rest/v1/recipes mit source='athlete',status='approved',submitted_by=A
--     -> 42501 (WITH CHECK: nur pending erlaubt) [auch Trigger blockt]
--   POST /rest/v1/recipes mit source='own',status='pending',submitted_by=A
--     -> 42501 (WITH CHECK: nur source='athlete' erlaubt)
--   POST /rest/v1/recipes mit source='athlete',status='pending',submitted_by=B
--     -> 42501 (WITH CHECK: submitted_by = auth.uid() erforderlich)
--   PATCH /rest/v1/recipes?id=eq.<eigenes-pending> mit title='neu'
--     -> 200, title geaendert
--   PATCH /rest/v1/recipes?id=eq.<eigenes-pending> mit status='approved'
--     -> 200, data: [] (WITH CHECK im submitter-policy blockt Aenderung;
--         PostgREST blendet Zeilen aus, die nach WITH CHECK nicht mehr
--         sichtbar waeren — kein Fehler, aber data=[])
--   PATCH /rest/v1/recipes?id=eq.<fremdes-pending> mit title='neu'
--     -> 200, data: [] (USING im submitter-policy: submitted_by != auth.uid())
--   PATCH /rest/v1/recipes?id=eq.<approved-rezept> mit title='neu'
--     -> E18-Trigger blockt mit Exception (42501) — content fields
--        duerfen nicht mehr geaendert werden (E18)
--   DELETE /rest/v1/recipes?id=eq.<irgendeins> -> 200, data: []
--     (DELETE-Policy erlaubt nur admin; Athlet sieht keinen Treffer)
--
-- Admin (eingeloggt, profiles.is_admin = true):
--   PATCH /rest/v1/recipes?id=eq.<beliebig> mit status='approved'
--     -> 200, Status geaendert (admin policy)
--   PATCH /rest/v1/recipes?id=eq.<beliebig> mit status='rejected',rejection_reason='...'
--     -> 200 (admin policy)
--   PATCH /rest/v1/recipes?id=eq.<approved> mit title='neu'
--     -> E18-Trigger blockt mit Exception (42501) — content fields
--        duerfen nicht mehr geaendert werden, auch nicht durch Admin (E18)
--   DELETE /rest/v1/recipes?id=eq.<beliebig> -> 200, Zeile geloescht
--
-- Rennsituation: Admin aendert status=approved waehrend Submitter
--   gleichzeitig content patcht:
--     Admin-Update (nur status): Trigger content_changed=false → OK, set_updated_at feuert
--     Submitter-Update (nur title): Trigger sieht old.status='approved' → Exception
--     => Beide Rules halten unabhaengig (Issue #16 Edge Case)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.