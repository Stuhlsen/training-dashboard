-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0007: plan_cards.week auf Kalenderwoche
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             nach Merge auf main dieselbe UPDATE-Liste gegen
--             dashboard-prod wiederholen (s. AGENTS.md Migrations-Workflow)
-- Referenz: Umbau "Plan 1/2 → Kalenderwoche" (dashboard-2.0)
--
-- Hintergrund: 0005_plan_cards.sql führte die Spalten week/phase als
-- "Wochen-/Phasen-Label für die bestehende Gruppierung" ein — befüllt über
-- scripts/migrate-plan-to-supabase.js aus den damaligen PLANNED_SESSIONS-
-- Werten ("P2-W0".."P2-W12", scripts/lib/plan2.js). Der Umbau ersetzt dieses
-- Label-Format durch echte ISO-Kalenderwochen (core/aggregate.js::isoWeekKey,
-- "YYYY-KWnn") — PLANNED_SESSIONS trägt bereits die neuen Werte, aber
-- BEREITS MIGRIERTE plan_cards-Zeilen bleiben ohne dieses Skript auf dem
-- alten Label stehen (die Migration lief einmalig, kein Sync-Pfad schreibt
-- plan_cards.week nachträglich um). Reines Label-Remapping, keine
-- Statusänderung, keine week/phase-Zuordnung wird inhaltlich verschoben —
-- dieselbe Woche bekommt nur einen anderen Namen (Tabelle unten 1:1 aus
-- core/plan2-schedule.js::PLAN2_SCHEDULE).
--
-- phase bleibt unverändert (Sweet Spot/Schwelle/VO2max/Erholung/Taper/
-- Übergang) — nur week wird umbenannt.
-- ============================================================

update public.plan_cards set week = '2026-KW26' where week = 'P2-W0';
update public.plan_cards set week = '2026-KW27' where week = 'P2-W1';
update public.plan_cards set week = '2026-KW28' where week = 'P2-W2';
update public.plan_cards set week = '2026-KW29' where week = 'P2-W3';
update public.plan_cards set week = '2026-KW30' where week = 'P2-W4';
update public.plan_cards set week = '2026-KW31' where week = 'P2-W5';
update public.plan_cards set week = '2026-KW32' where week = 'P2-W6';
update public.plan_cards set week = '2026-KW33' where week = 'P2-W7';
update public.plan_cards set week = '2026-KW34' where week = 'P2-W8';
update public.plan_cards set week = '2026-KW35' where week = 'P2-W9';
update public.plan_cards set week = '2026-KW36' where week = 'P2-W10';
update public.plan_cards set week = '2026-KW37' where week = 'P2-W11';
update public.plan_cards set week = '2026-KW38' where week = 'P2-W12';

-- Athlet-2-Karten (GFNY Bremen 2026, "KW23".."KW35"-Format aus
-- scripts/lib/plan-athlete2.js) sind NICHT Teil dieser Migration — eigenes,
-- bereits kalenderwochenbasiertes Format ohne Plan-1/2-Bezug, unverändert.

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Keine "P2-W…"-Reste mehr:
--   select count(*) from plan_cards where week like 'P2-W%'; -> 0
-- Athlet-2-Karten unangetastet:
--   select week from plan_cards where week like 'KW%' limit 5;
--   -> weiterhin "KW23" usw., nicht "2026-KW…"
-- Anzahl umbenannter Zeilen plausibel (Athlet-1-Kartenbestand):
--   select week, count(*) from plan_cards where week like '2026-KW%'
--   group by week order by week;
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
