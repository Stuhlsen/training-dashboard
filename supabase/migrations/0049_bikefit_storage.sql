-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0049: storage.buckets & policies für bikefit-photos
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E1, Verträge V2 & V4)
--
-- Bucket bikefit-photos:
--   - public: false (privat)
--   - file_size_limit: 15MB
--   - allowed_mime_types: image/jpeg, image/png, image/webp
--
-- RLS auf storage.objects:
--   - Pfad-Konvention: "{profile_id}/{fitting_id}/{sequence}_{legs|riding}.{ext}"
--   - INSERT/SELECT/DELETE nur durch den Athleten selbst (auth.uid() = profile_id)
--     oder Coach/Admin.
-- ============================================================

-- Bucket anlegen falls noch nicht existent
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bikefit-photos',
  'bikefit-photos',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- RLS Policies für bikefit-photos im storage.objects Schema
drop policy if exists "bikefit_photos_insert" on storage.objects;
create policy "bikefit_photos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'bikefit-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

drop policy if exists "bikefit_photos_select" on storage.objects;
create policy "bikefit_photos_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'bikefit-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_coach_of((storage.foldername(name))[1]::uuid)
      or public.is_admin()
    )
  );

drop policy if exists "bikefit_photos_delete" on storage.objects;
create policy "bikefit_photos_delete" on storage.objects
  for delete to authenticated
  using (
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
