-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0053: cleanup_abandoned_bikefits() korrigieren
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/ideen-backlog.md (Idee 2, Nachtrag 22.09.2026)
--
-- Migration 0050 löschte per rohem `DELETE FROM storage.objects` — das
-- scheitert am `protect_objects_delete`-Trigger von storage-api (eigene
-- Migration 0055, ohne vorheriges Setzen von `storage.allow_delete_query`)
-- und hätte selbst ohne Trigger nur die DB-Zeile entfernt, nie die
-- physische Datei (storage-api synct das nur über seinen eigenen
-- deleteObject()-API-Pfad). Auf apps01 war 0050 bereits seit v1.35.1
-- angewendet (dbmate trackt nur den Dateinamen, kein Content-Hash — ein
-- nachträgliches Bearbeiten von 0050 selbst hätte dort NICHT erneut
-- gegriffen), daher hier bewusst als eigene Migration statt einer Änderung
-- an 0050.
--
-- cleanup_abandoned_bikefits() wird jetzt metadata-only: setzt nur noch
-- status = 'abandoned', fasst storage.objects gar nicht mehr an. Die echte
-- Foto-Löschung (DB-Zeile + Datei atomar über
-- DELETE /storage/v1/object/...) wandert als eigene Aufgabe in den
-- apps01-Sync-Container (hält bereits den Service-Role-Key) — noch zu
-- bauen.
-- ============================================================

-- drop nötig: alte Fassung hatte eine andere Rückgabetabelle
-- (cleaned_iterations zusätzlich), create or replace kann den Rückgabetyp
-- nicht ändern
drop function if exists public.cleanup_abandoned_bikefits();

create or replace function public.cleanup_abandoned_bikefits()
returns table(cleaned_fittings integer) language plpgsql security definer set search_path = public as $$
declare
  fitting_count integer := 0;
begin
  update public.bikefit_fittings
  set status = 'abandoned',
      completed_at = now()
  where status = 'active'
    and created_at < now() - interval '30 days';

  get diagnostics fitting_count = row_count;

  return query select fitting_count;
end;
$$;

grant execute on function public.cleanup_abandoned_bikefits to service_role;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
