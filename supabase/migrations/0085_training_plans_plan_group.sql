-- migrate:up

-- ============================================================
-- Dashboard — Migration 0085: training_plans.plan_group_id
--             (mehrere Pläne EINES Athleten verknüpfen)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co).
--             Migrationen gehen mit dem Release selbst raus (migrate-Container).
-- Referenz: planning/fahrplaene/fahrplan-44-mehrere-sportarten.md, E2 (Vertrag V1)
--
-- Alle aktiven Pläne mit derselben plan_group_id gehören zusammen
-- (z. B. Rad + Lauf eines Athleten). Es gibt bewusst KEINE eigene
-- Gruppen-Tabelle: die Gruppe ist nur die gemeinsame uuid.
--
-- BACKFILL: keiner. Bestandszeilen bleiben null und verhalten sich exakt
-- wie vorher. Kein Default, nullable.
--
-- UNVERÄNDERT: der partielle Unique-Index training_plans_one_active
-- (athlete_id, sport) where is_active aus 0038 (Ersatz für den Index aus
-- 0028) — ein aktiver Plan je Sportart bleibt die Regel.
--
-- GRANT-/RLS-Check (Präzedenz 0038): training_plans hat kein anon-GRANT;
-- authenticated nutzt die for-all-Policy "training_plans: Athlet+Trainer+
-- Admin" (0028) ohne Spaltenrestriktion. Die neue Spalte braucht deshalb
-- KEIN neues GRANT und KEINE Policy-Änderung. Die Policy hängt an
-- athlete_id, nicht an der Gruppe — eine Gruppe kann Rechte nicht erweitern.
-- ============================================================

alter table public.training_plans
  add column if not exists plan_group_id uuid;

-- Nachschlag „alle Pläne einer Gruppe dieses Athleten". Partiell: die
-- vielen Bestandszeilen ohne Gruppe bleiben aus dem Index.
create index if not exists training_plans_athlete_group_idx
  on public.training_plans (athlete_id, plan_group_id)
  where plan_group_id is not null;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check:
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'training_plans' and column_name = 'plan_group_id';
--   -> uuid, YES, kein Default
-- Backfill-Check: select count(*) from training_plans where plan_group_id is not null;
--   -> 0 (nach dem Einspielen, solange kein Code eine Gruppe schreibt)
-- Index-Check:
--   select indexdef from pg_indexes where indexname = 'training_plans_athlete_group_idx';
--   -> ... (athlete_id, plan_group_id) WHERE (plan_group_id IS NOT NULL)
--   select indexdef from pg_indexes where indexname = 'training_plans_one_active';
--   -> unverändert: ... (athlete_id, sport) WHERE is_active
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
