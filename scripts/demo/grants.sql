-- ============================================================
-- DEMO/GRANTS.SQL — Schreibrechte für demo:seed (Fahrplan 31 E4)
--
-- NUR für den lokalen Demo-Stack. Bewusst KEINE Migration: Migrationen
-- laufen auch auf apps01 (Q7), dort bleibt service_role so schmal wie in
-- supabase/migrations/ festgelegt.
--
-- Warum nötig: db-init entzieht die Standardrechte des supabase/postgres-
-- Images; service_role bekommt nur, was die Migrationen vergeben (bei
-- plan_cards/training_plans/ftp_history nur Lesen, bei events/wellbeing/
-- goals nichts). Löschen braucht der Seed nicht — demo:reset löscht
-- Accounts über GoTrue, die Zeilen fallen per Cascade.
--
-- Einspielen (Test-Stack E4; ab E6 als eigener Schritt im Demo-Stack):
--   docker compose -p training-dashboard-demo -f docker-compose.selfhost.yml \
--     exec -T postgres psql -U supabase_admin -d postgres < scripts/demo/grants.sql
-- Wiederholbar (GRANT ist idempotent).
-- ============================================================

grant select, insert on public.events         to service_role;
grant select, insert on public.wellbeing      to service_role;
grant select, insert on public.goals          to service_role;
grant select, insert on public.plan_cards     to service_role;
grant select, insert on public.training_plans to service_role;
grant select, insert on public.ftp_history    to service_role;

-- Nachziehen unberührter Seed-Zeilen (s. lib/seed-run.js): nur diese Felder.
grant update (is_active)                        on public.training_plans to service_role;
grant update (status, cancel_reason)            on public.plan_cards     to service_role;
grant update (result_time_s, result_avg_watts)  on public.events         to service_role;
grant update (target_date)                      on public.goals          to service_role;

-- Profile: Trainer-Verknüpfung + Sportarten (Standardwerte ergänzen).
grant select (coach_id) on public.profiles to service_role;
grant update (coach_id, sports) on public.profiles to service_role;
