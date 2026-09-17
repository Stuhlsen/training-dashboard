-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0040: fehlende SELECT-Grants für service_role
--             auf profiles nachziehen (ftp_public, plan_offset_weeks,
--             birthdate, resting_hr, hr_max)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach apps01-Self-Host-Stack (echte
--             Produktion, NUR nach Rückfrage bei Alex, s. CLAUDE.md
--             "Grenzen")
-- Referenz: Incident 2026-09-17 — Sync auf apps01 lief ab 19:56 CEST alle
--           15min ins Leere, von Tony gemeldet und diagnostiziert.
--
-- BEFUND: Migration 0024 hat service_role SELECT nur auf (id, display_name)
-- von profiles gegrantet — genau die Spalten, die
-- scripts/lib/sync-config-fetch.js zu dem Zeitpunkt las. Seitdem kamen vier
-- weitere gelesene Spalten dazu (ftp_public 0025, plan_offset_weeks 0026,
-- birthdate/resting_hr 0035, hr_max 0039), aber keine dieser Migrationen hat
-- den service_role-Grant um die jeweils neue Spalte erweitert (0039 grantet
-- sogar explizit eine profiles-Spalte an service_role — has_password —, nur
-- eben nicht die gleichzeitig neu eingeführte hr_max, die der Sync ab
-- demselben Tag mitliest). PostgREST lehnt den kompletten SELECT ab, sobald
-- er auf eine nicht gegrantete Spalte trifft (42501 "permission denied for
-- table public.profiles"); sync-config-fetch.js wirft daraufhin per
-- getOrThrow(), generate-data.js bricht den kompletten Sync-Lauf hart ab
-- (CRED3-Design, kein stiller Fallback mehr) — rides.json blieb seit
-- 19:56 CEST unverändert, bis Tonys Meldung.
--
-- FIX: alle bislang vom Sync gelesenen profiles-Spalten in einer additiven
-- Grant-Anweisung nachziehen (Postgres-Spalten-Grants sind additiv, diese
-- Zeile ersetzt keine vorherige — id/display_name aus 0024 stehen hier nur
-- zur Vollständigkeit mit drin).
--
-- LEHRE (Tonys Hinweis): jede neue profiles-Spalte, die
-- sync-config-fetch.js künftig liest, braucht IN DERSELBEN Migration einen
-- passenden service_role-Grant — sonst genau dieser Fehler, still, weil der
-- Container nicht abstürzt, nur wiederholt fehlschlägt.
-- ============================================================

grant select (id, display_name, ftp_public, plan_offset_weeks, birthdate, resting_hr, hr_max)
  on public.profiles to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
-- als service_role: GET /rest/v1/profiles?select=id,display_name,ftp_public,plan_offset_weeks,birthdate,resting_hr,hr_max
--                   -> Zeilen
--                   GET /rest/v1/profiles?select=coach_id -> weiterhin 42501
-- Sync:             node scripts/generate-data.js (lokal gegen dashboard-dev)
--                   bzw. nächster Produktivlauf auf apps01 -> kein
--                   "profiles: Abruf"-Fehler mehr im Log, rides*.json mit
--                   aktuellem Zeitstempel
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
