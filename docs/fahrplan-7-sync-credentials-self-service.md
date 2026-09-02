# Fahrplan 7: Sync-Zugangsdaten self-service, Env-loser Sync-Container

**Stand:** 2026-09-02 — **CRED0–CRED6 umgesetzt, Fahrplan abgeschlossen.**
Commits: `65b2b65` CRED1, `0a048bc` CRED2, `eff0cb8` CRED3, `2eef300` CRED4,
`c3c37b8` CRED5-Rest (Repo), CRED6 (dieser Commit). Migrationen
`0023_athlete_sync_config.sql` + `0024_sync_service_role_grants.sql`,
`scripts/lib/intervals-credentials-fetch.js` umbenannt in
`scripts/lib/sync-config-fetch.js`. Der apps01-Teil von CRED5 (Env-Schrumpfung,
0023/0024 eingespielt, voller Live-Sync) ist von Tony erledigt und verifiziert:
Sync-Container auf `v1.10.0`, Env auf `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY` (+ `NOTION_*`), Intervall
15 min, alle 3 Athleten schreiben ohne Credential-Weitergabe. Der
Service-Role-Key liegt ausschließlich auf apps01.
**Ursprünglicher Stand:** 2026-08-29
**Zielablage:** `docs/fahrplan-7-sync-credentials-self-service.md`
**Herkunft:** Frage von Alex im Anschluss an Issue #31 /
`fahrplan-3-sync-produktivbetrieb.md`: Der Sync-Container läuft künftig auf
apps01, aber weiterhin über eine Env-Datei mit einem pro Athlet wachsenden
Satz Secrets. Gesucht: ein Weg, bei dem ein neuer Athlet **ohne** Env-Änderung
und **ohne** Zutun von Tony dazukommt. Eigenständige Initiative, hängt an
`fahrplan-3-sync-produktivbetrieb.md` (s. „Abhängigkeiten"), blockiert keinen
anderen Fahrplan.

---

## Ziel

Die Env des Sync-Containers schrumpft auf **zwei feste Werte**:

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Alles andere — intervals.icu-Key + Athlete-ID, Standortkoordinaten, der
Zugang zum `plan_cards`/`ftp_history`-Rücklesepfad — liest der Sync zur
Laufzeit aus **einer RLS-geschützten Supabase-Tabelle**, die jeder Athlet
über **Settings** selbst füllt.

**Neuer Athlet danach:** anmelden → in Settings intervals.icu-Key +
Athlete-ID + groben Standort eintragen → beim nächsten Sync-Lauf
automatisch dabei. Keine Env-Zeile, kein Quadlet-Eingriff, keine
Rücksprache mit Tony.

Nicht-Ziel: Notion. `NOTION_API_KEY`/`NOTION_DATABASE_ID` betreffen nur
Athlet 1, Plan 1 (abgeschlossene Historie März–Juni 2026) und wachsen nie
mit Athleten — bleiben als fester Wert bzw. werden später eingefroren, kein
Teil dieses Umbaus.

---

## Warum

### Der Ist-Zustand

Der Sync liest heute je Athlet aus **zwei verschiedenen Quellen**
gemischt (`scripts/lib/env.js`, `scripts/generate-data.js`):

| Wert | Athlet 1 | Athlet 2 | Athlet 4 |
|---|---|---|---|
| intervals.icu Key + Athlete-ID | `INTERVALS_API_KEY` / `_ATHLETE_ID` (Env) | `…_2` (Env) | Supabase `intervals_credentials` (Migration 0019) |
| Standort (Wetter) | `WEATHER_LAT/LON` (Env) | `WEATHER_LAT/LON_2` (Env) | `WEATHER_LAT/LON_4` (Env) |
| Login für `plan_cards`/`ftp_history` | `SUPABASE_ATHLETE1_EMAIL/PASSWORD` (Env) | — (read-only, kein Login) | `SUPABASE_ATHLETE4_EMAIL/PASSWORD` (Env) |

Jeder neue Athlet mit echtem Modell (wie Athlet 4) bringt heute mindestens
`SUPABASE_ATHLETE<N>_EMAIL/PASSWORD` und `WEATHER_LAT/LON_<N>` als neue
Env-Zeilen mit. Auf apps01 heißt das: Tony bearbeitet die Quadlet-Env-Datei,
startet den Container neu. Das skaliert nicht und verteilt Betriebswissen auf
zwei Personen.

### Der Baustein ist schon da

Athlet 4 macht es **für intervals.icu bereits richtig**: kein
`INTERVALS_API_KEY_4`-Secret, der Athlet trägt den Key selbst in
**Settings → intervals.icu** ein (`app/src/features/settings/IntervalsSection.tsx`),
er landet in `intervals_credentials` (owner-only RLS, kein anon-Grant,
Migration 0019), der Sync liest ihn über
`scripts/lib/intervals-credentials-fetch.js`.

Dieser Fahrplan verallgemeinert dieses Muster:
1. auf **alle** Athleten (nicht nur Athlet 4),
2. auf **alle** Sync-Zugangsdaten (Standort dazu, Login-Umweg raus),
3. mit **einem Service-Role-Zugriff** statt eines Logins pro Athlet.

### Warum Service-Role statt Login pro Athlet

`intervals-credentials-fetch.js` loggt sich heute **als der jeweilige
Athlet** ein (`grant_type=password`), um dessen owner-only-Zeile zu lesen.
Das braucht pro Athlet ein Email/Passwort-Paar in der Env — genau das, was
weg soll. Der Sync ist ein serverseitiger Batch-Job auf apps01, der
ohnehin alle Athletendaten schreibt; ein **Service-Role-Key** (RLS-Bypass,
liest alle Zeilen der Config-Tabelle in einem Aufruf) ist die passende
Zugriffsebene und existiert im Self-Host-Stack bereits (DKR3, aus
`JWT_SECRET` signiert). Er darf ausschließlich auf apps01 liegen — nie im
Frontend, nie im Repo, nie in einem Issue/Kommentar.

---

## Datenschutz — Entscheidungspunkt vor allem anderen

`AGENTS.md`, Abschnitt „Wichtige Konventionen":

> Standortkoordinaten NIEMALS im Code, JSON oder Kommentaren
> Ausschließlich über GitHub Secrets: WEATHER_LAT, WEATHER_LON, …

Dieser Fahrplan **ändert diese Regel**: Koordinaten wandern in eine
Datenbank-Spalte. Das ist „HÖCHSTE Priorität" laut `AGENTS.md` und wird
**nicht ohne Alex' ausdrückliche Freigabe** umgesetzt. Die Umsetzung hält
folgende Schranken ein — sie sind Teil der Abnahme von CRED1/CRED2:

- **Grob gerundet gespeichert.** Nur 2 Nachkommastellen (~1,1 km
  Unschärfe) oder gröber. Rundung serverseitig per Trigger/`GENERATED`-Spalte,
  nicht nur im UI — damit auch ein direkter API-Write nichts Genaueres
  ablegen kann.
- **RLS wie `intervals_credentials`:** owner-only lesen/schreiben, kein
  anon-Grant, Service-Role liest alle.
- **Nie über den Frontend-Lesepfad ausgeliefert.** Die Spalte ist
  ausschließlich Sync-Input. In `rides.json` stehen weiterhin **nur die
  Wetterwerte**, keine Koordinaten (unverändert zu heute — die Berechnung
  bleibt serverseitig im Sync).
- **`AGENTS.md`-Regel wird in CRED6 umformuliert**, nicht still gebrochen:
  „Koordinaten liegen RLS-geschützt und grob gerundet in
  `athlete_sync_config`, werden nur vom Sync gelesen, nie im Frontend, nie
  in JSON."

Sagt Alex hier Nein, bleibt der Standort in der Env (`WEATHER_LAT/LON_<N>`)
und der Rest des Fahrplans gilt trotzdem — die Env schrumpft dann auf
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + die `WEATHER_*`-Zeilen.

---

## Fenster-Übersicht

```
CRED0  Inventar + Datenschutz-Entscheid (read-only)     ✅ abgeschlossen
CRED1  Sync-Config-Tabelle: Migration + RLS + Rundung    ✅ abgeschlossen (Migration 0023)
CRED2  Settings-UI: Standort + Athlet-2-Sonderweg        ✅ abgeschlossen
CRED3  Sync liest per Service-Role aus der Tabelle       ✅ abgeschlossen (Migration 0024, sync-config-fetch.js)
CRED4  Bestandswerte migrieren (dev → prod)             ✅ abgeschlossen
CRED5  Env schrumpfen + apps01/Quadlet + GitHub-Secrets  ✅ abgeschlossen (apps01: Tony; Repo: c3c37b8)
CRED6  Doku + Onboarding-Notiz                           ✅ abgeschlossen
```

Jedes Fenster endet mit: `node -c` der geänderten `.js`-Dateien → `npm test`
(Root und/oder `/app/`) → bei UI-Änderung zusätzlich Docker-Container-Check
(`docker compose -f docker-compose.dev.yml up -d`, `http://localhost:8080`) →
`/code-review` auf den Diff → **ein Commit pro Fenster** (Präfix nach
`AGENTS.md`-Konvention).

**Wichtig für jedes Fenster:** `scripts/lib/` und `scripts/lib/core/` sowie
die RLS-Testsuite (`tests/supabase-rls.test.js`) mitpflegen.

---

## CRED0 — Inventar & Datenschutz-Entscheid

**Ziel:** Jede Stelle erfassen, an der der Sync eine Athleten-Zugangsdatei
liest. **Read-only, kein Code.**

### Zu erfassen

1. **Env-Werte des Sync**, aus `scripts/lib/env.js` und dem `env:`-Block in
   `.github/workflows/sync-data.yml`, je Wert: von welchem Athleten, welche
   Codestelle liest ihn (`generate-data.js`-Zeilen), was passiert bei
   Fehlen (heute: stiller Fallback? Abbruch? „plan-only"?).
2. **Supabase-Lesepfade des Sync**: `intervals-credentials-fetch.js`,
   `plan-cards-fetch.js`, `ftp-history.js` — welcher Login, welche Tabelle,
   welche Spalten, welches RLS-Verhalten.
3. **Athleten-Gate in `generate-data.js`**: An welcher Bedingung hängt
   „diesen Athleten überhaupt syncen"? (Beobachtet: Athlet-4-Block wird
   übersprungen, wenn `SUPABASE_ATHLETE4_EMAIL/PASSWORD` fehlen.) Nach dem
   Umbau muss das an „hat eine Zeile in der Config-Tabelle" hängen.
4. **`intervals_credentials` heute**: Spaltenaufbau, RLS-Politiken,
   Grants, Migration 0019 (+ evtl. Folgemigrationen) — die neue Tabelle
   bzw. Erweiterung übernimmt dasselbe Muster.
5. **Athlet 2 hat keinen Supabase-Account** (read-only, kein Login). Sein
   intervals.icu-Key + Standort können nicht „self-service" eingetragen
   werden. Optionen für CRED2 sammeln (Zeile ohne `profile_id`,
   admin-gepflegt / eigener Admin-Pfad / Athlet 2 bleibt auf Env).
6. **Service-Role-Key**: Existiert er im Self-Host-Stack schon als
   ausgebbarer Wert (DKR3-JWT-Erzeugung)? Wie kommt er heute — falls
   überhaupt — auf apps01?

### Abnahme

- [ ] Tabelle: Wert · Athlet · lesende Codestelle · Verhalten bei Fehlen ·
      Zielquelle nach Umbau (Env-bleibt / Tabelle / entfällt)
- [ ] `intervals_credentials`-Schema + RLS + Grants dokumentiert
- [ ] Athlet-2-Optionen mit je einem Satz Vor-/Nachteil
- [ ] Keine Datei verändert

### ◆◆ Entscheidungspunkte — **entschieden (2026-08-30, mit Alex)**

1. **Datenschutz:** ✅ **ja** — Standort wandert in die Datenbank, grob
   gerundet (`numeric(5,2)/(6,2)`, ~1,1 km), owner-only RLS, nur Sync liest.
2. **Tabellenform:** ✅ **neue Tabelle `athlete_sync_config`**;
   `intervals_credentials` wird in der Migration hineingeführt (idempotenter
   `insert … on conflict do nothing`) und bleibt vorerst bestehen.
3. **Athlet 2:** ✅ **Zeile ohne `profile_id`** — Schlüssel `athlete_key = "athlete2"`,
   admin-/seed-gepflegt, nur für Service-Role sichtbar.
   > **Verworfen in CRED4 (2026-08-31):** Athlet 2 hat doch einen echten
   > Supabase-Login bekommen und ist eine normale `profile_id`-Zeile. Die
   > `athlete_key`-Spalte bleibt in Migration 0023 stehen, wird aber von
   > keiner Zeile genutzt (`sync-config-fetch.js` löst sie noch auf).

---

## CRED1 — Sync-Config-Tabelle: Migration + RLS + Rundung

**Ziel:** Eine Tabelle, die pro Athlet alle Sync-Zugangsdaten hält.
Migration + RLS + Rundungs-Trigger + RLS-Testfälle — **noch nichts
angeschlossen.**

### Umfang

> **Umgesetzt:** Migration `0023_athlete_sync_config.sql` (Tabelle + RLS +
> Rundung im Spaltentyp, kein Trigger nötig) plus Folgemigration
> `0024_sync_service_role_grants.sql` (CRED3 — `SELECT` für `service_role` auf
> `profiles`/`plan_cards`/`ftp_history`, ohne die der Service-Role-Read in 42501 läuft).

- Neue Migration `supabase/migrations/0023_athlete_sync_config.sql`:
  - Tabelle `athlete_sync_config`
    (`profile_id uuid` PK/FK → `profiles.id`, `intervals_api_key text`,
    `intervals_athlete_id text`, `weather_lat numeric(5,2)`,
    `weather_lon numeric(6,2)`, Zeitstempel).
  - **Rundung erzwingen:** `weather_lat`/`weather_lon` als
    `GENERATED ALWAYS`-Spalte aus einer Roh-Eingabe, oder `BEFORE
    INSERT/UPDATE`-Trigger `round(x, 2)`. Nicht dem UI überlassen.
  - RLS: `SELECT`/`INSERT`/`UPDATE`/`DELETE` nur `auth.uid() = profile_id`;
    kein `anon`-Grant; `service_role` liest alle (bzw. RLS-Bypass wie
    üblich für die Rolle).
  - Datenübernahme aus `intervals_credentials` **innerhalb** der Migration
    (idempotent), falls Entscheid CRED0.2 = neue Tabelle.
- `scripts/lib/core/` ist von dieser Migration nicht betroffen (reine
  Berechnung) — nur prüfen, ob dort irgendwo ein `intervals_credentials`-
  Name auftaucht.
- RLS-Testfälle in `tests/supabase-rls.test.js` ergänzen:
  - eingeloggter Athlet liest/schreibt nur seine Zeile
  - fremde `profile_id` schreiben/lesen → 0 Zeilen (nicht `.ok` prüfen —
    PATCH ohne RLS-Treffer liefert HTTP 200 / 0 Zeilen, s. DKR3-Falle)
  - anon ohne Login → komplett zu
  - Rundung: ein Write mit 5 Nachkommastellen landet mit 2 in der Zeile

### Abnahme

- [ ] Migration läuft idempotent gegen einen frischen lokalen Stack durch
      (`docker compose -f docker-compose.selfhost.yml down -v` + `up -d`)
- [ ] `tests/supabase-rls.test.js` grün, inkl. der neuen Fälle
- [ ] Direkter API-Write mit feinen Koordinaten wird serverseitig gerundet
      (aktiv per `curl` geprüft, nicht nur angenommen)
- [ ] `intervals_credentials`-Daten stehen in `athlete_sync_config` (falls
      neue Tabelle)

---

## CRED2 — Settings-UI: Standort eintragen + Athlet-2-Sonderweg

**Ziel:** Athleten mit Login können ihren groben Standort in Settings
setzen; Athlet 2 ist versorgt.
**Modell:** `[SO]`

### Umfang

- `app/src/features/settings/IntervalsSection.tsx` (oder eine neue
  `SyncLocationSection.tsx` daneben) um zwei Felder Breite/Länge erweitern,
  mit **sichtbarem Datenschutzhinweis** („wird grob gerundet gespeichert,
  nur für die Wettervorschau, nie öffentlich sichtbar").
- Schreibpfad über `app/src/api/supabase/` (neuer Adapter
  `athlete-sync-config.ts` bzw. Erweiterung des bestehenden
  `intervals-credentials`-Adapters), Result-Konvention (`{ ok }` /
  `{ ok:false, error }`).
- Client rundet vor dem Senden zusätzlich (Anzeige-Konsistenz), die
  serverseitige Rundung aus CRED1 bleibt die verbindliche.
- **Athlet 2** nach CRED0.3-Entscheid:
  - Variante „Zeile ohne `profile_id`": Migration/Skript legt für Athlet 2
    eine admin-gepflegte Zeile an (Schlüssel = interne Athlet-ID-Zeichenkette
    statt `profile_id`), Service-Role liest sie mit; RLS lässt sie für
    `anon`/`authenticated` unsichtbar.
  - Variante „bleibt auf Env": `WEATHER_LAT/LON_2` + `INTERVALS_*_2`
    bleiben als einzige Env-Athletenwerte bestehen, im Fahrplan-Abschluss
    dokumentiert.

### Abnahme

- [ ] Docker-Container-Check: Athlet 4 kann Standort setzen, Reload zeigt
      den (gerundeten) Wert
- [ ] `cd app && npm test` grün (neuer Adapter + Section-Tests)
- [ ] Athlet-2-Weg umgesetzt und in CRED6 dokumentiert
- [ ] Kein Koordinatenwert erscheint im Netzwerk-Response eines
      Frontend-Lesepfads außer der eigenen Settings-Abfrage des Besitzers

---

## CRED3 — Sync liest per Service-Role aus der Tabelle

**Ziel:** `generate-data.js` bezieht intervals-Key, Athlete-ID und Standort
je Athlet aus `athlete_sync_config` über **einen** Service-Role-Aufruf.
**Plan Mode beim Bau** (mehrere `scripts/lib/`-Module, Athleten-Gate ändert
sich).

### Umfang

- `scripts/lib/intervals-credentials-fetch.js` verallgemeinern:
  aus „Login als ein Athlet, lies seine Zeile" wird „Service-Role, lies
  **alle** Zeilen, gib eine Map `profileId → { apiKey, athleteId, lat, lon }`
  zurück". Alter Login-Pfad (`grant_type=password`) entfällt.
  Datei ggf. umbenennen (`sync-config-fetch.js`) — dann Importe nachziehen.
- `scripts/lib/env.js`: entfernen `INTERVALS_API_KEY(_2)`,
  `INTERVALS_ATHLETE_ID(_2)`, `WEATHER_LAT/LON(_2/_4)` (Athlet 2 ggf.
  Ausnahme), `SUPABASE_ATHLETE1/4_EMAIL/PASSWORD`, `SUPABASE_ANON_KEY`
  (falls der Sync ihn nur für den Login brauchte — prüfen);
  hinzufügen `SUPABASE_SERVICE_ROLE_KEY`.
- `scripts/generate-data.js`:
  - Athleten-Schleife über die aus der Tabelle gelesenen Zeilen statt über
    „hat Env-Wert X".
  - `getRecentWeather(...)` / `getPlanningForecast(...)` bekommen lat/lon
    aus der Map statt aus `ENV.WEATHER_*`.
  - `plan-cards-fetch.js` / `ftp-history.js`: heute per Athleten-Login —
    auf Service-Role umstellen oder (falls RLS das für Service-Role
    ohnehin durchlässt) den Login-Parameter streichen.
  - Fehlerverhalten festlegen: Tabellen-Read schlägt fehl → **fatal**
    (der Sync hat ohne Config nichts zu tun), nicht stiller Fallback.
    Einzelne fehlende Zeile für einen Nebenathleten → dieser Athlet
    „plan-only" wie heute Athlet 4, kein Abbruch.
- `scripts/lib/core/` prüfen (sollte unberührt sein).

### Abnahme

- [ ] `npm test` (Root) grün
- [ ] Lokaler Sync-Lauf gegen den Self-Host-Stack + Test-Zeilen in
      `athlete_sync_config` erzeugt `data/rides-*.json` für die richtigen
      Athleten (Diff prüfen, `data/*.json` **nicht** committen)
- [ ] Fehlende Tabelle / falscher Service-Role-Key → klarer fataler
      Log-Eintrag, kein halb geschriebener Stand
- [ ] Kein `INTERVALS_*` / `WEATHER_*` / `SUPABASE_ATHLETE*` mehr in
      `scripts/lib/env.js` (außer bewusstem Athlet-2-Rest)

---

## CRED4 — Bestandswerte migrieren (dev → prod)

**Ziel:** Die heutigen Env-Werte von Athlet 1 und 2 stehen als Zeilen in
`athlete_sync_config`.
**Modell:** `[SO]`

### Umfang

- Einmal-Skript `scripts/seed-sync-config.js` (Muster wie
  `scripts/add-rest-day-cards.js`: Dry-Run-Default, `--apply`,
  `--env=dev|prod`).
  - Liest die Werte **aus der lokalen `.env`** (Alex' Maschine, wo sie
    heute schon liegen) und schreibt sie per Service-Role in
    `athlete_sync_config`.
  - Athlet 1: Zeile an seiner `profile_id`.
  - Athlet 2: nach CRED2-Entscheid (Zeile ohne `profile_id` / bleibt Env).
  - Gibt die geschriebenen Werte **maskiert** aus (kein Klartext-Key,
    kein Koordinatenpaar im Log — `AGENTS.md` „Grenzen").
- Reihenfolge: `dashboard-dev` zuerst, verifizieren, dann `dashboard-prod`
  (bzw. die apps01-Instanz).

### ◆ Rückfrage vor `--apply --env=prod`

`CLAUDE.md`: echter Prod-Write nie automatisch. Alex bestätigt den
prod-Lauf einzeln. Koordinaten + API-Keys sind personenbezogen —
zusätzlich prüfen, dass das Log nichts davon im Klartext zeigt.

### Abnahme

- [ ] `athlete_sync_config` in dev enthält Zeilen für Athlet 1 (+ 2)
- [ ] Lokaler Sync gegen dev + diese Zeilen liefert dieselben
      `rides-*.json`-Kennzahlen wie der Env-Weg vorher (Fahrtenzahl,
      CTL/ATL/TSB Athlet 1 identisch)
- [ ] prod-Lauf durch Alex freigegeben und durchgeführt
- [ ] Skript-Log ohne Klartext-Secret / -Koordinaten

---

## CRED5 — Env schrumpfen + apps01/Quadlet + GitHub-Secrets

**Ziel:** Der produktive Sync-Container läuft nur noch mit `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`.
**Vorbedingung:** CRED4 in prod verifiziert, mindestens ein voller
6h-Zyklus stabil.
**Modell:** `[SO]`

### Umfang

- **Abstimmung mit Tony** (Issue-Kommentar oder direkt): apps01-Env-Datei
  auf die zwei Werte reduzieren, Service-Role-Key eintragen (privat
  übermitteln, nie im Repo/Issue), Container neu starten.
- `.github/workflows/sync-data.yml`: falls die Action zu diesem Zeitpunkt
  noch existiert (s. `fahrplan-3-sync-produktivbetrieb.md` Fenster C —
  sollte da schon deaktiviert sein), den `env:`-Block auf die zwei Werte
  kürzen; sonst nur `.env.example` nachziehen.
- GitHub-Secrets `INTERVALS_API_KEY(_2)`, `INTERVALS_ATHLETE_ID(_2)`,
  `WEATHER_LAT/LON(_2/_4)`, `SUPABASE_ATHLETE1/4_EMAIL/PASSWORD` als
  **tot markieren** — **nicht löschen ohne Rücksprache mit Alex**
  (`CLAUDE.md` „Grenzen": Secrets nicht eigenmächtig entfernen).
- `docs/docker-server-einrichten.md` + `docs/docker-lokal-einrichten.md`:
  Env-Listen auf den neuen Stand.

### Abnahme

- [x] apps01-Sync läuft mit den fünf Env-Werten (`SUPABASE_URL` +
      `_SERVICE_ROLE_KEY` + `_ANON_KEY` + `NOTION_*`), voller Live-Sync mit
      0 Fehlern, alle 3 Athleten geschrieben (Tony, verifiziert)
- [x] `.env.example` / `sync-data.yml` / `docs/handoff-sync-apps01.md`
      spiegeln den neuen Stand
- [x] Tote GitHub-Secrets in der Liste festgehalten (Commit-Text `c3c37b8`
      + AGENTS.md „GitHub Secrets"), keine gelöscht — Alex markiert sie in
      der GitHub-UI
- [x] Fataler Abbruch bei fehlendem/falschem Service-Role-Key: per Design in
      `sync-config-fetch.js` (throw → `generate-data.js` `main().catch` →
      `exit 1` vor jedem `writeOutput()`), abgedeckt in der CRED3-Abnahme

---

## CRED6 — Doku + Onboarding-Notiz

**Ziel:** Der neue Weg ist dokumentiert, die alte Env-Konvention und die
Datenschutz-Regel sind nachgezogen.

### Umfang

- `AGENTS.md`:
  - „GitHub Secrets"-Block: die pro Athlet wachsenden Einträge als
    „abgelöst durch `athlete_sync_config`, s. `fahrplan-7-…`" markieren;
    nur `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` bleiben für den Sync.
  - „Datenquellen-Mix": Sync liest Zugangsdaten + Standort aus
    `athlete_sync_config` (Service-Role), nicht mehr aus Env/Athleten-Login.
  - „Wichtige Konventionen" / Datenschutz: die Koordinaten-Regel
    umformulieren (grob gerundet, RLS, `athlete_sync_config`, nur Sync,
    nie Frontend/JSON) statt „ausschließlich GitHub Secrets".
  - „Athleten": beim Athlet-4-Absatz ergänzen, dass Key **und** Standort
    self-service in Settings laufen; Athlet-2-Sonderweg festhalten.
- `docs/offene-punkte.md`: falls ein Eintrag zu Sync-Credentials/Env
  existiert, als erledigt markieren.
- `docs/fahrplan-3-sync-produktivbetrieb.md`: den Hinweis „Secret-Liste
  Fenster B" auf diesen Fahrplan verweisen lassen.
- **Onboarding-Notiz** (in `AGENTS.md` „Athleten" oder `docs/README.md`):
  „Neuer Athlet: anmelden → Settings → intervals.icu-Key + Athlete-ID +
  groben Standort eintragen → nächster Sync-Lauf nimmt ihn automatisch
  auf. Keine Env-Änderung, kein apps01-Eingriff."

### Abnahme

- [x] `npm test` (Root, 124) und `cd app && npm test` (1461) grün
- [x] `npx fallow health --score` unverändert (reiner Doku-/Config-Commit,
      kein Modulgraph berührt)
- [x] Doku-Querverweise stimmig, keine toten Verweise auf entfernte
      Env-Werte / umbenannte Module

---

## Verifikation gesamt

- **Pro Fenster:** `node -c` der geänderten `.js`-Dateien → `npm test`
  (betroffener Teil) → bei UI-Änderung Docker-Container-Check →
  `/code-review` auf den Diff.
- **RLS:** `tests/supabase-rls.test.js` gegen den lokalen Self-Host-Stack
  nach CRED1 und erneut gegen die Produktivinstanz nach CRED4.
- **Einmal am Ende (nach CRED4):** Playwright MCP gegen `dashboard-dev` —
  Settings: Standort setzen/lesen, kein Klartext-Koordinatenpaar in einer
  fremden Abfrage; `browser_snapshot` statt Screenshot, eine Session,
  danach schließen (`CLAUDE.md` Playwright-Konvention).
- **Manuell bei Alex:** finale Bestätigung im echten Browser vor `git sync`;
  Freigabe der beiden ◆-Rückfragen (Datenschutz in CRED0, prod-Write in
  CRED4) und der Tony-Abstimmung in CRED5.

## Abhängigkeiten

- **Braucht vorher:** `fahrplan-3-sync-produktivbetrieb.md` Fenster B
  (Sync läuft produktiv auf apps01) — vorher optimiert man eine Env, die
  gerade erst umzieht. Der Self-Host-Stack (Fahrplan 3 DKR) muss die
  produktive Backend-Instanz sein, weil der Service-Role-Key von dort kommt.
- **Blockiert:** keinen anderen Fahrplan.
- **Lohnt sich, wenn:** ein neuer Athlet (`athlete3` oder ein fünfter)
  tatsächlich ansteht. Ohne konkreten neuen Athleten bringt der Umbau
  keinen unmittelbaren Nutzen — dann zurückstellen.
- Berührt `scripts/lib/` und `scripts/lib/core/` — Kopien gemeinsam prüfen.
- Node ≥ 24 für den Root-Testlauf.

## Reihenfolge / Modell je Fenster

| Fenster | Modell | Bemerkung |
|---|---|---|
| CRED0 | `[F5]` | read-only, ◆◆ Datenschutz + Tabellenform + Athlet 2 |
| CRED1 | `[F5]` | Migration + RLS + Rundung, keine Anbindung |
| CRED2 | `[SO]` | Settings-UI, Docker-Check |
| CRED3 | `[F5]` | **Plan Mode** — mehrere `scripts/lib/`-Module, Athleten-Gate |
| CRED4 | `[SO]` | Migration, ◆ Rückfrage vor prod |
| CRED5 | `[SO]` | Env kürzen, ◆ Abstimmung mit Tony, Secrets nicht löschen |
| CRED6 | `[SO]` | Doku |
