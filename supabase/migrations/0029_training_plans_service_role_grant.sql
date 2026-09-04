-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0029: SELECT-Grant für service_role auf
--             training_plans (Sync-Umschaltung)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co).
--             Vor dem prod-Einspielen Rückfrage bei Alex.
-- Referenz: docs/fahrplan-8-plan-generator.md — Etappe E8
--
-- BEFUND: Migration 0028 legt training_plans an, granted aber bewusst nur
-- an `authenticated` (kein anon, kein service_role) — E1 ändert den Sync
-- nicht und liest die Tabelle bis E8 nicht. Ab E8 liest
-- scripts/generate-data.js (über scripts/lib/training-plan-fetch.js) je
-- Athlet die aktive Zeile mit dem Service-Role-Key (RLS-Bypass), um zu
-- entscheiden, ob die Code-Vorlage (plan-athlete2.js / plan-athlete4.js)
-- übersprungen wird. Ohne diesen Grant liefe der GET in 42501
-- ("permission denied for table training_plans") — training-plan-fetch.js
-- degradiert dann auf `null` und die Vorlage bliebe fälschlich aktiv.
--
-- FIX: SELECT für service_role — analog 0024 (plan_cards / ftp_history)
-- und 0023 (athlete_sync_config). service_role läuft ausschließlich
-- serverseitig im Sync (nie im Frontend, nie im Repo); der Key liegt nur
-- auf apps01 bzw. lokal in .env.
-- ============================================================

grant select on public.training_plans to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als service_role: GET /rest/v1/training_plans?select=id,week_model&is_active=eq.true
--                   -> Zeilen (oder leer, solange noch kein Plan gebaut ist)
-- als anon:         GET /rest/v1/training_plans -> 401 / permission denied
--                   (unverändert, kein GRANT)
-- Sync:             node scripts/generate-data.js mit einem aktiven Plan
--                   für Athlet 2 -> Log "aktiver Trainingsplan … Code-Vorlage
--                   plan-athlete2.js wird übersprungen"
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
