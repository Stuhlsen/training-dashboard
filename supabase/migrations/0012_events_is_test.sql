-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0012: Test-Events (events.is_test)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/konzept-progressionssteuerung.md D5
--
-- Ein Testtermin (z. B. der FTP Ramp Test) ist ein Messtermin, kein
-- Wettkampf — wenn die Planung genauso auf ihn hin optimiert wie auf ein
-- Rennen, steuert das System in Richtung dessen, was den Messwert hebt
-- (VO2max/anaerobe Kapazität), nicht in Richtung tatsächlicher Fitness.
--
-- Entscheidung D5.1 (Konzept): eigenes Boolean-Feld statt eines neuen
-- `priority`-Werts — `priority` ist eine Rangfolge zwischen konkurrierenden
-- Events, "ist ein Test" ist eine orthogonale Eigenschaft (ein Test kann
-- das wichtigste anstehende Datum sein, ohne dass der Plan auf ihn hin
-- umgebaut wird).
--
-- Kein RLS-Change nötig — die bestehenden Policies aus 0001/0004 decken
-- die neue Spalte über die Zeile ab (kein spaltenrestriktives Grant wie
-- bei profiles/proposals).
--
-- events_priority_only_for_race (0004) erweitert: is_test ist wie
-- priority/ftp_goal nur bei type='race' sinnvoll (ein Testtermin ist ein
-- Messtermin, kein Konzept, das auf ein type='other'-Ereignis passt) —
-- dieselbe Absicherung, mit der schon priority/ftp_goal vor einem stehen
-- gebliebenen Formularwert aus dem (nur per CSS ausgeblendeten, nicht
-- geleerten) Race-Feld-Block geschützt sind (ui/event-form.js).
-- ============================================================

alter table public.events
  add column if not exists is_test boolean not null default false;

alter table public.events
  drop constraint if exists events_priority_only_for_race;
alter table public.events
  add constraint events_priority_only_for_race
  check (
    (type = 'race') or (priority is null and ftp_goal is null and is_test = false)
  );

-- ------------------------------------------------------------
-- Entscheidung D5.2 (Konzept): Altbestand bleibt is_test=false (Spalten-
-- Default deckt das bereits ab). Einziger bekannter Testtermin ist der
-- FTP-Retest — deterministisch über das dokumentierte Datum
-- (state/config.js::CONFIG.retestDate = "2026-09-19") gesetzt, KEIN
-- Rateverfahren über den Titel. Idempotent: ein Re-Run trifft dieselbe
-- Zeile erneut, ändert nichts Neues.
-- ------------------------------------------------------------
update public.events
  set is_test = true
  where event_date = '2026-09-19' and type = 'race';

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- Spalten-Check: select event_date, type, is_test from events
--                order by event_date; -> Spalte vorhanden, nur die Zeile
--                mit event_date = 2026-09-19 (falls vorhanden) trägt true
-- als Athlet A:  neues Event anlegen -> is_test default false ✓
--                · bestehendes Event auf is_test=true patchen -> RLS
--                unverändert erlaubt (eigene Policies aus 0001/0004
--                greifen weiterhin über die ganze Zeile)
--                · type='other' Event mit is_test=true anlegen -> Fehler
--                (erweiterter Check-Constraint events_priority_only_for_race)
-- als Trainer A: is_test für Athlet A änderbar wie jedes andere Feld
--                (Admin-Policy aus 0004 unverändert)
-- als anon:      events weiterhin lesbar (inkl. is_test) ✓ · schreiben ✗
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
