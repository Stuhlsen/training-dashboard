-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0025: profiles.ftp_public (FTP-Sichtbarkeit)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: Aufgabe "FTP-Anzeige im Hero für alle gleich + Öffentlich-Schalter"
--
-- BEFUND: Die Hero-FTP-Widgets (Leistungsskala, FTP-Ringe, FTP-Zeitstrahl)
-- zeigen die synchronisierten ftp_history-Werte nur dem eingeloggten
-- Athleten selbst; Besucher sehen den fest in app/src/config.ts stehenden
-- ftpMeasured-Wert (veraltet). Es fehlt ein nutzergesteuerter Schalter, der
-- die gemessene FTP + Ramp-Test-Historie im öffentlichen Lesepfad freigibt.
--
-- FIX: eine boolean-Spalte nach dem Muster von wellbeing_public (0001) —
-- Default true (sichtbar für alle), self-service über Settings. Der Sync
-- (scripts/generate-data.js) liest sie per service_role und schreibt die
-- FTP-Werte nur bei ftp_public = true in rides*.json. Kein Frontend-
-- Lesepfad für den Flag anderer Athleten nötig (serverseitiges Gating),
-- deshalb KEIN Eintrag in den anon-/authenticated-Basistabellen-SELECT-
-- Grant aus 0022.
-- ============================================================

alter table public.profiles
  add column if not exists ftp_public boolean not null default true;

-- Self-Service-UPDATE, spalten-restriktiv (wie display_name/wellbeing_public
-- 0001, ladder_progression_enabled 0018, units_preference 0020). Die
-- RLS-Policy "profiles: eigenes Profil ändern" (0001, using id = auth.uid())
-- ist spalten-agnostisch und deckt die neue Spalte automatisch ab.
grant update (ftp_public) on public.profiles to authenticated;

-- Der Sync liest per service_role (RLS-Bypass), analog 0024 (id, display_name).
grant select (ftp_public) on public.profiles to service_role;

-- profiles_visible-View (0022) um die Spalte erweitern — der Settings-Toggle
-- liest die eigene Zeile über diese View. Spaltenreihenfolge/-set 1:1 aus
-- 0022, nur ftp_public angehängt.
create or replace view public.profiles_visible
with (security_invoker = off) as
  select id, display_name, role, coach_id, wellbeing_public, is_admin,
         ladder_progression_enabled, units_preference, created_at, ftp_public
  from public.profiles
  where id = (select auth.uid())
     or coach_id = (select auth.uid());

revoke all on public.profiles_visible from anon, authenticated;
grant select on public.profiles_visible to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als anon:      GET /rest/v1/profiles?select=ftp_public -> Fehler (kein Grant)
--                (unverändert: nur id, display_name, role, wellbeing_public)
-- als Athlet:    GET /profiles_visible -> eigene Zeile trägt ftp_public
--                eigenes ftp_public per API auf false setzen -> ok
--                fremdes ftp_public setzen -> Fehler (RLS)
-- als service_role: GET /rest/v1/profiles?select=id,display_name,ftp_public
--                -> Zeilen (Sync-Lesepfad, sync-config-fetch.js)
-- Sync:          node scripts/generate-data.js -> rides.json trägt
--                "ftpPublic": true und (bei vorhandener ramp-test-Historie)
--                "ftp"/"ftpHistory"; nach Toggle auf false fehlen ftp/
--                ftpHistory, "ftpPublic": false
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
