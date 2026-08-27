-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0020: units_preference
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev),
--             danach dashboard-prod
-- Referenz: Settings-Tab-Redesign (Sprung-Navigation, 6 Bereiche),
--           Wunsch Alex: Einheiten-Umschalter km/mi wie auf anderen
--           Plattformen üblich.
--
-- Kleine athletenbesitzene Anzeigepräferenz, genau wie wellbeing_public/
-- ladder_progression_enabled (0001/0016) direkt auf profiles statt einer
-- eigenen Tabelle — kein Geheimnis, öffentlich lesbar wie der Rest der
-- Zeile (0002: "grant select on public.profiles to anon, authenticated").
--
-- WICHTIG (0001-Falle, s. "profiles: eigenes Profil ändern" + das
-- spaltenrestriktive `grant update (display_name, wellbeing_public) ...`
-- direkt darunter): die RLS-Policy allein reicht nicht — Postgres prüft
-- zusätzlich pro Spalte, ob überhaupt ein UPDATE-Grant existiert. 0018 hat
-- das für ladder_progression_enabled per eigenem GRANT nachgezogen, hier
-- dasselbe Muster für units_preference.
-- ============================================================

alter table public.profiles
  add column if not exists units_preference text not null default 'km'
    constraint profiles_units_preference_check check (units_preference in ('km','mi'));

grant update (units_preference) on public.profiles to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- Spalten-Check: select id, units_preference from profiles limit 1;
--                -> Spalte vorhanden, Default 'km' bei Bestandszeilen
-- als Athlet:    eigenes units_preference auf 'mi' setzen -> erfolgreich
--                ungültigen Wert (z.B. 'yd') setzen -> Fehler (Check-Constraint)
-- als Athlet:    coach_id/is_admin/display_name eines ANDEREN Profils ändern
--                -> weiterhin Fehler (RLS "eigene Zeile", 0001)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
