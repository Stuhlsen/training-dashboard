-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0058: bikes_public mit security_invoker = off
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst (dashboard-dev),
--             danach der apps01-Self-Host-Stack
-- Referenz: security-bot access-control audit, Fund 10
--
-- 0051 erstellte bikes_public ohne explizites security_invoker. Der Postgres-
-- Default ist "off", das Verhalten ist heute korrekt — aber die Supabase-
-- Empfehlung tendiert zu "on" für neue Views, sodass ein zukünftiges
-- CREATE OR REPLACE nach dieser allgemeinen Empfehlung die View unabsichtlich
-- auf Owner-Rechte umstellen könnte (fails closed — null rows, kein Leak).
--
-- Fix: CREATE OR REPLACE mit explizitem with (security_invoker = off),
-- identischer Spaltenliste wie 0051. Konsistent mit allen anderen Views
-- im Repo (wellbeing_shared, profiles_visible, profiles_own, ftp_public, ...).
-- ============================================================

create or replace view public.bikes_public
with (security_invoker = off) as
  select id, profile_id, name, bike_type, crank_length_mm, created_at, updated_at
  from public.bikes;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.