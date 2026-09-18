-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0042: has_password ueber RPC statt
--                 auth.users-Trigger
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
--
-- BEFUND (18.09.2026, Vorfall admin-Invite/Tony, live gegen den lokalen
-- Self-Host-Stack verifiziert): der Trigger aus 0039 nahm an,
-- auth.users.encrypted_password bliebe fuer frisch eingeladene Accounts
-- leer, bis die Person im Onboarding-Assistenten ihr eigenes Passwort
-- setzt. Das stimmt nicht — GoTrues /admin/generate_link (type=invite)
-- setzt bereits beim Anlegen einen (zufaelligen, niemandem bekannten)
-- Passwort-Hash. has_password sprang dadurch sofort auf true, der
-- Pflicht-Schritt "Passwort festlegen" wurde fuer JEDE Einladung komplett
-- uebersprungen — nicht nur fuer Tonys Fall, sondern vermutlich fuer jede
-- bisherige Einladung. Migration 0041 ("künftige echte Invite-Fälle deckt
-- der Trigger weiterhin korrekt ab") ging von der falschen Annahme aus.
--
-- FIX: has_password nicht mehr aus auth.users-Zustand ableiten (kein
-- zuverlaessiges Signal dort verfuegbar, um "GoTrue-Platzhalter" von
-- "Mensch hat bewusst ein Passwort gewaehlt" zu unterscheiden), sondern
-- explizit von unserem eigenen Code setzen — genau dann, wenn
-- setInitialPassword() (Onboarding-Assistent) erfolgreich war. Die RPC ist
-- security definer + auf auth.uid() beschraenkt, has_password bleibt wie
-- bisher nicht direkt per UPDATE-Grant beschreibbar.
-- ============================================================

drop trigger if exists auth_users_sync_has_password on auth.users;
drop function if exists public.sync_has_password();

create or replace function public.mark_password_set()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set has_password = true where id = auth.uid();
end;
$$;

grant execute on function public.mark_password_set() to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- neuen Athleten einladen -> profiles.has_password = false, bis der
--   Onboarding-Assistent das Passwort tatsaechlich speichert
-- als eingeloggter User: SELECT mark_password_set() -> setzt nur die
--   eigene Zeile (id = auth.uid()), kein Effekt auf fremde profiles
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
