-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0072: admin_audit_log — Aktionen fuer verifizierte Autoren
-- Einspielen: dbmate, dev-Projekt zuerst (dashboard-dev), danach der
--             apps01-Self-Host-Stack (echte Produktion — NICHT
--             dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-29-verifizierte-athleten.md — V2
--
-- PROBLEM: admin_audit_log.action hat einen CHECK mit genau fuenf Aktionen
-- (0044). Das Verifizieren/Entziehen eines Autors ist eine vertrauensbildende
-- Admin-Aktion und muss nachvollziehbar sein; ein Eintrag mit
-- 'verify_author' wuerde sonst vom CHECK abgelehnt.
--
-- AENDERUNG (nur das): der CHECK nimmt 'verify_author' und 'unverify_author'
-- auf. Die bisherigen fuenf Aktionen und alle Rechte bleiben unveraendert.
--
-- REIHENFOLGE beim Rollout: Migration VOR dem admin-api-Image von V2. Ohne sie
-- lehnt der Dienst das Verifizieren sauber ab (Audit-Log nicht schreibbar),
-- es entsteht aber keine halbe Aenderung.
-- ============================================================

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_check
  check (action in (
    'ban', 'unban', 'delete', 'resend_invite', 'resend_recovery',
    'verify_author', 'unverify_author'
  ));

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
