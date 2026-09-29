-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0059: profiles.height_cm (noop),
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
--                  check between 100 and 250). Die hier notierte
--                  Check-Bedingung (> 0) kommt nur auf einer
--                  frischen DB zum Tragen (add column if not exists
--                  überspringt die ganze Klausel, wenn die Spalte
--                  existiert). Auf bestehenden DBs gilt 0039s
--                  between 100 and 250, was > 0 logisch einschließt
--                  und die AC (keine negativen/null-Werte) erfüllt.
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
-- PRIVACY (V6) / security review (#14 finding 2): height_cm und sex
-- sind personenbezogene Gesundheitsdaten. Owner-only-Scoping (via
-- bestehende RLS + Spalten-Grants) bleibt intakt:
--   - KEIN grant update für sex/intolerances (write path kommt
--     in E5 Settings-Form, analog 0035→0039).
--   - KEINE Aufnahme in profiles_own-View (self-service read
--     kommt ebenfalls in E5).
--   - KEIN service_role-Grant (RED-S Floor ist app/src/core/
--     Kernberechnung, keine service_role-Auslese nötig).
--   - Basistabelle select bleibt auf 0022-Satz beschränkt
--     (id,display_name,role,wellbeing_public) — neue Spalten
--     sind für anon/authenticated nicht sichtbar.
--   Die Spalten existieren auf DB-Ebene, sind aber ohne
--   Frontend-Lesepfad oder Write-Surface bis E5.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Spalten hinzufügen
-- ------------------------------------------------------------

-- height_cm exists from 0039 (smallint, check between 100 and 250).
-- The if not exists guard makes re-runs harmless. On an existing DB
-- the whole clause (including the > 0 check) is skipped because the
-- column already exists; 0039's between 100 and 250 is stricter and
-- already satisfies AC "rejects non-integer / negative values".
-- On a fresh DB (where height_cm does not yet exist) this creates
-- the column with the > 0 constraint.
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
-- 2. grants (NUR Spaltenanlage — Updates und View-Erweiterung
--    sind E5 vorbehalten, analog 0035 → 0039)
-- ------------------------------------------------------------
-- Bewusst KEIN revoke+grant update — der authenticated Schreibpfad
-- fuer sex/intolerances kommt erst mit dem Settings-Formular in E5.
-- Migration 0035 hielt es genauso (birthdate/resting_hr ohne update
-- grant, der kam in 0039).
--
-- Bewusst KEINE Erweiterung von profiles_own — der self-service
-- Lesepfad kommt ebenfalls in E5.
--
-- Die neuen Spalten fallen in der Zwischenzeit unter den
-- Basistabelle-select von 0022 (nur id,display_name,role,
-- wellbeing_public lesbar). Sie sind fuer anon/authenticated
-- unsichtbar, und service_role hat keinen Grant — der RED-S
-- Floor braucht sie nicht zum Sync-Zeitpunkt.

-- ============================================================
-- PRUEFLISTE nach dem Einspielen (dev, dann apps01):
--
-- Spalten-Check (service_role, bypasses RLS):
--   select id, height_cm, sex, intolerances from profiles limit 1;
--   -> NULL, NULL, '{}' fuer bestehende Zeilen (height_cm existiert
--     bereits aus 0039 mit seinem bisherigen Wert)
--
-- Constraints:
--   insert into profiles (id, display_name)
--     values (gen_random_uuid(), 'test') on conflict do nothing;
--     -- ok (Defaults: height_cm NULL, sex NULL, intolerances '{}')
--   update profiles set sex = 'x' where id = '<service_role-ok>'
--     -> Fehler (check in ('m','f'))
--   update profiles set sex = null ...  -> ok
--   update profiles set height_cm = -1  -> Fehler (check > 0)
--   update profiles set height_cm = 0   -> Fehler (check > 0)
--   update profiles set height_cm = 180 -> ok
--   update profiles set intolerances = '{"erdnuss","milch"}' -> ok
--   update profiles set intolerances = '{"non_eu_value"}' -> ok
--     (DB laesst durch — App-Ebene prueft Taxonomy-Set)
--   update profiles set intolerances = null -> Fehler (NOT NULL)
--   update profiles set intolerances = '{}' -> ok ("keine")
--
-- Re-Run:
--   Migration ein zweites Mal ausfuehren -> keine Fehler
--
-- RLS (bestehende Policies unveraendert, keine neuen Grants):
--   als anon:         GET /profiles?select=sex,height_cm -> Fehler
--                     (0022 grantet nur id,display_name,role,
--                      wellbeing_public)
--   als Athlet A:     GET /profiles_own -> KEINE sex/intolerances
--                     (View nicht erweitert — kommt in E5)
--   als Athlet A:     PATCH /profiles_own mit sex='m' -> Fehler
--                     (kein update grant fuer sex)
--   als Athlet A:     PATCH /profiles mit height_cm=180 -> ok
--                     (grant update aus 0039 fuer height_cm)
--   als Athlet A:     PATCH /profiles mit sex='m' -> RLS-Fehler
--                     (kein grant update fuer sex)
--   als Athlet B:     PATCH /profiles?id=eq.<A-id> mit height_cm ->
--                     RLS-Fehler (policy gated id = auth.uid())
--
-- Sync (service_role, kein Grant auf sex/intolerances):
--   select id, display_name, sex, intolerances from profiles
--     -> sex, intolerances als NULL angezeigt (kein Spalten-Grant
--       -> PostgREST unterdrueckt sie; RLS-Bypass allein reicht
--       nicht, weil service_role default grant on all tables
--       durch den fehlenden Spalten-Grant fuer genau diese
--       Spalten zurueckgenommen ist)
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.