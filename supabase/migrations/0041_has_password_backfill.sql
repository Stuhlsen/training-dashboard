-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0041: has_password-Backfill für Bestandskonten
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
-- Referenz: planning/fahrplan-17-onboarding-assistent-profildaten.md,
--           Etappe E7 (Onboarding-Assistent), Bug-Report nach v1.30.0
--
-- BEFUND: Migration 0039 setzt has_password per Default auf false und
-- verlässt sich auf einen Trigger, der es nur beim ÜBERGANG "kein Passwort
-- -> Passwort gesetzt" auf true umschaltet (auth.users.encrypted_password
-- von leer/null auf gesetzt). Bestandskonten, die ihr Passwort schon VOR
-- dieser Migration hatten (encrypted_password war zu keinem Zeitpunkt nach
-- 0039 leer), durchlaufen diesen Übergang nie — has_password blieb für sie
-- dauerhaft false. Der Onboarding-Assistent (E7) zeigte deshalb bei jedem
-- Reload erneut den Passwort-Pflichtschritt, unabhängig davon, wie oft ein
-- neues Passwort gesetzt wurde (der Trigger greift auch beim erneuten
-- Setzen nicht, weil old.encrypted_password dabei nie leer ist). Einmaliger
-- Nachtrag hier, künftige echte Invite-Fälle deckt der Trigger aus 0039
-- weiterhin korrekt ab.
-- ============================================================

update public.profiles p
set has_password = true
from auth.users u
where u.id = p.id
  and u.encrypted_password is not null
  and u.encrypted_password <> ''
  and p.has_password = false;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- SELECT id, has_password FROM public.profiles; -> alle Bestandskonten mit
--   gesetztem Passwort auf true, echte offene Invites (kein Passwort) auf
--   false
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
