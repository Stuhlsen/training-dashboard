-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0021: account_deletion_requests
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: Settings-Tab-Redesign, Bereich "Datenschutz & Account".
--
-- Kein echtes Sofort-Löschen — das bräuchte die Supabase Admin-API
-- (service_role), die nie clientseitig laufen darf. Stattdessen: der
-- Athlet stellt einen Antrag (eine Zeile), Alex bearbeitet ihn manuell.
-- profile_id ist Primärschlüssel wie export_prefs (0008) und
-- intervals_credentials (0019) — höchstens ein offener Antrag pro Profil,
-- ein erneuter Antrag aktualisiert nur requested_at (Adapter-seitiges
-- upsert mit onConflict, s. account-deletion.ts).
--
-- WICHTIG: eigene Tabelle mit strikter Owner-only-RLS und OHNE anon-Grant
-- (Muster 1:1 aus 0019_intervals_credentials.sql) — ein Löschantrag ist
-- nicht öffentlich lesbar wie profiles selbst.
-- ============================================================

create table if not exists public.account_deletion_requests (
  profile_id   uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletion_requests enable row level security;

-- Nur der Eigentümer selbst liest/schreibt seine eigene Zeile — kein
-- öffentlicher Lesepfad, keine Coach-Policy.
drop policy if exists "account_deletion_requests: nur der Eigentümer" on public.account_deletion_requests;
create policy "account_deletion_requests: nur der Eigentümer"
  on public.account_deletion_requests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on public.account_deletion_requests to authenticated;
-- KEIN grant an anon.

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, requested_at from account_deletion_requests limit 1;
--                -> alle Spalten vorhanden
-- als anon:      account_deletion_requests lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigenen Antrag anlegen ✓ · erneut anlegen (upsert) aktualisiert
--                requested_at ✓ · fremden Antrag (Athlet B) lesen ✗ · schreiben ✗
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
