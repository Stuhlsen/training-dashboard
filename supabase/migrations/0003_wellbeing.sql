-- ============================================================
-- Dashboard 2.0 — Migration 0003: Morgen-Check-in (wellbeing)
-- Einspielen: Supabase SQL-Editor, dev-Projekt zuerst (dashboard-dev)
-- Referenz: docs/phase-2-konzept-morgen-checkin.md
--
-- wellbeing + profiles.wellbeing_public existieren bereits aus 0001.
-- Diese Migration zieht das Schema additiv auf den Konzeptstand nach:
--   - "sleep"-Selbstauskunft entfällt (Schlaf kommt künftig als
--     gemessener Score aus intervals.icu in den OBJEKTIVEN Kanal,
--     s. Konzept Abschnitt 2 "Schlaf bewusst kein Slider")
--   - "muscles" -> "muscle_feel" (Konzept Abschnitt 3, Data-Access-
--     Vertrag aus Schritt B/F erwartet diesen Namen)
--   - updated_at + Trigger fürs Upsert-Tracking (Konzept Abschnitt 3)
--   - unique(athlete_id, date) besteht bereits aus 0001, unverändert
--
-- ABWEICHUNG vom Konzept-Abschnitt 4/D5 (spaltengenaue anon-GRANTs
-- direkt auf der Basistabelle): 0001 hat den öffentlichen Zugriff
-- bereits über eine eigene, security-definer-View (wellbeing_shared,
-- gefiltert über wellbeing_is_public()) gelöst — bewusst als EINZIGE
-- Zugriffsfläche für anon ("Öffentlicher Zugriff läuft ausschließlich
-- über die View", 0001 Kommentar). Rücksprache 15.07.: View-Ansatz
-- beibehalten statt einen zweiten, parallelen anon-Zugriffspfad (Policy
-- + Column-Grant auf der Basistabelle) aufzumachen. Ergebnis ist
-- funktional identisch zu D5 (anon sieht nie note, nie ohne Freigabe),
-- nur über einen Pfad statt zwei.
-- ============================================================

-- View zuerst weg, sie hängt an den Spalten, die wir gleich ändern.
drop view if exists public.wellbeing_shared;

alter table public.wellbeing
  drop column if exists sleep;

alter table public.wellbeing
  rename column muscles to muscle_feel;

alter table public.wellbeing
  add column if not exists updated_at timestamptz not null default now();

-- Wiederverwendbarer updated_at-Trigger (noch keiner im Repo vorhanden —
-- ab hier Standardmuster für künftige Tabellen mit updated_at).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists wellbeing_set_updated_at on public.wellbeing;
create trigger wellbeing_set_updated_at
  before update on public.wellbeing
  for each row execute function public.set_updated_at();

-- Öffentliche Befinden-Sicht (E2/D5-Wirkung, s. Kopfkommentar): ohne
-- note, nur wenn der Athlet wellbeing_public aktiviert hat. Spaltenset
-- auf den Konzeptstand nachgezogen (kein sleep, muscle_feel statt
-- muscles). View läuft mit Owner-Rechten und filtert selbst — der
-- Filter ist deshalb Pflicht, nicht Deko.
create view public.wellbeing_shared
with (security_invoker = off) as
  select w.athlete_id, w.date, w.energy, w.muscle_feel, w.mood
  from public.wellbeing w
  where public.wellbeing_is_public(w.athlete_id);

revoke all on public.wellbeing_shared from anon, authenticated;
grant select on public.wellbeing_shared to anon, authenticated;

-- Basistabelle: RLS-Policies (Athlet voller r/w, Coach lesend inkl.
-- note via is_coach_of) bestehen bereits unverändert aus 0001. GRANT
-- für authenticated besteht bereits aus 0002 (grant select, insert,
-- update, delete on public.wellbeing to authenticated) — hier erneut
-- gesichert, falls 0002 in einer dev-Instanz übersprungen wurde. Kein
-- GRANT für anon auf der Basistabelle (s. Kopfkommentar).
grant select, insert, update, delete on public.wellbeing to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev):
-- als anon:      wellbeing (Basistabelle) direkt lesen ✗ (kein Grant)
--                · wellbeing_shared lesen ✓, aber leer, solange kein
--                Athlet wellbeing_public=true gesetzt hat · nach Toggle:
--                date/energy/muscle_feel/mood sichtbar, note NIE
-- als Athlet A:  heutigen Check-in zweimal upserten (gleiches Datum)
--                -> bleibt 1 Zeile, updated_at ändert sich · fremden
--                Check-in (Athlet B) lesen ✗
-- als Trainer A: wellbeing von Athlet A lesen ✓ (inkl. note) · von
--                Athlet B ✗
-- Spalten-Check: select sleep from wellbeing -> Fehler (Spalte weg)
--                · select muscle_feel from wellbeing -> ok
-- ============================================================
