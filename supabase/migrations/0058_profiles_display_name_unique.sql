-- migrate:up
-- ============================================================
-- Migration 0058: Unique constraint on profiles.display_name
--
-- Hintergrund: Zwei Code-Pfade lösen Athleten per
-- display_name auf (findProfileIdByDisplayName und
-- getProfileByDisplayName). Das Feld ist self-service writable
-- (Settings → Anzeigename ändern) und hatte bislang keinen
-- unique Constraint. Bei einer Kollision (zwei Profile mit
-- demselben Anzeigenamen) würden die Lookups über .maybeSingle()
-- eine beliebige Zeile zurückgeben — die falsche UUID.
--
-- Impact: Gering, weil die RLS den tatsächlichen Schreibzugriff
-- über die echte athlete_id (uuid) durchsetzt, nicht über den
-- aufgelösten Wert. Das UI-Gate könnte aber Buttons falsch
-- ein-/ausblenden.
--
-- Fix: alter table ... add constraint ... unique.
-- Voraussetzung: keine bestehenden Duplikate (bei ≤4 Profilen
-- mit je eigenem Anzeigenamen praktisch ausgeschlossen).
-- ============================================================

alter table public.profiles
  add constraint profiles_display_name_unique
  unique (display_name);

-- migrate:down
alter table public.profiles
  drop constraint if exists profiles_display_name_unique;