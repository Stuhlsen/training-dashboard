-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0055: Warteliste härten (Fahrplan 22, E8,
-- Review-Befund). Einspielen: dev-Projekt zuerst (dashboard-dev), danach
-- apps01 — direkt nach 0054, Rückfrage bei Alex vor Prod.
--
-- 0054 erlaubt anon/authenticated ein INSERT auf ALLE Spalten und lässt
-- die E-Mail beliebig lang. Diese Migration:
--   - begrenzt die E-Mail auf 254 Zeichen (RFC-5321-Obergrenze), damit
--     niemand riesige Strings in die Tabelle schreibt;
--   - erlaubt anon/authenticated nur noch die Spalte `email`. `id`,
--     `source` und `created_at` setzt ausschließlich die Datenbank per
--     Default — niemand kann eigene IDs, Zeitstempel oder Quellen
--     einschmuggeln. Der Adapter (api/supabase/waitlist.ts) sendet ohnehin
--     nur `email`.
-- Lesen/Löschen bleibt wie in 0054 nur per Service-Role.
-- ============================================================

alter table public.waitlist
  add constraint waitlist_email_length check (char_length(email) <= 254);

revoke insert on public.waitlist from anon, authenticated;
grant insert (email) on public.waitlist to anon, authenticated;

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
