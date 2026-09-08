-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0036: athlete_sync_config.interval_cadence_target
--             (Intervall-Kadenz-Ziel je Athlet, self-service)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: docs/fahrplan-11-kadenz-ziel.md
--
-- BEFUND: `legacyDescription()` in app/src/api/intervals/push.ts schreibt
-- fest `85 / 90 / 80 rpm` (Warmup / Intervall / Pause+Cooldown) in den
-- Workout-Text, der zu intervals.icu und von dort in Zwift/MyWhoosh
-- landet. Die 90 ist Athlet 1s Ziel. Athlet 4 (Einsteiger) bekommt sie in
-- Zwift vorgeschlagen, obwohl ein Einsteiger runder bei ~75–80 RPM tritt.
-- Dieselbe 90 steckt als Konstante CADENCE_TARGET_RPM in
-- app/src/sports/cycling/metrics.ts (Kadenz-Chart, Analyse-Tab).
--
-- FIX: eine nullable smallint-Spalte auf athlete_sync_config nach dem
-- Muster von profiles.plan_offset_weeks (0026) — self-service über den
-- neuen Settings-Abschnitt „Trainings-Ziele". Sie ist das Intervall-Ziel
-- `T`; Warmup rechnet die App als `T-5`, Pause/Cooldown als `T-10`
-- (= heutiger Abstand 90/85/80). NULL ⇒ Fallback auf die Konstante 90,
-- Bestandsathleten unverändert.
--
-- Owner-only-RLS aus 0023 („athlete_sync_config: nur der Eigentümer",
-- for all to authenticated using profile_id = auth.uid()) ist
-- spalten-agnostisch und deckt die neue Spalte ab. 0023 hat authenticated
-- bereits einen TABELLEN-weiten UPDATE-Grant gegeben — der spalten-
-- restriktive Grant unten ist damit ein No-op (die Tabellen-Ebene ist die
-- Obermenge, anders als bei 0026, das auf `profiles` gar keinen
-- Tabellen-UPDATE-Grant hat). Er steht trotzdem als explizite
-- Absichtsdoku und Gürtel-plus-Hosenträger, falls 0023 je enger gefasst
-- wird.
--
-- BEWUSST NICHT in dieser Migration:
--   * kein grant ... to service_role — der Sync (scripts/) liest das
--     Kadenz-Ziel nicht. Es wirkt rein im Frontend (Push-Text-Bau,
--     .zwo-Export, Analyse-Anzeige), alles session-gebunden auf den
--     eingeloggten Athleten.
--   * kein anon-Grant (wie die ganze Tabelle, 0023).
--   * kein neues rides.json-Feld ⇒ die „3-Pflichtstellen"-Regel
--     (AGENTS.md, Schema-Validierung) greift hier nicht.
-- ============================================================

alter table public.athlete_sync_config
  add column if not exists interval_cadence_target smallint
    check (interval_cadence_target is null
           or interval_cadence_target between 60 and 120);

-- Self-Service-UPDATE, spalten-restriktiv (wie plan_offset_weeks 0026 auf
-- profiles). Die vorhandene Owner-only-RLS-Policy aus 0023 ist
-- spalten-agnostisch und deckt die neue Spalte mit ab.
grant update (interval_cadence_target) on public.athlete_sync_config to authenticated;
-- KEIN service_role-Grant (Sync liest die Spalte nicht), KEIN anon-Grant.

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check: select id, profile_id, interval_cadence_target
--                from athlete_sync_config limit 1;
-- als anon:      athlete_sync_config lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigenes interval_cadence_target auf 78 setzen -> ok
--                auf 130 setzen -> Fehler (CHECK 60..120)
--                auf 40 setzen  -> Fehler (CHECK 60..120)
--                auf NULL setzen -> ok (zurück auf Default 90 in der App)
--                fremde Zeile (Athlet B) ändern -> Fehler (RLS aus 0023)
-- als Trainer A: interval_cadence_target von Athlet A NICHT lesbar
--                (kein Coach-Zugriff auf athlete_sync_config, wie 0023)
-- als service_role: Spalte NICHT im Grant — Sync-Lesepfad
--                (sync-config-fetch.js) unverändert, rides-*.json ohne Diff
-- Frontend:      Settings → Training → „Trainings-Ziele" → Kadenz-Ziel
--                speichern; danach .zwo einer Intervallkarte laden ->
--                Cadence-Attribute = T / T-5 / T-10
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
