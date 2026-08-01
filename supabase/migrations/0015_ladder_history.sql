-- ============================================================
-- Dashboard 2.0 — Migration 0015: ladder_history (Leiterzustand je Format)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: docs/konzept-progressionssteuerung.md D2
--
-- Bewusst analog zu ftp_history (0009) modelliert: eine Historie mit
-- valid_from statt ein Einzelfeld pro Athlet+Format — ohne das lässt sich
-- im Nachhinein nicht rekonstruieren, auf welcher Stufe eine alte Einheit
-- geplant war, und der Blockvergleich (Konzept, Abschnitt 4) wird wertlos.
--
-- Anders als ftp_history braucht es hier eine Familie MEHR in der Historie
-- (format_id) — ein Athlet fährt mehrere Formate parallel (max. zwei pro
-- Blockziel, L1.1), jede mit eigenem Stufenverlauf. unique(profile_id,
-- format_id, valid_from) statt nur unique(profile_id, valid_from).
--
-- `reason`-Werte (D2): 'compliance-green'/'compliance-red' sind in diesem
-- Fenster (D4a) ausschliesslich fuer den lokalen Trockenlauf
-- (scripts/backtest-ladder.js) vorgesehen -- das Skript schreibt NICHTS in
-- diese Tabelle (reiner Dry-Run). Live geschrieben wird in diesem Fenster
-- nur 'manual'/'block-start' aus der UI (Familienauswahl D2, Blockstart-
-- Dialog D3).
-- ============================================================

create table if not exists public.ladder_history (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  format_id       text not null references public.session_formats(id),
  step            int not null check (step > 0),
  valid_from      date not null,
  reason          text not null
                  check (reason in ('compliance-green', 'compliance-red', 'manual', 'block-start')),
  source_ride_id  text,
  created_at      timestamptz not null default now(),
  unique (profile_id, format_id, valid_from)
);

alter table public.ladder_history enable row level security;

-- Für "aktuelle Stufe je Format" (core/ladder.js::currentLadderStep):
-- letzter Eintrag mit valid_from <= Datum, je profile_id+format_id.
create index if not exists ladder_history_profile_format_valid_from_idx
  on public.ladder_history (profile_id, format_id, valid_from desc);

-- RLS/GRANT identisch zum ftp_history-Muster (0009): nur der Athlet
-- schreibt für sich, Trainer liest über is_coach_of, kein anon-GRANT.
drop policy if exists "ladder_history: Athlet+Trainer lesen" on public.ladder_history;
create policy "ladder_history: Athlet+Trainer lesen"
  on public.ladder_history for select to authenticated
  using (profile_id = auth.uid() or public.is_coach_of(profile_id));

drop policy if exists "ladder_history: nur Athlet schreibt" on public.ladder_history;
create policy "ladder_history: nur Athlet schreibt"
  on public.ladder_history for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "ladder_history: nur Athlet ändert" on public.ladder_history;
create policy "ladder_history: nur Athlet ändert"
  on public.ladder_history for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "ladder_history: nur Athlet löscht" on public.ladder_history;
create policy "ladder_history: nur Athlet löscht"
  on public.ladder_history for delete to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete on public.ladder_history to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- Spalten-Check: select profile_id, format_id, step, valid_from, reason
--                from ladder_history limit 1; -> Tabelle leer, Query läuft
-- als Athlet A:  eigenen Eintrag anlegen (format_id 'sweetspot-long',
--                step=1, valid_from=heute, reason='block-start') ✓
--                · zweiten Eintrag selbes format_id+valid_from -> Fehler (unique)
--                · step=0 -> Fehler (Check-Constraint)
--                · reason='sonstwas' -> Fehler (Check-Constraint)
--                · format_id 'nicht-vorhanden' -> Fehler (FK)
--                · fremden Eintrag (Athlet B) lesen ✗ · schreiben ✗
-- als Trainer A: Einträge von Athlet A lesen ✓ (is_coach_of) · schreiben ✗
-- als anon:      ladder_history lesen ✗ (kein GRANT)
-- ============================================================
