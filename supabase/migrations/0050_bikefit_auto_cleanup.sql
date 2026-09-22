-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0050: Auto-Cleanup für verwaiste Bike-Fit Fotos
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E8)
--
-- Nicht abgeschlossene Fittings (status = 'active', created_at älter als 30 Tage)
-- werden auf status = 'abandoned' gesetzt — rein Metadaten, KEIN Storage-Zugriff.
--
-- Bewusst metadata-only (Tony, 22.09.2026, vor dem ersten Einspielen entdeckt):
-- 1. storage.objects hat seit storage-api-Migration 0055 einen
--    protect_objects_delete-Trigger, der ein rohes DELETE FROM storage.objects
--    verweigert, solange storage.allow_delete_query nicht in derselben Session
--    gesetzt ist — eine plpgsql-Funktion ohne das bricht dort mit Exception ab,
--    und da kein exception handler in der Loop sitzt, rollt der GESAMTE Lauf
--    zurück (auch die status-Updates).
-- 2. Selbst mit gesetztem Flag würde ein rohes DELETE nur die DB-Zeile
--    entfernen, nicht die physische Datei — storage-api löscht die Datei vom
--    Backend nur über seinen eigenen deleteObject()-API-Pfad, es gibt keinen
--    DB-Trigger/Queue-Mechanismus, der das synchronisiert.
-- Die echte Foto-Löschung (DB-Zeile + Datei atomar) läuft deshalb NICHT hier,
-- sondern im apps01-Sync-Container (hält bereits den Service-Role-Key und
-- kann DELETE /storage/v1/object/... aufrufen) — s. offene-punkte.md.
-- ============================================================

-- Funktion zum Bereinigen veralteter aktiver Fittings (> 30 Tage) — Metadaten only
-- drop nötig: alte Fassung hatte eine andere Rückgabetabelle (cleaned_iterations
-- zusätzlich), create or replace kann den Rückgabetyp nicht ändern
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

-- Berechtigungen
grant execute on function public.cleanup_abandoned_bikefits to service_role;

-- pg_cron Job (sofern pg_cron verfügbar/aktiviert ist, täglich um 03:00 Uhr UTC)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-abandoned-bikefits-daily',
      '0 3 * * *',
      'select public.cleanup_abandoned_bikefits();'
    );
  end if;
exception when others then
  -- Falls pg_cron nicht installiert oder im Free-Tier/lokal ohne Extension läuft
  raise notice 'pg_cron nicht verfügbar — cleanup_abandoned_bikefits() steht als RPC/Funktion bereit';
end;
$$;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
