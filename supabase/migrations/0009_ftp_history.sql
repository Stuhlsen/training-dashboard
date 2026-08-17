-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0009: ftp_history (zeitpunktbezogene FTP)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: claude-code-prompt-ftp-historie.md
--
-- Eigenständige Tabelle statt Verknüpfung an events (Entscheidung vom
-- 30.07.2026, s. Bericht): events.type kennt heute nur 'race'/'other',
-- kein "FTP-Test" — eine Event-Verknüpfung hätte einen dritten type-Wert,
-- eine neue Ergebnis-Spalte (ftp_goal ist das RENN-Ziel, ein anderer
-- Wert) und eine Sichtbarkeits-Sonderregel gebraucht (events ist per E1
-- öffentlich lesbar, FTP soll das laut Auftrag nicht ungeprüft sein).
-- Eine eigene Tabelle macht das ohne Retrofit auf einer produktiv
-- genutzten Tabelle und lässt manuelle Schätzwerte ohne Testevent zu
-- (z. B. Trainingsstart).
--
-- Jeder Athlet pflegt ausschließlich seine eigene Historie (Vorbild:
-- wellbeing aus 0001 — Trainer liest mit, schreibt aber nicht für den
-- Athleten). FTP ist nicht öffentlich lesbar (anders als goals/events/
-- plan_cards, E1) — kein wellbeing_shared-artiges Public-Opt-in in v1,
-- das war im Auftrag nicht verlangt und lässt sich additiv nachziehen,
-- falls gewünscht.
--
-- "Es muss immer mindestens einen Eintrag geben" (Auftrag) ist hier
-- bewusst KEINE DB-Constraint (bräuchte einen Trigger für eine sinnvolle
-- Durchsetzung, unverhältnismäßig für dieses Sicherheitsnetz) — das
-- garantiert stattdessen ftpAt() (Schritt 2) per Fallback auf die
-- Referenz-FTP, wenn die Tabelle für ein Profil leer ist oder das
-- Fahrtdatum vor dem ältesten Eintrag liegt.
-- ============================================================

create table if not exists public.ftp_history (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  ftp_watt   int2 not null check (ftp_watt > 0),
  valid_from date not null,
  source     text not null default 'ramp-test'
             check (source in ('ramp-test', 'schaetzung')),
  note       text,
  created_at timestamptz not null default now(),
  -- verhindert zwei Werte für denselben Gültigkeits-Tag — sonst ist die
  -- "letzter Eintrag ≤ Fahrtdatum"-Auflösung in ftpAt() nicht mehr eindeutig
  unique (profile_id, valid_from)
);

alter table public.ftp_history enable row level security;

-- Für ftpAt(profileId, date): letzter Eintrag mit valid_from <= Datum.
create index if not exists ftp_history_profile_valid_from_idx
  on public.ftp_history (profile_id, valid_from desc);

-- Nur der Athlet selbst schreibt (Vorbild wellbeing), Trainer liest mit —
-- kein öffentlicher Lesepfad (anders als goals/events/plan_cards, E1).
drop policy if exists "ftp_history: Athlet+Trainer lesen" on public.ftp_history;
create policy "ftp_history: Athlet+Trainer lesen"
  on public.ftp_history for select to authenticated
  using (profile_id = auth.uid() or public.is_coach_of(profile_id));

drop policy if exists "ftp_history: nur Athlet schreibt" on public.ftp_history;
create policy "ftp_history: nur Athlet schreibt"
  on public.ftp_history for insert to authenticated
  with check (profile_id = auth.uid());

drop policy if exists "ftp_history: nur Athlet ändert" on public.ftp_history;
create policy "ftp_history: nur Athlet ändert"
  on public.ftp_history for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "ftp_history: nur Athlet löscht" on public.ftp_history;
create policy "ftp_history: nur Athlet löscht"
  on public.ftp_history for delete to authenticated
  using (profile_id = auth.uid());

grant select, insert, update, delete on public.ftp_history to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, ftp_watt, valid_from, source,
--                created_at from ftp_history limit 1; -> Tabelle leer,
--                aber Query läuft ohne Fehler (Schema vorhanden)
-- als anon:      ftp_history lesen ✗ (kein GRANT für anon)
-- als Athlet A:  eigenen Eintrag anlegen (ftp_watt=193,
--                valid_from='2026-06-12') ✓
--                · zweiten Eintrag mit demselben valid_from anlegen
--                -> Fehler (unique-Constraint)
--                · ftp_watt=0 anlegen -> Fehler (Check-Constraint)
--                · source='geschaetzt' (falscher Wert) anlegen -> Fehler
--                · fremden Eintrag (Athlet B) lesen ✗ · schreiben ✗
-- als Trainer A: Einträge von Athlet A lesen ✓ (is_coach_of) · schreiben ✗
--                (keine Insert/Update/Delete-Policy für Trainer)
-- als Athlet B:  Einträge von Athlet A weder lesen noch schreiben ✗
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
