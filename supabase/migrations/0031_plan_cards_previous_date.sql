-- migrate:up

-- ============================================================
-- Migration 0031: plan_cards.previous_date (Ein-Schritt-Rückgängig)
--
-- Bug (02.09.2026 gemeldet): Verschiebt man dieselbe Karte zweimal
-- (z.B. Do→Fr→Sa), sprang "Rückgängig" bisher immer bis zum ALLERERSTEN
-- Ursprungsdatum zurück (moved_from_date friert dort bewusst ein, s.
-- Kopfkommentar in app/src/api/plan-cards/patch.ts — das Badge "verschoben
-- von …" soll stabil bleiben). Landete dieses Ursprungsdatum in der
-- Vergangenheit und dort bereits eine echte Fahrt, zeigte das Raster die
-- Karte fälschlich als "erledigt" und sie ließ sich weder ziehen noch
-- erneut rückgängig machen.
--
-- previous_date trägt separat das Datum VOR dem jeweils letzten
-- Verschieben (bei JEDEM Move aktualisiert, nicht nur beim ersten) — Undo
-- springt jetzt dorthin statt zu moved_from_date. Additiv, kein GRANT nötig
-- (Präzedenz 0013_plan_cards_workout_structure.sql: plan_cards ist in
-- 0002_grants.sql bereits vollständig für authenticated gegrantet).
-- ============================================================

alter table public.plan_cards add column if not exists previous_date date;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check: select previous_date from plan_cards limit 1;
--                -> Spalte vorhanden, NULL für alle Bestandskarten
-- Karte zweimal verschieben (Do->Fr->Sa), dann Rückgängig:
--   -> landet auf Fr (previous_date), nicht auf Do (moved_from_date)
-- Zweites Rückgängig direkt danach: -> landet auf Do (Fallback auf
--   moved_from_date, previous_date ist nach dem ersten Undo NULL)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
