-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0043: service_role darf role/is_admin setzen
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co,
--              NUR nach Rückfrage bei Alex, s. CLAUDE.md "Grenzen")
--
-- BEFUND: Der Einladungs-Dialog (InviteAthleteSection.tsx) soll beim
-- Einladen auch festlegen können, ob die Person Athlet oder Trainer wird
-- (profiles.role) und ob sie Admin-Rechte bekommt (profiles.is_admin).
-- Beide Spalten sind bewusst NIE per UPDATE-Grant für `authenticated`
-- erreichbar (0001/0039 — niemand darf sich selbst zum Admin machen).
-- admin-api setzt sie deshalb direkt per service_role-PATCH nach dem
-- Anlegen des Kontos — dafür fehlte bisher jedes Schreibrecht, service_role
-- hatte auf profiles bislang nur SELECT (0024/0040).
-- ============================================================

grant update (role, is_admin) on public.profiles to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01 — nach Rückfrage):
-- als service_role: PATCH /profiles?id=eq.<test-id> mit {"role":"coach",
--   "is_admin":true} -> 204, Zeile aktualisiert
-- als eingeloggter Athlet: PATCH /profiles?id=eq.<eigene-id> mit
--   {"role":"coach"} -> weiterhin kein Effekt (kein Grant für authenticated)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
