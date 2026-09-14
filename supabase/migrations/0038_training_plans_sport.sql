-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0038: training_plans.sport
--             (ein aktiver Plan JE SPORTART, nicht mehr nur einer je Athlet)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co).
--             Vor dem prod-Einspielen Rückfrage bei Alex.
-- Referenz: planning/fahrplan-14-plan-generator-multisport.md, E4 (Vertrag V3)
--
-- BEFUND: Der partielle Unique-Index training_plans_one_active (0028) sitzt
-- auf (athlete_id) where is_active — verbietet zwei gleichzeitig aktive
-- Pläne desselben Athleten. Fahrplan 14 macht generatePlan() sportfähig
-- (Rad/Lauf/Schwimm, je eigenes Zieldatum/Modell, kein gemeinsamer Taper) —
-- ein Multi-Sport-Athlet (Athlet 3) braucht aber gleichzeitig einen aktiven
-- Rad- UND Laufplan. Der heutige Index blockiert das sofort.
--
-- FIX: sport-Spalte nach demselben Muster wie plan_cards.sport (0037,
-- gleiches Vokabular 'ride'/'run'/'swim', kein 'cycling'/'running'/
-- 'swimming'/'other'). Dazu zwei nullable numeric(5,2)-Spalten als
-- Schwellen-Äquivalent zu ftp_at_creation/ftp_target für sport !== 'ride'
-- (km/h) — additiv statt Rename (Fahrplan-14-Feinentscheidung: die
-- FTP-Spalten bleiben unverändert, es gibt zu viele Rad-Konsumenten für
-- einen Rename ohne Mehrwert). Der alte Index wird durch
-- (athlete_id, sport) where is_active ersetzt — inaktive Alt-Pläne
-- ("eingefrorene Vergangenheit") kollidieren weiterhin nicht.
--
-- BACKFILL: Bestandszeilen bekommen 'ride' automatisch über das DEFAULT bei
-- NOT NULL (Postgres füllt bestehende Zeilen beim ADD COLUMN, wie 0037).
-- Kein separates UPDATE nötig.
--
-- GRANT-Check (Präzedenz 0037): training_plans hat KEIN anon-GRANT;
-- authenticated hat bereits vollen select/insert/update/delete über die
-- for-all-Policy "training_plans: Athlet+Trainer+Admin" (0028), ohne
-- spaltenrestriktives Grant. Die neuen Spalten + der Index-Ersatz brauchen
-- deshalb KEIN neues GRANT und KEINE RLS-Änderung — reiner additiver
-- Spalten-Zusatz plus Index-Ersatz.
-- ============================================================

alter table public.training_plans
  add column if not exists sport text not null default 'ride'
    check (sport in ('ride', 'run', 'swim'));

alter table public.training_plans
  add column if not exists threshold_speed_at_creation numeric(5,2),
  add column if not exists threshold_speed_target numeric(5,2);

drop index if exists public.training_plans_one_active;
create unique index training_plans_one_active
  on public.training_plans (athlete_id, sport) where is_active;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'training_plans'
--      and column_name in ('sport', 'threshold_speed_at_creation', 'threshold_speed_target');
--   -> sport: text, default 'ride'::text
--   -> threshold_speed_at_creation / threshold_speed_target: numeric, kein Default
-- Backfill-Check: select distinct sport from training_plans; -> nur 'ride'
--                 (alle Bestandszeilen)
-- Index-Check:
--   select indexdef from pg_indexes where indexname = 'training_plans_one_active';
--   -> ... USING btree (athlete_id, sport) WHERE is_active
-- als Athlet A:  aktiven Radplan (sport default 'ride') anlegen -> ok
--              · zusätzlich aktiven Laufplan (sport='run') anlegen -> ok
--                (NEU — am alten Index wäre das gescheitert)
--              · zweiten aktiven Radplan (sport='ride') zusätzlich anlegen
--                -> Fehler (Unique-Index (athlete_id, sport) where is_active)
--              · sport='xyz' setzen -> Fehler (CHECK ride/run/swim)
--              · sport auf NULL setzen -> Fehler (NOT NULL)
--              · threshold_speed_target=15.75 setzen -> ok
--              · threshold_speed_target=9999 setzen -> Fehler (numeric(5,2)
--                erlaubt max. 3 Vorkommastellen)
-- als anon:      training_plans weiterhin unlesbar/unschreibbar (kein GRANT,
--                unverändert)
-- Bestehender training_plans-Read (Frontend, Athlet 1/2/4): unverändert,
--                sport='ride' überall, keine Verhaltensänderung
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
