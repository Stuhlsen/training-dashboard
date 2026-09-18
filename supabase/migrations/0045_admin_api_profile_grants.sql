-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0045: fehlende SELECT-Grants für service_role
--             auf profiles.role/is_admin/updated_at (admin-api)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
--
-- BEFUND (Fahrplan 18 E1, beim Live-Check gegen docker-compose.selfhost.yml
-- entdeckt): admin-api/users.js::listUsers() liest seit dieser Etappe
-- zusätzlich profiles.role/is_admin (für die auf alle Rollen erweiterte
-- Admin-Übersicht, V3) und weiterhin profiles.updated_at ("zuletzt
-- geändert"-Spalte, unverändert aus der alten athletes.js übernommen).
-- Migration 0043 hat service_role zwar UPDATE (role, is_admin) gegrantet,
-- aber nie SELECT — ein GET /rest/v1/profiles?select=...,role,is_admin,...
-- als service_role scheitert deshalb mit 42501 ("permission denied for
-- table public.profiles"), PostgREST lehnt den kompletten SELECT ab, sobald
-- er auf eine nicht gegrantete Spalte trifft. Exakt dieselbe Fehlerklasse
-- wie Incident 2026-09-17 (Migration 0040, hr_max) — dort schon als
-- wiederkehrendes Muster dokumentiert: jede profiles-Spalte, die ein
-- service_role-Konsument neu liest, braucht ihren eigenen Grant.
-- updated_at war nie gegrantet, obwohl die alte admin-api/athletes.js sie
-- bereits selektierte — vermutlich nie live gegen den Container geprüft
-- (nur Unit-Tests mit gemocktem fetch, die den echten PostgREST-Grant nicht
-- abbilden).
--
-- FIX: SELECT für service_role auf die drei fehlenden Spalten (additiv,
-- ersetzt keinen vorherigen Grant).
-- ============================================================

grant select (role, is_admin, updated_at) on public.profiles to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- als service_role: GET /rest/v1/profiles?select=id,display_name,has_password,role,is_admin,updated_at
--                   -> Zeilen
--                   GET /rest/v1/profiles?select=coach_id -> weiterhin 42501
-- admin-api:        GET /admin/users (als Admin) -> 200, role/isAdmin je
--                   Zeile gefüllt, kein 502
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
