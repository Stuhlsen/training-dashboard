-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0058: profiles.height_cm (noop),
--             profiles.sex, profiles.intolerances
--             (Ernährungs-Datengrundlage)
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach der apps01-Self-Host-Stack
--             (echte Produktion — NICHT dashboard-prod auf supabase.co)
-- Referenz: planning/fahrplan-23-ernaehrung.md, Etappe E0,
--           Entscheidungen E20/E21
--
-- BEFUND: Idea 4 (Ernährung/RED-S) braucht biologische Grunddaten und
-- Allergen-Informationen als Fundament für den RED-S Floor (E9/E1) und
-- die spätere Ernährungsanalyse (E5+). E0 definiert die Datenmodell-
-- Grundlage auf profiles.
--
--   height_cm    — bereits aus 0039 vorhanden (smallint,
--                  check between 100 and 250, erfüllt die Anforderung
--                  > 0). Hier nochmals als if not exists dokumentiert;
--                  Laufzeit-noop in bestehenden DBs.
--   sex          — biologisches Geschlecht für RED-S-Formel (m/f).
--                  NULL = "unknown" (E20 legt fest: Kennwert für den
--                  RED-S Floor ohne Wertung). Keine dritte Kategorie
--                  auf DB-Ebene — siehe E20-Kommentar im Fahrplan.
--   intolerances — Text-Array der EU-Hauptallergene (14 Kategorien +
--                  sonstiges Freitext). DB-seitig KEIN CHECK-Constraint
--                  auf die Werte — Validierung erfolgt ausschließlich
--                  auf Applikationsebene (core/-Konstante, Referenz:
--                  separates Taxonomy-Issue). Leeres Array '{}' = "keine
--                  Intoleranzen" (E21 erlaubt explizit "keine"). Das
--                  Feld hat default '{}' und ist NOT NULL, sodass ein
--                  INSERT/Update ohne Angabe automatisch die leere
--                  Liste setzt.
--
-- Datenschutz (V6): height_cm und sex sind personenbezogene
-- Gesundheitsdaten. Sie erben die bestehenden profiles-RLS-Policies
-- (owner-only) und sind NICHT auf der Basistabelle für anon/
-- authenticated gelistet (0022 grantet nur öffentliche Stammdaten).
-- KEIN service_role-Grant für sex oder intolerances — der RED-S Floor
-- und die Ernährungsanalyse sind reine Kernberechnungen
-- (app/src/core/), keine service_role-Auslese nötig.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Spalten hinzufügen
-- ------------------------------------------------------------

-- height_cm exists from 0039 (smallint, check between 100 and 250);
-- the if not exists guard makes re-runs harmless. The existing
-- constraint already satisfies "rejects non-integer / negative values"
-- (AC 2).
alter table public.profiles
  add column if not exists height_cm smallint
    check (height_cm is null or height_cm > 0);

-- sex: biological sex for RED-S formula. NULL = unknown (per E20).
-- Check allows NULL or single-char 'm'/'f' only.
alter table public.profiles
  add column if not exists sex text
    check (sex is null or sex in ('m', 'f'));

-- intolerances: text array of EU 14 allergens + sonstiges.
-- Validated at app layer (core/ constant), not via DB constraint.
-- Defaults to empty array = "keine" (E21). NOT NULL prevents
-- accidental NULL despite default.
alter table public.profiles
  add column if not exists intolerances text[] not null default '{}';

-- ------------------------------------------------------------
-- 2. profiles_own-View erweitern (self-service Lesepfad)
-- ------------------------------------------------------------
-- Die View (0039) listet Spalten explizit — sex und intolerances
-- müssen ergänzt werden, damit Athleten ihre eigenen Daten sehen.
create or replace view public.profiles_own
  with (security_invoker = off) as
select id, has_password, birthdate, resting_hr, gender, height_cm, weight_kg,
       hr_max, updated_at, sex, intolerances
from public.profiles
where id = auth.uid();

-- ------------------------------------------------------------
-- 3. Update-Grant erweitern
-- ------------------------------------------------------------
-- sex und intolerances sind selbst-schreibbar (Settings-Form, E5).
-- RLS-Policy "profiles: eigenes Profil ändern" (0001) gated bereits
-- via id = auth.uid() — nur Spaltenliste ergänzen.
revoke update on public.profiles from authenticated;
grant update (display_name, wellbeing_public, birthdate, resting_hr, gender,
              height_cm, weight_kg, hr_max, sex, intolerances)
  on public.profiles to authenticated;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Spalten-Check:
--   select height_cm, sex, intolerances from profiles limit 1;
--   → NULL, NULL, '{}' für bestehende Zeilen
--
-- Constraints:
--   insert into profiles (id, display_name) values (gen_random_uuid(), 'test')
--     on conflict do nothing; -- ok (Defaults: NULL, NULL, '{}')
--   update profiles set sex = 'x' where id = '<eigene-id>' → Fehler
--     (check in ('m','f'))
--   update profiles set sex = null where id = '<eigene-id>' → ok
--   update profiles set height_cm = -1 → Fehler (check > 0)
--   update profiles set height_cm = 0 → Fehler (check > 0)
--   update profiles set height_cm = 180 → ok
--   update profiles set intolerances = '{"erdnuss","milch"}' → ok
--   update profiles set intolerances = '{"non_eu_value"}' → ok
--     (DB lässt durch — App-Ebene prüft Taxonomy-Set)
--   update profiles set intolerances = null → Fehler (NOT NULL)
--   update profiles set intolerances = '{}' → ok ("keine")
--
-- Re-Run:
--   Migration ein zweites Mal ausführen → keine Fehler
--
-- RLS (bestehende Policies unverändert):
--   als Athlet A: GET /profiles_own → eigene Zeile mit sex,
--                 intolerances (neue Spalten sichtbar)
--   als Athlet A: GET /profiles_visible → KEINE der neuen Spalten
--                 (bewusst nicht in dieser View)
--   als Athlet B: GET /profiles_own → nur Bs eigene Zeile, kein A
--   als anon:     GET /profiles?select=sex,height_cm → Fehler
--                 (nur id, display_name, role, wellbeing_public
--                  sind anon lesbar, per 0022)
--   PATCH /profiles?id=eq.<fremde-id> mit sex='m' → RLS-Fehler
--     (policy "eigenes Profil ändern", using id = auth.uid())
--   PATCH /profiles_own?id=eq.<eigene-id> mit sex='m' → 204
--
-- Sync (service_role, kein Grant auf neue Spalten):
--   select id, display_name, sex, intolerances from profiles
--     → sex, intolerances: NULL (kein Grant → von PostgREST
--       unterdrückt, keine Fehler, weil RLS-Bypass und service_role
--       haben default grant on all tables; der fehlende Spalten-Grant
--       kehrt das für genau diese Spalten um)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.