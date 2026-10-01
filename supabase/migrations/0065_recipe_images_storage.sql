-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0065: recipe-images storage bucket + RLS
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack (echte Produktion, s.
--             AGENTS.md "Migrations-Workflow" -- NICHT dashboard-prod auf
--             supabase.co).
-- Referenz: planning/fahrplan-23-ernaehrung.md — Etappe E0, Schritt 6,
--           Entscheidung E18.
-- Issue: #19 (E0: recipe-images storage bucket + upload/read RLS,
--         no auto-cleanup)
--
-- Bucket recipe-images:
--   - public: false (privat, served via signed/authorized URLs)
--   - file_size_limit: 15 MB (konsistent mit bikefit-photos, 0049)
--   - allowed_mime_types: image/jpeg, image/png, image/webp
--
-- RLS auf storage.objects:
--   - Pfad-Konvention: "{profile_id}/{filename}" (auth.uid()-Scoping)
--   - INSERT: Athlet darf nur unter eigenem Prefix hochladen; Admin darf
--     für alle Prefixe hochladen (z. B. für own/spoonacular-Rezepte).
--   - SELECT: alle authenticated (einfachste Regel — die recipes-Tabelle
--     selbst steuert per RLS, welche Rezept-Zeilen sichtbar sind; das
--     Bild folgt dieser Sichtbarkeit über den image_url-Pfad).
--   - DELETE: nur Admin (konsistent mit recipes_delete_admin aus 0062).
--
-- KEIN Auto-Cleanup (E18, expliziter Unterschied zu bikefit):
--   - Bikefit hat cleanup_abandoned_bikefits() + pg_cron-Job (0050).
--   - Recipe-Images werden NICHT automatisch bereinigt:
--     * Bilder bleiben erhalten, solange das Rezept existiert.
--     * Bei Rezept-Löschung bleiben Storage-Orphans möglich (akzeptiert,
--       s. Edge Cases unten).
--     * Bei erneuter Einreichung nach Ablehnung: altes Bild bleibt
--       erhalten (kein Auto-Delete, explizites Cleanup out of scope, E18).
--     * Keine TTL, kein pg_cron-Job.
--   - Falls Orphan-Cleanup später gewünscht: manuell oder per Admin-Tool.
-- ============================================================

-- Bucket anlegen falls noch nicht existent
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- RLS Policies für recipe-images im storage.objects Schema
--
-- INSERT: Athlet darf nur unter eigenem Prefix hochladen (auth.uid()-Scoping).
-- Admin darf für alle Prefixe hochladen (z. B. für own/spoonacular-Rezepte).
drop policy if exists "recipe_images_insert" on storage.objects;
create policy "recipe_images_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

-- SELECT: alle authenticated. Einfachste Regel — die recipes-Tabelle
-- (0062) steuert per RLS, welche Rezept-Zeilen sichtbar sind. Das Bild
-- wird über den image_url-Pfad referenziert, der nur aus einer sichtbaren
-- Rezept-Zeile stammt. Anon hat keinen Zugriff.
--
-- Begründung für die weite SELECT-Regel (statt bikefit-Pattern
-- self/coach/admin):
--   - Das Review-UI (E15) muss das Bild eines pending-Rezepts für ALLE
--     eingeloggten Athleten laden können, da pending-Rezepte in der
--     Rezepte-Tabelle selbst für alle sichtbar sind (0062).
--   - rejected-Rezepte sind in der Tabelle nur für submitter+admin
--     sichtbar; das Bild ist über den image_url-Pfad nur erreichbar,
--     wenn der Athlet die Rezept-Zeile sehen kann. Ein direkter
--     Storage-Zugriff ohne Recipe-Kontext ist über die recipe_images_
--     select-Policy zwar möglich, aber praktisch irrelevant (der Pfad
--     ist eine UUID-Kombination, nicht ratbar).
--   - Einfachere Policy = weniger Fehlerquellen bei zukünftigen
--     Recipe-Sichtbarkeitsänderungen.
drop policy if exists "recipe_images_select" on storage.objects;
create policy "recipe_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-images');

-- DELETE: nur Admin (konsistent mit recipes_delete_admin aus 0062).
-- Kein Athlet darf Bilder löschen (auch nicht die eigenen) — das
-- Rezept selbst könnte noch existieren und das Bild referenzieren.
drop policy if exists "recipe_images_delete" on storage.objects;
create policy "recipe_images_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recipe-images'
    and public.is_admin()
  );

-- ============================================================
-- KEIN Auto-Cleanup (E18 — expliziter Unterschied zu bikefit 0050):
--
-- Bikefit hat einen pg_cron-Job cleanup-abandoned-bikefits-daily (0050).
-- Recipe-Images haben bewusst KEINEN solchen Job:
--   - Bilder bleiben erhalten, solange das Rezept existiert.
--   - Bei Rezept-Löschung (Admin only, 0062) bleiben Storage-Orphans
--     möglich — das ist akzeptiert (E18).
--   - Bei erneuter Einreichung nach Ablehnung durch denselben Athleten:
--     altes Bild bleibt als Orphan (kein Auto-Delete, E18).
--   - Falls Orphan-Cleanup später gewünscht: manuelles Admin-Tool
--     oder separate Migration (out of scope für Issue #19).
-- ============================================================

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Anon (nicht eingeloggt):
--   GET /storage/v1/object/recipe-images/<beliebig> -> 401 (unauthorized)
--   POST /storage/v1/object/recipe-images/<beliebig> -> 401
--
-- Athlet A (eingeloggt):
--   POST /storage/v1/object/recipe-images/<A-UUID>/test.jpg
--     mit image/jpeg -> 200 (OK, eigener Prefix)
--   POST /storage/v1/object/recipe-images/<B-UUID>/test.jpg
--     mit image/jpeg -> 401 (WITH CHECK: fremder Prefix)
--   GET /storage/v1/object/recipe-images/<A-UUID>/test.jpg -> 200 (OK)
--   GET /storage/v1/object/recipe-images/<B-UUID>/test.jpg -> 200 (OK,
--     alle authenticated sehen alle Bilder)
--   DELETE /storage/v1/object/recipe-images/<A-UUID>/test.jpg
--     -> 200, data: [] (DELETE-Policy erlaubt nur Admin;
--     Athlet sieht keinen Treffer / bekommt ggf. leere Antwort)
--
-- Admin (eingeloggt, profiles.is_admin = true):
--   POST /storage/v1/object/recipe-images/<B-UUID>/test.jpg
--     mit image/jpeg -> 200 (Admin darf für alle Prefixe hochladen)
--   DELETE /storage/v1/object/recipe-images/<beliebig>/test.jpg -> 200
--     (Admin darf löschen)
--
-- Edge Cases (DB-Ebene):
--   - Nicht-Bild-Dateien (z. B. .txt, .pdf): MIME-Type-Prüfung wird
--     vom storage.layer durch allowed_mime_types abgewiesen.
--   - Datei > 15 MB: storage.layer blockt mit 413.
--   - Prefix-Pfad ohne UUID (z. B. "foo/bar.jpg"): foldername(name)[1]
--     ist 'foo', auth.uid()::text ist UUID-Format -> match schlägt fehl
--     -> INSERT blockt.
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.