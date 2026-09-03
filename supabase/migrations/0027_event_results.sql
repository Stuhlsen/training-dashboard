-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0027: Rennergebnisse (events.result_*)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: 6-Punkte-Liste 03.09.2026, Punkt 3
--
-- BEFUND: Nach einem Rennen (GFNY Bremen, Athlet 2) lässt sich das echte
-- Ergebnis nirgends festhalten — gefahrene Zeit, Ø-Leistung, Platzierung in
-- der Altersklasse und gesamt. Die Hero-„Bestleistungen"-Karte
-- (core/records.js) ist rein aus Fahrten abgeleitet; ein Wettkampfergebnis
-- gehört zum Event, nicht zu einer einzelnen Fahrt.
--
-- FIX: vier nullable Spalten auf `events` nach dem exakten Muster von
-- Migration 0012 (is_test) — nur bei type='race' sinnvoll (eigener CHECK
-- `events_result_only_for_race`, `events_priority_only_for_race` bleibt
-- unangetastet). Keine RLS-Änderung: die Row-Policies aus 0001/0004 decken
-- neue Spalten über die Zeile ab, `events` ist bereits anon-lesbar — die
-- Ergebnisse sollen genau das sein (Anzeige in der öffentlichen
-- Hero-„Rennergebnisse"-Karte, unter Pseudonym).
--
-- result_time_s = Netto-/Zielzeit in Sekunden. result_avg_watts,
-- result_place_ag (Altersklasse), result_place_overall (Gesamt) — alle
-- manuell eingetragen (der Athlet kann die echte Fahrt aus mehreren
-- intervals.icu-Aktivitäten zusammensetzen, s. Punkt 4).
-- ============================================================

alter table public.events
  add column if not exists result_time_s integer check (result_time_s > 0);

alter table public.events
  add column if not exists result_avg_watts integer check (result_avg_watts >= 0);

alter table public.events
  add column if not exists result_place_ag integer check (result_place_ag > 0);

alter table public.events
  add column if not exists result_place_overall integer check (result_place_overall > 0);

-- Ergebnisfelder nur bei type='race' — eigener Constraint neben
-- events_priority_only_for_race (0004/0012), gleiche Absicherung gegen einen
-- stehen gebliebenen Formularwert aus dem nur per CSS ausgeblendeten
-- Race-Feld-Block.
alter table public.events
  drop constraint if exists events_result_only_for_race;
alter table public.events
  add constraint events_result_only_for_race
  check (
    (type = 'race')
    or (result_time_s is null and result_avg_watts is null
        and result_place_ag is null and result_place_overall is null)
  );

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check: select event_date, type, result_time_s, result_avg_watts,
--                result_place_ag, result_place_overall from events
--                order by event_date; -> vier Spalten vorhanden, alle null
-- als Athlet A:  bestehendes race-Event auf result_time_s = 11565,
--                result_place_ag = 42 patchen -> ok (RLS unverändert,
--                Row-Policy aus 0001/0004 greift)
--                · result_time_s = 0 / -5 -> Fehler (CHECK > 0)
--                · type='other'-Event mit result_place_ag = 1 -> Fehler
--                  (events_result_only_for_race)
-- als Trainer A: result_* für Athlet A änderbar wie jedes andere Feld
-- als anon:      select ... result_time_s ... from events -> Zeilen
--                (öffentlich lesbar, gewollt); schreiben ✗
-- GFNY-Seed (Athlet 2, read-only im Frontend): einmaliger
--   update public.events set result_time_s = …, result_avg_watts = …,
--     result_place_ag = …, result_place_overall = …
--   where athlete_id = '<athlet-2-uuid>' and event_date = '2026-08-30';
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
