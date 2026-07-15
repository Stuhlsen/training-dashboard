-- ============================================================
-- Dashboard 2.0 — Migration 0004: Event-Verwaltung (events)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/phase-2-konzept-event-verwaltung.md
--
-- events existiert bereits aus 0001 (id, athlete_id, title, event_date,
-- priority, note, created_at). Diese Migration zieht das Schema additiv
-- auf den Konzeptstand nach:
--   - "type" neu (race/other, Abschnitt 1)
--   - "priority" von not-null/A-B-C auf nullable/main-secondary umgestellt
--     (Abschnitt 2/3) — Bestandscheck gegen dashboard-dev am 2026-07-15
--     ("select priority, count(*) from events group by priority" ->
--     "Success. No rows returned", Tabelle war leer) hat KEIN Mapping
--     nötig gemacht, deshalb direkte Umstellung ohne Datenmigration.
--   - "ftp_goal" neu, optional (Abschnitt 3)
--   - "updated_at" + Trigger — wiederverwendet set_updated_at() aus
--     0003_wellbeing.sql, kein neues Funktions-Duplikat (Abschnitt 3)
--   - CHECK-Constraint: priority/ftp_goal nur bei type='race' (Abschnitt 4a)
--   - Admin-Schreibzugriff war in 0001 nicht abgedeckt (bestehende Policy
--     prüft nur athlete_id = auth.uid() or is_coach_of()) — eigene,
--     additive Policy statt die bestehende Athlet+Trainer-Policy
--     anzufassen (Abschnitt 4/5/10)
--
-- event_date bleibt unverändert (kein Rename zu "date") — s. Konzept
-- Abschnitt 3/9.
-- ============================================================

-- ------------------------------------------------------------
-- 1. type (neu, Pflichtfeld) — Tabelle war zum Zeitpunkt der Migration
--    leer, deshalb ohne Default direkt NOT NULL möglich.
-- ------------------------------------------------------------
alter table public.events
  add column if not exists type text;

update public.events set type = 'race' where type is null;

alter table public.events
  alter column type set not null;

alter table public.events
  drop constraint if exists events_type_check;
alter table public.events
  add constraint events_type_check check (type in ('race', 'other'));

-- ------------------------------------------------------------
-- 2. priority: not null/A-B-C -> nullable/main-secondary
--    Kein Bestand vorhanden (s. Kopfkommentar) -> direkte Umstellung,
--    kein Mapping.
-- ------------------------------------------------------------
alter table public.events
  drop column if exists priority;

alter table public.events
  add column priority text check (priority in ('main', 'secondary'));

-- ------------------------------------------------------------
-- 3. ftp_goal (neu, optional)
-- ------------------------------------------------------------
alter table public.events
  add column if not exists ftp_goal int2;

-- ------------------------------------------------------------
-- 4. updated_at + Trigger (Funktion existiert bereits aus 0003)
-- ------------------------------------------------------------
alter table public.events
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 5. CHECK-Constraint: priority/ftp_goal nur bei type = 'race'
--    (Konzept Abschnitt 4a — echter DB-Check statt Anwendungslogik)
-- ------------------------------------------------------------
alter table public.events
  drop constraint if exists events_priority_only_for_race;
alter table public.events
  add constraint events_priority_only_for_race
  check (
    (type = 'race') or (priority is null and ftp_goal is null)
  );

-- ------------------------------------------------------------
-- 6. Admin-Schreibzugriff (Konzept Abschnitt 4/10 — fehlte in 0001)
--    Additive Policy statt die bestehende "Athlet+Trainer schreiben"
--    anzufassen; permissive Policies werden pro Command ODER-verknüpft.
--    GRANTs für authenticated (insert/update/delete) bestehen bereits
--    aus 0002 — Admin ist ebenfalls "authenticated", kein neues GRANT
--    nötig.
-- ------------------------------------------------------------
drop policy if exists "events: Admin schreibt alle" on public.events;
create policy "events: Admin schreibt alle"
  on public.events for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select event_date, type, priority, ftp_goal, updated_at
--                from events limit 1; -> alle Spalten vorhanden
-- als anon:      events lesen ✓ (unverändert aus 0001) · events schreiben ✗
-- als Athlet A:  event mit type='race', priority='main' anlegen ✓
--                · event mit type='other', priority='main' anlegen
--                -> Fehler (Check-Constraint events_priority_only_for_race)
--                · priority='C' anlegen -> Fehler (events_priority_check,
--                nur noch 'main'/'secondary' erlaubt)
--                · event von Athlet B schreiben ✗
-- als Trainer A: event für Athlet A anlegen ✓ (bestehend aus 0001)
--                · event für Athlet B (nicht sein Athlet) anlegen ✗
-- als Admin:     event für beliebigen Athleten anlegen/ändern ✓ (neu)
-- Update-Trigger: event ändern -> updated_at aktualisiert sich automatisch
-- ============================================================
