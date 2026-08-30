-- migrate:up

-- ============================================================
-- Dashboard 2.0 — Migration 0023: athlete_sync_config
-- Einspielen: Supabase SQL-Editor / dbmate, dev-Projekt zuerst
--             (dashboard-dev), danach dashboard-prod
-- Referenz: docs/fahrplan-7-sync-credentials-self-service.md (CRED1)
--
-- ZWECK: Eine Tabelle für ALLES, was der Sync (scripts/generate-data.js)
-- pro Athlet an Zugangsdaten braucht — intervals.icu-Key + Athlete-ID und
-- den groben Standort für die Open-Meteo-Wettervorschau. Löst schrittweise
-- die pro Athlet wachsenden Sync-Env-Werte ab (INTERVALS_API_KEY(_2/_4),
-- INTERVALS_ATHLETE_ID(_2/_4), WEATHER_LAT/LON(_2/_4),
-- SUPABASE_ATHLETE*_EMAIL/PASSWORD). Der Sync liest die Tabelle ab CRED3
-- mit EINEM service_role-Aufruf (RLS-Bypass) statt mit einem Login pro
-- Athlet.
--
-- VERALLGEMEINERT intervals_credentials (0019): dieselbe Owner-only-RLS,
-- kein anon-Grant — plus Standort-Spalten und plus eine Zeilenart OHNE
-- profile_id für Athleten ohne Supabase-Login (Athlet 2, read-only
-- Vergleichsathlet). intervals_credentials bleibt VORERST bestehen und
-- wird hier nur ausgelesen; der Lese-Umstieg von generate-data.js /
-- scripts/lib/intervals-credentials-fetch.js auf diese Tabelle passiert
-- erst in CRED3.
--
-- DATENSCHUTZ (AGENTS.md "Wichtige Konventionen", höchste Priorität — mit
-- Alex am 2026-08-30 ausdrücklich freigegeben, die Regel wird in CRED6
-- umformuliert, nicht still gebrochen):
--   * weather_lat/weather_lon sind numeric(5,2)/numeric(6,2). Der SPALTENTYP
--     rundet jeden Schreibwert serverseitig auf 2 Nachkommastellen
--     (~1,1 km Unschärfe) — auch ein direkter PostgREST-Write mit 5
--     Nachkommastellen landet nur mit 2 in der Zeile. Kein Trigger nötig,
--     die Rundung liegt im Typ, nicht im UI.
--   * Owner-only-RLS, KEIN anon-Grant. Nur der Sync (service_role) liest
--     alle Zeilen.
--   * Wird nie über einen Frontend-Lesepfad ausgeliefert. In rides.json
--     stehen weiterhin nur Wetterwerte, nie Koordinaten (die Berechnung
--     bleibt serverseitig im Sync).
-- ============================================================

create table if not exists public.athlete_sync_config (
  id                   uuid primary key default gen_random_uuid(),

  -- Genau EINER der beiden Schlüssel ist gesetzt (CHECK unten):
  --  * profile_id  — Athlet mit Supabase-Login (Athlet 1, 4, künftige).
  --                  Die Owner-only-RLS hängt hieran, gepflegt self-service
  --                  über Settings (CRED2).
  --  * athlete_key — Athlet OHNE Supabase-Login (Athlet 2). Interne
  --                  Athleten-ID-Zeichenkette ("athlete2"), admin-gepflegt
  --                  (CRED2/CRED4), für anon/authenticated unsichtbar, nur
  --                  service_role liest sie.
  profile_id           uuid unique references public.profiles(id) on delete cascade,
  athlete_key          text unique check (athlete_key ~ '^athlete[0-9]+$'),
  constraint athlete_sync_config_one_key
    check ((profile_id is not null) <> (athlete_key is not null)),

  intervals_api_key    text,
  -- intervals.icus eigene Athleten-Kennung (z. B. "i12345") — NICHT eine
  -- Supabase-Profil-UUID (Namensfalle, s. Kommentar in 0019).
  intervals_athlete_id text,

  -- Grob gerundeter Standort für die Wettervorschau. numeric(x,2) erzwingt
  -- die 2-Nachkommastellen-Rundung serverseitig (s. Kopf, Datenschutz).
  weather_lat          numeric(5,2) check (weather_lat between -90 and 90),
  weather_lon          numeric(6,2) check (weather_lon between -180 and 180),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.athlete_sync_config enable row level security;

drop trigger if exists athlete_sync_config_set_updated_at on public.athlete_sync_config;
create trigger athlete_sync_config_set_updated_at
  before update on public.athlete_sync_config
  for each row execute function public.set_updated_at();

-- Nur der Eigentümer liest/schreibt seine eigene Zeile — exakt das Muster
-- aus intervals_credentials (0019) / export_prefs (0008). Zeilen mit
-- athlete_key (profile_id IS NULL) matchen "profile_id = auth.uid()" nie
-- und sind damit für jede eingeloggte Person unsichtbar — gewollt, die
-- pflegt nur der Sync bzw. das Seed-Skript (CRED4) über service_role.
drop policy if exists "athlete_sync_config: nur der Eigentümer" on public.athlete_sync_config;
create policy "athlete_sync_config: nur der Eigentümer"
  on public.athlete_sync_config for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

grant select, insert, update, delete on public.athlete_sync_config to authenticated;
-- KEIN grant an anon.

-- Der Sync läuft als service_role (RLS-Bypass in Supabase) und liest/pflegt
-- ALLE Zeilen in einem Aufruf. Grant explizit, weil der lokale Self-Host-
-- Stack die Default-Privilegien für service_role bei neuen Tabellen
-- entzieht (docker-compose.selfhost.yml, db-init: "ALTER DEFAULT PRIVILEGES
-- ... REVOKE ALL ON TABLES FROM anon, authenticated, service_role").
grant select, insert, update, delete on public.athlete_sync_config to service_role;

-- --- Bestandsübernahme aus intervals_credentials (0019), idempotent ------
-- Nur der intervals.icu-Teil; der Standort kommt per Settings (CRED2) bzw.
-- Seed-Skript (CRED4) dazu. Re-Run verwirft nichts (on conflict do nothing).
insert into public.athlete_sync_config (profile_id, intervals_api_key, intervals_athlete_id)
select ic.profile_id, ic.api_key, ic.intervals_athlete_id
  from public.intervals_credentials ic
on conflict (profile_id) do nothing;

-- ============================================================
-- PRÜFLISTE nach dem Einspielen (dev, dann prod):
-- Spalten-Check: select id, profile_id, athlete_key, intervals_api_key,
--                intervals_athlete_id, weather_lat, weather_lon, created_at,
--                updated_at from athlete_sync_config limit 1;
-- als anon:      athlete_sync_config lesen ✗ · schreiben ✗ (kein GRANT)
-- als Athlet A:  eigene Zeile (profile_id = eigene uid) anlegen/ändern ✓
--                · weather_lat = 52.51234 schreiben -> steht als 52.51 in
--                  der Zeile (numeric(5,2)-Rundung im Spaltentyp)
--                · fremde Zeile (Athlet B) lesen ✗ · schreiben ✗
--                · Zeile mit athlete_key statt profile_id anlegen ✗
--                  (RLS with check: profile_id = auth.uid())
-- als Trainer A: Zeilen von Athlet A NICHT lesbar (kein Coach-Zugriff,
--                wie intervals_credentials — der Key gehört nur dem Athleten)
-- CHECK:         Zeile mit BEIDEN Schlüsseln / KEINEM Schlüssel ✗;
--                athlete_key = 'hans' ✗ (Muster ^athlete[0-9]+$)
-- Bestandsübernahme: für jede intervals_credentials-Zeile existiert jetzt
--                eine athlete_sync_config-Zeile mit gleichem profile_id +
--                intervals_api_key / intervals_athlete_id
-- ============================================================

-- migrate:down
-- Bewusst leer: dieses Projekt rollt Migrationen nie automatisiert zurueck
-- (s. AGENTS.md, Migrations-Workflow). dbmate verlangt den Marker trotzdem.
