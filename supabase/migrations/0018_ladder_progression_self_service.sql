-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0018: Self-Service für ladder_progression_enabled
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/offene-punkte.md "Planungstab / Progressionssteuerung",
--           Auftrag Alex 26.08.2026: jeder Athlet soll den Stufenvorschlag
--           selbst an-/ausschalten können, statt es nur per SQL zu setzen
--           (bisher: 0016, bewusst kein Self-Service).
--
-- 0016 hat die Spalte bewusst NICHT selbstbedienbar gemacht (kein GRANT,
-- analog zu is_admin) — Begründung dort war Unsicherheit über die
-- Datenreife pro Athlet für die scharfe Fortschreibung. Diese Migration
-- hebt das gezielt auf: die Reife-Frage bleibt bestehen, wird aber künftig
-- athletenseitig entschieden statt zentral per SQL gesetzt. Eine reine
-- Grant-Erweiterung reicht — kein REVOKE nötig, die bestehenden
-- column-Grants aus 0001 (display_name, wellbeing_public) bleiben
-- unangetastet, Postgres vereinigt mehrere GRANT UPDATE(spalte)-Aufrufe
-- auf dieselbe Tabelle/Rolle.
-- ============================================================

grant update (ladder_progression_enabled) on public.profiles to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- als Athlet: eigenes ladder_progression_enabled per API auf true/false
--             setzen -> erfolgreich (vorher: Fehler, s. 0016-Prüfliste)
-- als Athlet: coach_id/is_admin/display_name eines ANDEREN Profils ändern
--             -> weiterhin Fehler (RLS "eigene Zeile", 0001)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
