-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0028: training_plans (+ plan_cards.plan_id)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co).
--             Vor dem prod-Einspielen Rückfrage bei Alex.
-- Referenz: docs/fahrplan-8-plan-generator.md — Etappe E1, Vertrag V1
--
-- ZWECK: Ein selbst gebauter Trainingsplan lebt komplett in der DB
-- (Entscheidung 2). Diese Tabelle hält die Rahmenbedingungen des
-- "Neuer Plan"-Dialogs UND die materialisierte Wochenstruktur
-- (week_model, jsonb — WeekModelEntry[] aus V4). Die Tageskarten
-- landen weiterhin in plan_cards, jetzt mit Rückverweis plan_id.
--
-- RLS: exakt das Muster aus 0001/0005 für plan_cards, ABER mit EINER
-- for-all-Policy (nicht der 0011-Split "Trainer nur UPDATE"). Grund:
-- Entscheidung 19 — der Trainer DARF den Anfangsplan für seinen
-- Athleten bauen (deckt canWriteForAthlete() bereits ab), also auch
-- INSERT. Prädikat für select/insert/update/delete gleich:
--   athlete_id = auth.uid() OR public.is_coach_of(athlete_id)
--   OR public.is_admin()
-- KEIN anon-GRANT (anders als goals/events/plan_cards) — ein Plan ist
-- nichts, das die öffentliche Portfolio-Ansicht braucht; Muster wie
-- ftp_history (0009).
--
-- Der service_role-GRANT für den Sync (scripts/generate-data.js liest
-- die aktive Zeile je Athlet) kommt bewusst NICHT hier, sondern in der
-- Sync-Umschaltung E8 (kleine Zusatz-Migration analog 0024) — E1 ändert
-- die App nicht und der Sync liest die Tabelle bis E8 nicht.
-- ============================================================

create table if not exists public.training_plans (
  id                uuid primary key default gen_random_uuid(),
  athlete_id        uuid not null references public.profiles(id) on delete cascade,
  created_by        uuid not null references public.profiles(id),
  is_active         boolean not null default true,
  mode              text not null check (mode in ('event','open')),
  goal_event_id     uuid references public.events(id) on delete set null,
  start_date        date not null,
  end_date          date not null,
  weeks             smallint not null,
  model             text not null check (model in ('pyramidal','polarized','block','linear')),
  focus             text not null check (focus in ('allgemein','berg','langstrecke','crit')),
  level             text not null check (level in ('einsteiger','fortgeschritten')),
  training_weekdays smallint[] not null,          -- ISO 1..7
  weekly_hours      numeric(4,1),
  indoor_share      numeric(3,2),                 -- 0..1
  ftp_at_creation   smallint,
  ftp_target        smallint,
  params            jsonb not null default '{}',  -- Roh-Formular + Aggregat-Momentaufnahme (Reproduzierbarkeit)
  week_model        jsonb not null,               -- WeekModelEntry[] (V4) — Quelle für plan-week-model (E7)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.training_plans enable row level security;

-- Nur EIN aktiver Plan je Athlet (E1-Vertrag). Partieller Unique-Index —
-- inaktive Alt-Pläne (is_active = false, "eingefrorene Vergangenheit")
-- kollidieren nicht.
create unique index if not exists training_plans_one_active
  on public.training_plans (athlete_id) where is_active;

-- Nachschlag von Karten zu ihrem Plan.
create index if not exists training_plans_athlete_idx
  on public.training_plans (athlete_id);

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
  before update on public.training_plans
  for each row execute function public.set_updated_at();

-- Eine for-all-Policy, Prädikat identisch für alle vier Commands
-- (s. Kopf). Athlet, sein Coach (is_coach_of) und Admin schreiben/lesen;
-- niemand sonst, kein anon.
drop policy if exists "training_plans: Athlet+Trainer+Admin" on public.training_plans;
create policy "training_plans: Athlet+Trainer+Admin"
  on public.training_plans for all to authenticated
  using (
    athlete_id = auth.uid()
    or public.is_coach_of(athlete_id)
    or public.is_admin()
  )
  with check (
    athlete_id = auth.uid()
    or public.is_coach_of(athlete_id)
    or public.is_admin()
  );

grant select, insert, update, delete on public.training_plans to authenticated;
-- KEIN grant an anon.

-- --- plan_cards.plan_id -------------------------------------------------
-- Rückverweis der Tageskarten auf ihren erzeugten Plan. Nullable —
-- bestehende Karten (Code-Vorlagen-Migration, manuelle Karten) tragen
-- keinen Plan. on delete set null: ein gelöschter Plan verwaist seine
-- Karten, löscht sie aber nicht (der Athlet kann sie weiter einzeln
-- pflegen). RLS/GRANT von plan_cards decken die neue Spalte über die
-- Zeile ab — keine Policy-Änderung nötig.
alter table public.plan_cards add column if not exists plan_id uuid
  references public.training_plans(id) on delete set null;

create index if not exists plan_cards_plan_id_idx
  on public.plan_cards (plan_id) where plan_id is not null;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- Spalten-Check: select id, athlete_id, created_by, is_active, mode,
--                goal_event_id, start_date, end_date, weeks, model, focus,
--                level, training_weekdays, weekly_hours, indoor_share,
--                ftp_at_creation, ftp_target, params, week_model,
--                created_at, updated_at from training_plans limit 1;
--                -> Tabelle leer, Query läuft ohne Fehler
--                select plan_id from plan_cards limit 1; -> Spalte da (null)
-- als anon:      training_plans lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigene Zeile (athlete_id = eigene uid) anlegen ✓
--                (mode='open', model='linear', focus='allgemein',
--                 level='einsteiger', training_weekdays='{2,4,6}',
--                 weeks=8, start_date/end_date gesetzt, week_model='[]')
--              · zweite Zeile mit is_active=true für denselben Athleten
--                -> Fehler (partieller Unique-Index training_plans_one_active)
--              · erste Zeile auf is_active=false patchen, dann zweite
--                aktive Zeile anlegen -> ok
--              · mode='foo' / model='foo' / focus='foo' / level='foo'
--                -> Fehler (CHECK)
--              · Zeile für fremde athlete_id (Athlet B / Trainer) anlegen
--                -> Fehler (RLS with check)
--              · Update-Trigger: Zeile ändern -> updated_at wandert mit
-- als Trainer A: Zeile für seinen Athleten A anlegen ✓ (is_coach_of) —
--                anders als plan_cards (dort Trainer nur UPDATE, 0011);
--                hier bewusst voll (Entscheidung 19)
--              · Zeile für Athlet B (nicht sein Athlet) anlegen -> Fehler
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
