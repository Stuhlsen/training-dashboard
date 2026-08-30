-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0024: SELECT-Grants für service_role auf die
--             Tabellen, die der Sync liest
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach dashboard-prod
-- Referenz: docs/fahrplan-7-sync-credentials-self-service.md (CRED3)
--
-- BEFUND: Der Sync (scripts/generate-data.js) liest ab Fahrplan 7 CRED3
-- alle Athletendaten mit EINEM service_role-Key (RLS-Bypass) statt mit
-- einem Login pro Athlet. Auf diesem Projekt hat service_role aber KEIN
-- SELECT auf die betroffenen Tabellen: Migration 0001/0002/0009 granten
-- nur an anon/authenticated, 0022 härtet profiles spaltengenau ebenfalls
-- nur für anon/authenticated. Ein service_role-GET läuft deshalb in 42501
-- ("permission denied for table …", Hinweis "GRANT SELECT ON … TO
-- service_role"). Ohne diese Grants degradiert der Sync GERÄUSCHLOS:
-- plan_cards/ftp_history kommen leer zurück, effectivePlan fällt auf den
-- statischen Plan und ftpAt() auf DEFAULT_FTP zurück — genau der stille
-- Fallback, den CRED3 abschaffen soll.
--
-- FIX: SELECT für service_role auf die drei gelesenen Tabellen.
--   * profiles          — nur (id, display_name); genau die zwei Spalten,
--                          die scripts/lib/sync-config-fetch.js für die
--                          display_name → Athleten-Slug-Auflösung liest.
--                          display_name ist über 0022 bereits anon-
--                          öffentlich, coach_id/is_admin/… bleiben außen vor.
--   * plan_cards         — ohnehin schon anon-lesbar (0001, "öffentlich
--                          lesbar"); der Grant zieht service_role gleich.
--   * ftp_history        — owner-only (0009); service_role liest per
--                          RLS-Bypass alle Zeilen. Das ist die beabsichtigte
--                          CRED3-Zugriffsebene (identisch zu dem, was 0023
--                          für athlete_sync_config bereits tut).
--
-- Kein Datenschutz-/Sicherheits-Zugewinn für Dritte: service_role läuft
-- ausschließlich serverseitig im Sync (nie im Frontend, nie im Repo), der
-- Key liegt nur auf apps01 bzw. lokal in .env.
-- ============================================================

grant select (id, display_name) on public.profiles to service_role;
grant select on public.plan_cards  to service_role;
grant select on public.ftp_history to service_role;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- als service_role: GET /rest/v1/profiles?select=id,display_name   -> Zeilen
--                   GET /rest/v1/profiles?select=coach_id          -> 42501
--                   GET /rest/v1/plan_cards?select=id&limit=1      -> Zeile
--                   GET /rest/v1/ftp_history?select=profile_id&limit=1 -> Zeile
-- als anon:         GET /rest/v1/profiles?select=id,display_name    -> Zeilen
--                   (unverändert, 0022)
--                   GET /rest/v1/ftp_history                        -> 401/leer
--                   (unverändert, owner-only)
-- Sync:             node scripts/generate-data.js — für Athlet 1 erscheint
--                   "FTP-Historie: N Einträge" und "Compliance (Athlet 1):
--                   … M plan_cards geladen" (nicht mehr "0 plan_cards" /
--                   "Fallback auf DEFAULT_FTP")
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
