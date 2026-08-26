-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0019: intervals_credentials
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/offene-punkte.md (Planungstab-Abschnitt, Rausch-Chart)
--
-- Persistiert den intervals.icu API-Key + die eigene intervals.icu-
-- Athlete-ID PRO PROFIL (profile_id ist Primärschlüssel, wie
-- export_prefs aus 0008 — ein Athlet hat höchstens eine Zeile).
--
-- WICHTIG: NICHT als Spalte auf public.profiles — profiles ist laut
-- 0002_grants.sql ("grant select on public.profiles to anon,
-- authenticated") komplett öffentlich lesbar. Eine eigene Tabelle mit
-- strikter Owner-only-RLS und OHNE anon-Grant ist hier zwingend.
-- ============================================================

create table if not exists public.intervals_credentials (
  profile_id          uuid primary key references public.profiles(id) on delete cascade,
  api_key             text not null,
  -- Bewusst NICHT "athlete_id" genannt — das Wort bedeutet in jeder
  -- anderen Tabelle dieses Projekts eine Supabase-Profil-UUID (FK). Hier
  -- ist es intervals.icus eigene Athleten-Kennung (z.B. "i12345").
  intervals_athlete_id text not null,
  updated_at          timestamptz not null default now()
);

alter table public.intervals_credentials enable row level security;

drop trigger if exists intervals_credentials_set_updated_at on public.intervals_credentials;
create trigger intervals_credentials_set_updated_at
  before update on public.intervals_credentials
  for each row execute function public.set_updated_at();

-- Nur der Eigentümer selbst liest/schreibt seine eigene Zeile — kein
-- öffentlicher Lesepfad, keine Coach-Policy (ein Trainer braucht/bekommt
-- nie den intervals.icu-Key seines Athleten).
drop policy if exists "intervals_credentials: nur der Eigentümer" on public.intervals_credentials;
create policy "intervals_credentials: nur der Eigentümer"
  on public.intervals_credentials for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on public.intervals_credentials to authenticated;
-- KEIN grant an anon.

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, api_key, intervals_athlete_id, updated_at
--                from intervals_credentials limit 1; -> alle Spalten vorhanden
-- als anon:      intervals_credentials lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigene Zeile anlegen/ändern ✓ · fremde Zeile (Athlet B)
--                lesen ✗ · fremde Zeile schreiben ✗
-- Update-Trigger: api_key ändern -> updated_at aktualisiert sich automatisch
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
