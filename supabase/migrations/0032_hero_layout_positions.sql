-- migrate:up

-- ============================================================
-- Migration 0032: hero_tile_order.tile_order → hero_tile_order.layout
--
-- Ersetzt die reine Reihenfolge (0030, `tile_order text[]`) durch echte
-- 2D-Positionen (`layout jsonb`, Form `[{i, x, y}]` — Spalte/Zeile in
-- Rastereinheiten je Kachel). Grund: dnd-kit/sortable kannte nur eine
-- 1D-Reihenfolge, Alex wollte aber Kacheln bewusst UNTEREINANDER in
-- derselben Spalte anordnen können (Umbau auf react-grid-layout).
-- Additiver Spaltentausch statt Datenmigration — die Tabelle wurde erst
-- heute (0030) auf dashboard-dev angelegt, es gibt noch keine echten
-- Nutzdaten zu erhalten.
-- ============================================================

alter table public.hero_tile_order drop column if exists tile_order;
alter table public.hero_tile_order add column if not exists layout jsonb not null default '[]'::jsonb;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- Spalten-Check: select profile_id, layout, updated_at
--                from hero_tile_order limit 1; -> layout vorhanden,
--                tile_order nicht mehr vorhanden
-- RLS/Grants aus 0030 bleiben unverändert gültig (Spaltenänderung berührt
--                keine Policy/keinen Grant)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
