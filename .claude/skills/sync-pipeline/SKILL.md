---
name: sync-pipeline
description: Datenquellen-Mix (JSON-Lesepfad vs. Supabase-Schreibpfad), athlete_sync_config-Zeilenmodell, Secrets-/Env-Layout (Root .env, apps01, GitHub Actions), Supabase-Migrationsworkflow inkl. Dev/Prod-Trennung, RLS-Testsuite und bekannte Sync-Eigenheiten (Sortierung, Feldnormalisierung, Ruhetags-Modell). Nutzen, wenn scripts/, scripts/lib/, supabase/migrations/ oder athlete_sync_config-nahe Themen bearbeitet werden.
---

# Supabase — Dev/Prod-Trennung

**Zwei „prod"-Backends, nicht verwechseln:** `dashboard-prod` auf `supabase.co`
ist eine Altlast — die Live-Seite spricht sie nicht an. Echte Produktion ist
der **apps01-Self-Host-Stack** unter `https://training-dashboard.clear-solutions-it.com`
(`window.__RUNTIME_CONFIG__` / `config.json`, anon-JWT mit `iss: "supabase-local"`).
Der apps01-Sync-Container liest alle 15 min aus **diesem** Stack
(`athlete_sync_config` / `plan_cards` / `ftp_history` / `profiles`), nicht aus
`supabase.co`. Migrationen und Seeds gehören an apps01. `dashboard-dev` auf
`supabase.co` bleibt unverändert der Test-/CI-Zielpunkt (Free Tier, max. 2
Projekte, kein Keep-Alive nötig).

**Hostname-basierte Config** (`app/src/api/supabase/config.ts`, `PROJECT_CONFIG`):
`localhost` → dev-Projekt, `stuhlsen.github.io` → das tote prod-Projekt (nicht
mehr live genutzt). Beide anon-Keys sind öffentlich (RLS schützt). Seit Fahrplan 3
DKR1 hat `window.__RUNTIME_CONFIG__` (aus einer vom Container geschriebenen
`config.json`) in `config.ts::resolveEntry()` Vorrang vor dieser Tabelle — das ist
der tatsächliche Pfad für apps01/Docker.

**Migrations-Workflow:** SQL-Skripte sind Quellcode unter `supabase/migrations/`
(laufnummeriert, nie eine bestehende nachträglich ändern). Sequence:
1. Lokal gegen `dashboard-dev` einspielen (`supabase db push` oder SQL-Editor).
2. Nach jedem Merge nach `main`, der das Schema erweitert: dieselbe Migration
   zusätzlich an den **apps01-Stack** einspielen (echte Produktion).
3. Migration wird committed — Versionshistorie, reproduzierbar.

**RLS-Testsuite** (`tests/supabase-rls.test.js`): läuft echt gegen `dashboard-dev`,
prüft `wellbeing_shared`- (kein `note` nach außen), `proposals`- und
`trainer_view_prefs`-Isolation sowie anon-Sperren. Braucht Live-Credentials in
`.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_ATHLETE1_EMAIL/_PASSWORD`,
`SUPABASE_TRAINER_EMAIL/_PASSWORD`) — ohne sie überspringt sich die Datei selbst
(kein CI-Fehlschlag). Jede Testzeile räumt sich im `after()`-Hook selbst auf; ein
fehlschlagender Aufräumschritt wirft mit einer Liste der Reste statt zu schweigen.

# Datenquellen-Mix (lesen/schreiben)

- **Lesedaten** (`data/rides-*.json`, `data/wellbeing*.json`, RHR, HRV, Wetter) →
  JSON-Pipeline (`scripts/generate-data.js`, alle 15 Min als Dauer-Container auf
  apps01, nicht mehr GitHub Actions).
- **Schreibdaten** (Ziele, Events, Befinden-Check-ins, Trainingskarten, Vorschläge,
  Feedback) → Supabase (RLS, Session-basiert).
- **Der Sync liest selbst lesend aus Supabase zurück:** `plan_cards` +
  `ftp_history` fließen in die JSON-Pipeline zurück, damit `rides.json` den
  echten Plan-Stand widerspiegelt (Athlet 1 und 2). Jeder Supabase-Zugriff des
  Sync läuft über **einen** `SUPABASE_SERVICE_ROLE_KEY` (RLS-Bypass):
  `scripts/lib/sync-config-fetch.js` liest in einem Aufruf `athlete_sync_config`
  (intervals.icu-Key + Athlete-ID + grober, serverseitig auf 2 Nachkommastellen
  gerundeter Standort je Athlet). Fehlt `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  oder scheitert der Read, bricht der Sync **hart ab** (kein stiller Fallback).
- **Zeilenmodell in `athlete_sync_config`:** Alle Athleten mit eigenem Login
  haben eine normale `profile_id`-Zeile (owner-only RLS), gepflegt self-service
  über **Settings**. Fehlt die Zeile eines Nebenathleten, schreibt
  `generate-data.js` dessen `rides-N.json` trotzdem (nur Plan-Baseline, keine
  Fahrten), `source: "plan-only"`.
- **Onboarding neuer Athlet:** anmelden → in Settings intervals.icu-Key +
  Athlete-ID + groben Standort eintragen → nächster Sync-Lauf nimmt ihn
  automatisch auf. Zusätzlich `NAME_TO_SLUG` in `scripts/lib/sync-config-fetch.js`
  **und** `ATHLETES[]` in `app/src/config.ts` pflegen.

# Secrets / Env-Layout

**apps01 (produktiv):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY` (nur für den anonymen `session_formats`-Read). Frühere
per-Athlet-Werte (`INTERVALS_API_KEY(_2/_4)`, `WEATHER_LAT/LON(_2/_4)`,
`SUPABASE_ATHLETE1/4_EMAIL/PASSWORD`, `NOTION_*`) sind entfallen — alle Athleten
laufen über `athlete_sync_config`. In den GitHub-Actions-Secrets bleiben sie als
**tote Secrets** stehen (bewusst nicht gelöscht, s. CLAUDE.md „Grenzen").

**`sync-data.yml`** (nur noch `workflow_dispatch`-Fallback, der Sync läuft
produktiv im apps01-Container): `SYNC_PUSH_TOKEN` ist seit Fahrplan 3 Fenster C
schlafend — die Action committet `data/*.json` nicht mehr.

**Nur lokal in `.env`** (RLS-Testsuite, Einmal-Skripte):
`SUPABASE_ATHLETE1/2/4_EMAIL/PASSWORD`, `SUPABASE_TRAINER_EMAIL/PASSWORD` (+
optionale `_PROD`-Gegenstücke). Details: `.env.example` +
`.github/workflows/sync-data.yml` (Kopfkommentar). **Achtung bei
`--env=prod`-Einmal-Skripten:** die `_PROD`-Werte zeigen historisch auf das tote
`dashboard-prod`-Projekt, nicht auf apps01 — für einen echten Live-Seed muss die
URL/der anon-Key inline auf den apps01-Host überschrieben werden.

# Bekannte Sync-Eigenheiten

- Fahrten am selben Datum werden nach `startTime` (`start_date_local`) sortiert;
  Plan-1-Fahrten (eingefrorene Historie) haben kein `startTime` → dort kein
  Tiebreaker.
- Athlet 2 hat aus intervals.icu nur Fahrten mit gültiger Distanz erfasst;
  distanzlose/unklassifizierte Aktivitäten sind bewusst ausgeschlossen.
- intervals.icu `/power-curves`: `oldest`/`newest` allein grenzen die Kurve
  NICHT auf den Zeitraum ein — ohne `curves`-Parameter liefert die API ein
  Preset (ein Jahr rückwärts ab `newest`). Für eine zeitraumgebundene Kurve ist
  `curves=r.<von>.<bis>` zwingend, s. `powerCurveQuery()` in `scripts/lib/intervals.js`.
- `zoneTimes`/`eftp` kommen aus `icu_zone_times`/`icu_eftp` — beide Formate
  werden normalisiert, mit Degradation samt Hinweistext, falls sie fehlen.
  eFTP-Historie mergt `icu_eftp` (je Fahrt) mit dem Wellness-Tageswert aus
  `scripts/lib/wellness.js`; welche Wellness-Felder real befüllt sind, zeigt
  `logWellnessCoverage` im Sync-Log.
- `mapActivity2()` (`scripts/lib/map-activity.js`) setzt für Athlet-2-Fahrten
  bewusst `week: null, phase: null` — der Plan-Bezug läuft ausschließlich über
  die eigenständigen `plannedSessions`/`adjustments`-Felder, NICHT über `ride.week`.
- **Ruhetage sind abgeleitet, keine `plan_cards`-Zeilen:** Ein Ruhetag ist „Tag
  in einer aktiven Planwoche, der laut Plan-Wochen-Modell
  (`app/src/core/plan-week-model.js` + `scripts/lib/core/`-Kopie) kein
  Trainings-Slot ist und keine aktive Karte trägt". Zählt nie als „verpasst".
