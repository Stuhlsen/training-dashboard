-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0050: Auto-Cleanup für verwaiste Bike-Fit Fotos
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev)
-- Referenz: planning/fahrplan-16-bikefitting.md (E8)
--
-- Nicht abgeschlossene Fittings (status = 'active', created_at älter als 30 Tage)
-- werden auf status = 'abandoned' gesetzt, und verwaiste Storage-Einträge
-- aus bikefit_iterations (photo_path_*) gelöscht / genullt.
-- ============================================================

-- Funktion zum Bereinigen veralteter aktiver Fittings (> 30 Tage)
create or replace function public.cleanup_abandoned_bikefits()
returns table(cleaned_fittings integer, cleaned_iterations integer)
language plpgsql security definer set search_path = public, storage as $$
declare
  fitting_count integer := 0;
  iteration_count integer := 0;
  updated_rows integer;
  r record;
begin
  -- 1. Finde alle verwaisten aktiven Fittings älter als 30 Tage
  for r in
    select id from public.bikefit_fittings
    where status = 'active'
      and created_at < now() - interval '30 days'
  loop
    -- Lösche zugehörige Storage-Objekte
    delete from storage.objects
    where bucket_id = 'bikefit-photos'
      and (
        name in (
          select photo_path_legs from public.bikefit_iterations
          where fitting_id = r.id and photo_path_legs is not null
          union
          select photo_path_riding from public.bikefit_iterations
          where fitting_id = r.id and photo_path_riding is not null
        )
      );

    -- Nulle die Pfade in bikefit_iterations (Datenschutz)
    update public.bikefit_iterations
    set photo_path_legs = null,
        photo_path_riding = null
    where fitting_id = r.id;

    get diagnostics updated_rows = row_count;
    iteration_count := iteration_count + updated_rows;

    -- Setze Fitting auf abandoned
    update public.bikefit_fittings
    set status = 'abandoned',
        completed_at = now()
    where id = r.id;

    fitting_count := fitting_count + 1;
  end loop;

  return query select fitting_count, iteration_count;
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
