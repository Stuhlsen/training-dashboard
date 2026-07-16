-- ============================================================
-- Dashboard 2.0 — Migration 0005: Planungstab-Karten (plan_cards)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/phase-3-konzept-planungstab.md (§1, §8.4)
--
-- plan_cards existiert bereits aus 0001_initial_schema.sql — mit einem
-- deutlich schmaleren Schema (id, athlete_id, planned_date, sort_order,
-- title, workout_type, duration_min, tss_planned, status, note,
-- created_at) als im Konzept skizziert. Diese Migration zieht additiv
-- auf den Konzeptstand nach — kein Rename bestehender Spalten
-- (planned_date/workout_type/tss_planned bleiben), kein Constraint-
-- Change am status-Enum (geplant/erledigt/ausgefallen bleibt; das
-- Migrationsskript scripts/migrate-plan-to-supabase.js schreibt nur
-- geplant/ausgefallen — "erledigt" bleibt wie im bisherigen Planungstab
-- ein reiner Anzeige-Vergleich gegen rides.json, kein gespeicherter
-- Fakt). RLS + GRANTs aus 0001/0002 decken die Tabelle bereits als
-- Ganzes ab (kein spaltenrestriktives Grant wie bei profiles/proposals)
-- — kein neues GRANT nötig.
--
-- Neue Spalten:
--   km                 geplante Distanz (bestehendes Feld im UI)
--   workout             jsonb — strukturierte Blöcke (WU/Intervalle/CD),
--                        Karte + Blöcke werden immer zusammen geladen/
--                        gespeichert, keine relationale Abfrage nötig
--                        (Präzedenzfall: proposals.payload)
--   pushed_external_id  gesetzt, sobald auf Wahoo/intervals.icu gepusht
--                        (Spalte jetzt angelegt, Push-Code zieht erst im
--                        Karten-CRUD-Schritt nach data-access um)
--   cancel_reason       Grund bei Ausfall (heute in adjustments.json)
--   moved_from_date     trägt den "Verschoben von …"-Badge inkl. Rückgängig
--   move_reason         Grund der Verschiebung
--   week / phase        Wochen-/Phasen-Label für die bestehende Gruppierung
--   updated_at          + Trigger, wiederverwendet set_updated_at() aus
--                        0003_wellbeing.sql, kein neues Funktions-Duplikat
-- ============================================================

alter table public.plan_cards add column if not exists km smallint;
alter table public.plan_cards add column if not exists workout jsonb;
alter table public.plan_cards add column if not exists pushed_external_id text;
alter table public.plan_cards add column if not exists cancel_reason text;
alter table public.plan_cards add column if not exists moved_from_date date;
alter table public.plan_cards add column if not exists move_reason text;
alter table public.plan_cards add column if not exists week text;
alter table public.plan_cards add column if not exists phase text;
alter table public.plan_cards
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists plan_cards_set_updated_at on public.plan_cards;
create trigger plan_cards_set_updated_at
  before update on public.plan_cards
  for each row execute function public.set_updated_at();

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select km, workout, pushed_external_id, cancel_reason,
--                moved_from_date, move_reason, week, phase, updated_at
--                from plan_cards limit 1; -> alle Spalten vorhanden (leer,
--                solange noch keine Migration gelaufen ist)
-- als anon:      plan_cards lesen ✓ (unverändert aus 0001) · schreiben ✗
-- als Athlet A:  eigene Karte per REST-Insert anlegen ✓ (athlete_id =
--                eigene auth.uid()) · Karte von Athlet B anlegen ✗
-- Update-Trigger: Karte ändern -> updated_at aktualisiert sich automatisch
-- ============================================================
