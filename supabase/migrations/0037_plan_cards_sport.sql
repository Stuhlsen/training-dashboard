-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0037: plan_cards.sport
--             (Sportart je Trainingskarte: Rad / Lauf / Schwimm)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-12-multi-sport-phase-2-laufplan.md, E1 (Vertrag W1)
--
-- BEFUND: Alle plan_cards-Zeilen sind heute implizit Radkarten. Fahrplan 12
-- Phase 2 gibt Athlet 3 einen über plan_cards editierbaren LAUF-Plan auf
-- demselben Tabellen-/RLS-Modell. Dafür muss jede Karte ihre Sportart
-- tragen, damit der Planungstab je Sport-Tab filtert und der Sync
-- Nicht-Rad-Karten aus der Rad-Pipeline (rides-N.json) ausschließt.
--
-- FIX: eine text-Spalte mit NOT NULL + DEFAULT 'ride' nach dem Muster von
-- 0026 (profiles.plan_offset_weeks) / 0031 (plan_cards.previous_date) —
-- reiner additiver Spalten-Zusatz. Das Vokabular ('ride'/'run'/'swim',
-- NICHT 'cycling'/'running'/'swimming') ist Vertrag V2 aus Fahrplan 10 und
-- deckt sich mit dem sport-Feld der Ist-Aktivitäten — keine Übersetzungs-
-- schicht beim Ist-Soll-Matching. Kein 'other' (kein planbarer
-- "other"-Kartentyp; kann später per eigener Migration dazu).
--
-- BACKFILL: Bestandszeilen bekommen 'ride' AUTOMATISCH über das DEFAULT
-- bei NOT NULL — Postgres füllt bestehende Zeilen beim ADD COLUMN. Ein
-- separates UPDATE ist nicht nötig.
--
-- GRANT-Check (Präzedenz 0013_plan_cards_workout_structure.sql /
-- 0031_plan_cards_previous_date.sql): plan_cards ist in 0002_grants.sql
-- bereits vollständig für anon (SELECT) und authenticated
-- (SELECT/INSERT/UPDATE/DELETE) gegrantet, ohne spaltenrestriktives Grant.
-- Eine neue Spalte braucht deshalb KEIN neues GRANT und KEINE
-- RLS-Änderung — gleiche Policies wie bisher (Vertrag W1: "RLS/GRANT
-- unverändert — reiner Spalten-Zusatz").
-- ============================================================

alter table public.plan_cards
  add column if not exists sport text not null default 'ride'
    check (sport in ('ride', 'run', 'swim'));

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check:
--   select column_name, data_type, column_default
--     from information_schema.columns
--    where table_name = 'plan_cards' and column_name = 'sport';
--   -> ('sport', 'text', '''ride''::text')
-- Backfill-Check: select distinct sport from plan_cards;
--   -> nur 'ride' (alle Bestandskarten)
-- als Athlet A:  eigene Karte mit sport='run' anlegen/patchen -> ok
--                sport='xyz' setzen -> Fehler (CHECK ride/run/swim)
--                sport auf NULL setzen -> Fehler (NOT NULL)
-- als anon:      plan_cards weiterhin lesbar (inkl. sport) ✓ · schreiben ✗
-- Bestehender plan_cards-Read (Frontend/Sync): unverändert, sport='ride'
--                überall, keine Verhaltensänderung
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
