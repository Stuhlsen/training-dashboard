-- migrate:up

-- ============================================================
-- Migration 0033: hero_tile_order pro Athleten-Tab
--
-- 0030/0032 legten hero_tile_order rein auf profile_id (den eingeloggten
-- Betrachter) fest — ohne Bezug darauf, WELCHEN Athleten-Tab er sich gerade
-- ansieht. Ein Betrachter, der zwischen mehreren Athleten-Tabs hin- und
-- herschaltet (Athleten-Toggle, s. AGENTS.md), bekam dadurch für alle Tabs
-- dieselbe Anordnung (Bug-Fund Alex, 07.09.2026: Stuhlsens eigene
-- Umsortierung erschien identisch bei hc_diZee/bentastiic).
--
-- `athlete_id` speichert bewusst die interne App-Kennung
-- ("athlete1"/"athlete2"/"athlete4", s. app/src/config.ts) als reinen
-- text, NICHT die Supabase-Profil-UUID des angesehenen Athleten: die Zeile
-- bleibt ohnehin ausschließlich vom Betrachter selbst gelesen/geschrieben
-- (RLS unverändert `profile_id = auth.uid()`), es braucht keinen
-- Fremdschlüssel auf ein fremdes Profil, und die App-Kennung bleibt auch
-- dann gültig, wenn der angesehene Athlet (noch) gar keinen eigenen
-- Supabase-Account hat (anders als plan_cards.athlete_id, das echte fremde
-- Zeilen referenziert und deshalb eine echte UUID braucht).
--
-- Bestandsdaten: anders als bei 0030 gibt es inzwischen echte Nutzdaten
-- (Stuhlsens eigene Umsortierung). Die bestehende(n) Zeile(n) werden auf
-- athlete_id='athlete1' rückdatiert — der Primärathlet, mit sehr hoher
-- Wahrscheinlichkeit der Tab, auf dem tatsächlich umsortiert wurde (Hero
-- landet standardmäßig auf dem eigenen Athleten) — statt die schon
-- gespeicherte Anordnung stillschweigend verschwinden zu lassen. Betrifft
-- eine überschaubare, noch sehr junge Datenmenge (0030 selbst wurde erst
-- vor einer Woche angelegt).
-- ============================================================

alter table public.hero_tile_order add column if not exists athlete_id text;
update public.hero_tile_order set athlete_id = 'athlete1' where athlete_id is null;
alter table public.hero_tile_order alter column athlete_id set not null;

alter table public.hero_tile_order drop constraint if exists hero_tile_order_pkey;
alter table public.hero_tile_order add primary key (profile_id, athlete_id);

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev/apps01):
-- Spalten-Check: select profile_id, athlete_id, layout, updated_at
--                from hero_tile_order; -> athlete_id vorhanden, bestehende
--                Zeile(n) auf 'athlete1' gesetzt (VOR dem Einspielen prüfen,
--                ob das für die konkret vorhandene(n) Zeile(n) stimmt —
--                falls nicht, nach dem Einspielen einmalig per SQL-Editor
--                korrigieren, s. Migrationskommentar oben)
-- Primärschlüssel: \d hero_tile_order -> (profile_id, athlete_id)
-- als Athlet A: Zeile für athlete_id='athlete2' UND 'athlete1' parallel
--               anlegen -> beide bleiben unabhängig bestehen, keine
--               Überschreibung
-- RLS/Grants aus 0030 bleiben unverändert gültig (nur profile_id relevant)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
