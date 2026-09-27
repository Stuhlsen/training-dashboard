-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0057: Füge Coach-INSERT-Recht
-- für bikefit-photos hinzu (Ergänzung zu 0049)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E1, Verträge V2 & V4)
--
-- Migration 0049 erlaubte INSERT in storage.objects:bikefit-photos nur
-- für auth.uid() = profile_id oder Admin, während SELECT und DELETE
-- zusätzlich public.is_coach_of() prüften. Diese Migration fügt die
-- fehlende is_coach_of-Prüfung zum INSERT-Pfad hinzu, sodass ein Coach
-- Bikefit-Fotos seines Athleten hochladen, ansehen und löschen kann
-- (konsistent mit den Table-Policies aus 0048).
-- ============================================================

drop policy if exists "bikefit_photos_insert" on storage.objects;
create policy "bikefit_photos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bikefit-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_coach_of((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.