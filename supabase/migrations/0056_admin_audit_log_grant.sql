-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0056: SELECT-Grant admin_audit_log
-- für authenticated (Fahrplan 22 E6 Review, Issue #2)
-- Einspielen: dev-Projekt zuerst (dashboard-dev), danach apps01 —
-- direkt nach 0055, Rückfrage bei Alex vor Prod.
--
-- 0044 hat nur service_role ein SELECT auf admin_audit_log gegrantet.
-- PostgREST prüft Tabelle-Privilegien vor RLS: selbst ein Admin, der
-- mit einem authenticated-JWT /rest/v1/admin_audit_log abfragt, bekam
-- permission denied, weil die Tabelle für authenticated kein SELECT
-- zuliess. Der RLS-Policy "admin liest audit log" (is_admin()) konnte
-- dadurch nie greifen.
--
-- Fix: SELECT auf authenticated granten (PostgREST liefert die Tabelle
-- dann aus), die existierende RLS-Policy schränkt auf echte Admins ein.
-- INSERT/UPDATE/DELETE bleiben service_role-exklusiv (admin-api schreibt
-- per RLS-Bypass).
-- ============================================================

grant select on public.admin_audit_log to authenticated;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.