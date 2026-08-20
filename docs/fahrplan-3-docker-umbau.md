# Fahrplan 3: Docker-Umbau und Self-Hosting

**Stand:** 13.08.2026
**Zielablage:** `docs/fahrplan-3-docker-umbau.md`
**Herkunft:** entspricht F0 Teil 2 und den Fenstern C-1 bis C-3b des Gesamtfahrplans

---

## Ziel

Anwendung, Datenbank, Authentifizierung und Datensynchronisierung laufen als Container-Verbund über eine `docker compose`-Datei auf einem eigenen Server. Die Supabase-Cloud entfällt.

**Gewählter Umfang: schlanker Stack.** Vier Dienste statt der zehn des offiziellen Referenz-Setups — Postgres, GoTrue, PostgREST, Reverse Proxy. Alles, was die Anwendung nachweislich nicht benutzt, wird nicht betrieben.

**Zwei getrennte Umgebungen, nicht eine.** Entwicklung und Test finden vollständig auf dem eigenen Rechner statt. Erst ein fertig geprüfter Stand wird an die Hosting-Infrastruktur weitergegeben — nicht der Server als Testumgebung. Konkret: DKR1 bis DKR3 laufen ausschließlich lokal, nichts davon berührt den Zielserver. Erst DKR4 überträgt etwas dorthin, und zwar in Form eines fertig gebauten, versionierten Images — nie als Quellcode, der auf dem Server erst noch gebaut oder verändert wird. Der Übergabepunkt dazwischen (Ende DKR3 / Anfang DKR4) ist unten als eigener Kontrollpunkt beschrieben.

## Konstruktionsziele

1. **Portabilität vor Bequemlichkeit.** Keine hostspezifischen Pfade, keine von Hand angelegten Dateien außer `.env`.
2. **Ein Image, mehrere Umgebungen.** Konfiguration zur Laufzeit, nicht zur Bauzeit.
3. **Nichts Unversioniertes auf dem Server.** Was nicht im Repo steht, existiert nach einem Neuaufbau nicht.
4. **Jede Migration hat einen abfragbaren Anwendungsstatus.**
5. **Ein Backup ohne durchgeführten Restore zählt nicht als Backup.**
6. **Lokal geprüft, dann erst übergeben.** Kein Schritt verändert den Server, bevor sein lokales Gegenstück nachweislich funktioniert. Die Hosting-Infrastruktur bekommt ausschließlich fertige, geprüfte Artefakte — nie einen Zwischenstand zum Weiterentwickeln.

Der Umzug auf einen beliebigen anderen Host soll am Ende aus `docker compose up`, einer `.env` und einem Datenbank-Dump bestehen.

## Abhängigkeiten zu den anderen Fahrplänen

| Beziehung | |
|---|---|
| Braucht vorher | Fahrplan 1 vollständig, Fahrplan 2 bis DOK2 (`.env.example`) |
| Blockiert | Fahrplan 2 Fenster DOK3, Fahrplan 4 ab Fenster ATH2 |
| Unabhängig davon | Fahrplan 4 Fenster ATH1 kann jederzeit vorher laufen |

## Fensterübersicht

```
─── Ausschließlich lokal, Server bleibt unberührt ───
DKR0   Backend-Nutzungsinventar (read-only)      ◆  bestimmt den Stack-Umfang
DKR1   Frontend-Image und Compose lokal          ◆
DKR2   Sync-Container
DKR3   Self-Host-Stack lokal                     ◆◆ härtester Kontrollpunkt

═══ ÜBERGABE — hier wechselt zum ersten Mal etwas auf fremde Infrastruktur ═══

─── Ab hier auf dem Zielserver ───
DKR4   Server und Auslieferungskette
DKR5   Datenmigration und Backup                 ◆
DKR6   Cutover
```

---

## Fenster DKR0 — Backend-Nutzungsinventar

**Ziel:** Feststellen, welche Backend-Bausteine die Anwendung tatsächlich anspricht.
**Modell:** `[F5]`
**Wichtig:** read-only. Der gesamte schlanke Zuschnitt steht auf diesem Bericht.

1. Über die Codebasis erfassen, was genutzt wird:
   - **Auth/GoTrue** — welche Methoden? (`signInWithPassword`, `signOut`, `updateUser`, `resetPasswordForEmail`, …)
   - **PostgREST** — Tabellen, Views, RPC-Aufrufe, `select` mit eingebetteten Relationen
   - **Realtime** — irgendwo `.channel()` oder `.on('postgres_changes')`?
   - **Storage** — irgendwo `.storage.from()`? Woher kommt das Hero-Hintergrundbild?
   - **Edge Functions** — irgendwo `.functions.invoke()`?
2. Alle Umgebungsvariablen und Secrets auflisten: Frontend, `generate-data.js`, GitHub Actions.
3. Dokumentieren, wie Supabase-URL und anon-Key heute ins Frontend gelangen.
4. Vollständige Migrationsliste `0001`–`0017` mit Zweck in je einem Satz.
5. Prüfen, welche Postgres-Erweiterungen die Migrationen voraussetzen (`pgcrypto`, `pgjwt`, `uuid-ossp`, …).

### Abnahme

- [ ] Für jeden Baustein aus Punkt 1 steht „genutzt" oder „nicht genutzt" mit Fundstelle
- [ ] Erweiterungsliste vollständig
- [ ] Keine Datei verändert

### ◆ Entscheidungspunkt

Ergibt der Bericht Realtime- oder Storage-Nutzung, kommt der jeweilige Container in DKR3 dazu. Der schlanke Stack ist bis dahin eine Annahme, keine Feststellung.

---

## Fenster DKR1 — Frontend-Image und Compose lokal

**Ziel:** Die React-App läuft im Container gegen die unveränderte Supabase-Cloud.
**Vorbedingung:** Fahrplan 1 und 2 (bis DOK2) abgeschlossen.
**Modell:** `[SO]`
**Warum dieser Schnitt:** Hier wird ausschließlich das Verpacken geübt. Das Backend bleibt exakt wie es ist, damit ein Fehler eindeutig dem Container zuzuordnen ist.

1. **Multi-Stage-Dockerfile** unter `app/Dockerfile`:
   - Stufe 1 `node:22-alpine`: `npm ci`, `npm run build`
   - Stufe 2 `nginx:alpine`: nur `dist/` übernehmen
   - Container läuft als Nicht-Root-User
   - `.dockerignore` anlegen (`node_modules`, `.git`, `docs`, `tests`)
2. **Laufzeitkonfiguration statt Bauzeitkonfiguration.**
   > Vite backt `VITE_*`-Variablen fest ins Bundle. Damit wäre das Image umgebungsspezifisch und Konstruktionsziel 2 verletzt — jede Umgebung bräuchte einen eigenen Build.
   >
   > Lösung: Ein Entrypoint-Skript schreibt beim Containerstart aus Umgebungsvariablen eine `config.json` ins Auslieferungsverzeichnis. Die Anwendung lädt sie vor dem Start. Ein Image, beliebig viele Umgebungen.
3. **`docker-compose.dev.yml`:** Frontend-Dienst, Port lokal auf 8080, `.env`-Anbindung, `restart: unless-stopped`, Healthcheck auf die Startseite.
4. **nginx-Konfiguration:** SPA-Fallback auf `index.html`, Gzip, Cache-Header für gehashte Assets, **keine** Cache-Header für `config.json`.
5. **Lokale Vollprüfung gegen `dashboard-dev`, nicht gegen Prod:** Login, Athletenwechsel, Planungstab, Export-Panel, Charts.

### Abnahme

- [x] `docker compose -f docker-compose.dev.yml up` liefert eine voll funktionsfähige App
- [x] **Dasselbe Image funktioniert mit zwei verschiedenen `config.json`-Werten ohne Neubau** — das ist der eigentliche Nachweis dieses Fensters
- [x] Image-Größe dokumentiert: 103 MB (`training-dashboard-frontend:latest`)
- [x] Container läuft nicht als root (gegengeprüft: `uid=1001(appuser)`)

### So testest du es lokal

Vollständige Dateien (Dockerfile, `.dockerignore`, `docker-compose.dev.yml`, Entrypoint-Skript, nginx-Konfiguration) zum Kopieren stehen in `docs/docker-lokal-einrichten.md`, Abschnitt 1. Hier nur die Befehle, die du nach dem Anlegen der Dateien ausführst:

```powershell
# Bauen
docker compose -f docker-compose.dev.yml build

# Starten (im Hintergrund)
docker compose -f docker-compose.dev.yml up -d

# Läuft er? Healthcheck-Status ansehen
docker compose -f docker-compose.dev.yml ps

# Logs live mitlesen
docker compose -f docker-compose.dev.yml logs -f

# Im Browser prüfen
start http://localhost:8080

# Stoppen, Container und Netzwerk entfernen (Daten bleiben, da kein Volume hier)
docker compose -f docker-compose.dev.yml down
```

Der Nachweis aus der Abnahme — ein Image, zwei Konfigurationen — testest du so: `config.json`-Werte in der `.env` ändern, **nur** `up -d` erneut ausführen (kein `build` dazwischen), im Browser prüfen, dass sich die neue Konfiguration zeigt.

---

## Fenster DKR2 — Sync-Container

**Ziel:** Die Datensynchronisierung läuft im Container statt in GitHub Actions.
**Vorbedingung:** DKR1 abgeschlossen.
**Modell:** `[SO]`

**Stand 17.08.2026:** Code + lokale Verdrahtung stehen und sind gegen
Fake-/leere Werte geprüft (Image-Build, Fail-Fast-Pfad ohne echten
API-Aufruf, atomare Schreiblogik, Volume-Verdrahtung frontend↔sync).
Details und der aktuelle Verifikationsstand je Abnahme-Punkt stehen in
`docs/docker-lokal-einrichten.md`, Abschnitt 2. Offen: ein echter Sync-Lauf
mit echten Daten (braucht deine `.env`, macht echte API-Aufrufe — bitte
selbst auslösen) sowie die beiden produktionsrelevanten Schritte (Punkt 5
unten, GitHub-Actions-Abschaltung) — beide bewusst nicht ohne Rücksprache
umgesetzt, da die Live-Seite bis zum Cutover von genau diesen Quellen lebt.

1. **Sync-Dockerfile** auf `node:22-alpine` mit `scripts/` und `core/`, Einstiegspunkt `generate-data.js`.
2. **Zeitsteuerung im Container**, nicht als System-Cron auf dem Host — sonst wandert Betriebslogik an eine unversionierte Stelle. Intervall über Umgebungsvariable, Vorgabe 6 Stunden wie bisher. Zusätzlich ein manueller Auslöser über `docker compose run`, weil der Cron-Fix vom Juli bewusst auf manuelles Triggern ausgelegt war.
3. **Gemeinsames Volume:** Sync schreibt `data/*.json` in ein benanntes Volume, nginx liest daraus. Kein Bind-Mount, kein Pfad auf dem Host.
4. **Interval-Cache** (`data/interval-blocks.json`) mit ins Volume, damit der Segment-Cache Neustarts überlebt. Ein Neuaufbau des Caches bedeutet sonst 150+ API-Abrufe.
5. **Jetzt erst `data/*.json` aus der Versionierung nehmen** — im selben Commit, der die Auslieferung auf das Volume umstellt.
   > Reihenfolge zwingend: Bis zum Cutover liefert GitHub Pages die öffentliche Seite und lädt diese Dateien aus dem Repo. Deshalb steht dieser Punkt hier und nicht in Fahrplan 2.
   >
   > **Soll die Pages-Seite über den Cutover hinaus bestehen bleiben, wandert dieser Punkt nach DKR6.**
6. **Fehlerverhalten:** Ein fehlgeschlagener Sync darf die letzten guten Daten nicht überschreiben. Erst in eine temporäre Datei schreiben, dann atomar umbenennen. Aktiv testen, indem der Lauf mitten im Vorgang abgebrochen wird.
7. **Protokollierung** auf `stdout`: Zeitstempel, Anzahl Aktivitäten je Athlet, Dauer, Fehler. Damit reicht `docker compose logs`.
8. **Rate-Limit beachten:** intervals.icu erlaubt laut Maintainer 30/s im Burst und 132/10s dauerhaft. Die vorhandene Drossel von 3–5/s bleibt.

### Abnahme

- [ ] Sync läuft im Container, `data/*.json` erscheinen im Volume
- [ ] Frontend zeigt die Daten aus dem Volume
- [ ] Abgebrochener Sync lässt die alten Dateien intakt (aktiv getestet)
- [ ] GitHub-Actions-Workflow deaktiviert, **nicht gelöscht** — Rückfahrkarte bis zum Cutover

### So testest du es lokal

Vollständige Dateien in `docs/docker-lokal-einrichten.md`, Abschnitt 2.

```powershell
# In die bestehende docker-compose.dev.yml aufnehmen (sync-Dienst + benanntes Volume),
# dann einmal manuell auslösen statt auf die 6-Stunden-Zeitsteuerung zu warten
docker compose -f docker-compose.dev.yml run --rm sync

# Volume-Inhalt ansehen, ohne den Container-Umweg
docker compose -f docker-compose.dev.yml exec frontend ls -la /usr/share/nginx/html/data

# Abbruchtest: Lauf mitten im Sync unterbrechen und danach prüfen, dass die alten
# Dateien noch da sind
docker compose -f docker-compose.dev.yml run --rm sync &
# kurz warten, dann:
docker compose -f docker-compose.dev.yml kill sync

# Logs des letzten Sync-Laufs
docker compose -f docker-compose.dev.yml logs sync
```

---

## Fenster DKR3 — Self-Host-Stack lokal

**Ziel:** Der vollständige Backend-Stack läuft lokal, alle Migrationen sind eingespielt, die RLS-Testsuite ist grün.
**Vorbedingung:** DKR2 abgeschlossen, DKR0-Bericht bestätigt den schlanken Umfang.
**Modell:** `[F5]` — Architektur- und Sicherheitsarbeit
**Warum das der härteste Kontrollpunkt ist:** Alles danach ist Betrieb. Läuft das hier nicht, ist die Serverfrage noch gar nicht relevant.

### Aufbau

1. **Postgres:** Image `supabase/postgres` verwenden, **nicht** blankes `postgres`.
   > Begründung: `0002_grants.sql` und sämtliche RLS-Politiken setzen die Rollen `anon`, `authenticated`, `service_role` sowie die Schemata `auth` und `extensions` voraus. Das Supabase-Image bringt sie mit. Blankes Postgres hieße, diese Grundlage von Hand nachzubauen — vermeidbares Risiko an genau der Stelle, an der ein Fehler still bleibt.
2. **GoTrue:**
   - `GOTRUE_DISABLE_SIGNUP=true` — **es gibt keine öffentliche Registrierung, das ist eine geschlossene Anwendung**
   - `GOTRUE_JWT_SECRET`, `GOTRUE_JWT_AUD=authenticated`, `GOTRUE_JWT_EXP`
   - `GOTRUE_SITE_URL` und `GOTRUE_URI_ALLOW_LIST` auf die eigene Domain
   - Mailversand zunächst deaktiviert. „Passwort vergessen" ist ein eigener späterer Schritt und stand schon vorher offen.
3. **PostgREST:** `PGRST_DB_ANON_ROLE=anon`, `PGRST_DB_SCHEMAS=public`, `PGRST_JWT_SECRET` identisch zu GoTrue.
4. **Reverse Proxy** (Caddy oder Traefik) — er übernimmt, was in der Cloud das API-Gateway tut:
   ```
   /auth/v1/*  →  gotrue
   /rest/v1/*  →  postgrest
   /*          →  frontend
   ```
   **Postgres wird niemals nach außen veröffentlicht.**
   > Für den lokalen DKR3-Testaufbau bewusst enger geschnitten: Backend und
   > Frontend (DKR1) laufen als getrennte Compose-Dateien, damit ein Fehler
   > eindeutig zuzuordnen ist. `Caddyfile.local` routet deshalb nur
   > `/auth/v1/*` und `/rest/v1/*`, der Fallback liefert dort einen 404 mit
   > Erklärtext statt `frontend` — s. `docs/docker-lokal-einrichten.md`
   > Abschnitt 3. Die volle Drei-Routen-Tabelle oben gilt für den späteren
   > Server-Stand (DKR4), wo Backend und Frontend zusammen hinter einem
   > Proxy laufen.
5. **Schlüssel erzeugen:** anon- und service-role-JWT aus dem `JWT_SECRET` signieren, Claim `role` entsprechend, langes Ablaufdatum. Das Erzeugungsskript kommt ins Repo, die erzeugten Werte niemals.

### Verifikationsschritt — vor dem Weiterbauen

6. **Empirisch prüfen, ob `supabase-js` ohne Gateway-Ebene funktioniert.**
   > Der Client sendet `apikey`- und `Authorization`-Header. Die Erwartung: PostgREST wertet `Authorization` aus und ignoriert `apikey`. Das ist eine begründete Annahme, kein Nachweis — und der gesamte schlanke Zuschnitt steht darauf.

   Vier Fälle durchspielen und protokollieren:
   - ausgeloggt lesend auf öffentlich lesbare Tabellen
   - eingeloggt lesend auf eigene Daten
   - eingeloggt schreibend
   - Zugriff auf fremde Daten — **muss scheitern**

   Scheitert Fall 1 oder 2, kommt Kong doch dazu. Das früh zu wissen kostet ein Fenster, es spät zu merken kostet den Cutover.

### Migrationen

7. **Migrations-Runner einführen.** Ein Werkzeug mit `schema_migrations`-Tabelle (etwa `dbmate`) als eigener Compose-Dienst, der vor dem Start durchläuft.
   > Das löst nebenbei ein bestehendes Problem: Für `0012`–`0017` war der Anwendungsstatus zeitweise nirgends dokumentiert und nur über den SQL-Editor feststellbar. Danach ist es eine Datenbankabfrage.
8. Migrationen `0001`–`0017` gegen die frische Datenbank durchlaufen lassen. Jede muss ohne manuellen Eingriff durchgehen. Eine Migration, die das nicht tut, wird **nicht** von Hand nachgeholfen, sondern idempotent gemacht und committet.

### Sicherheitsnachweis

9. **`tests/supabase-rls.test.js` gegen den lokalen Stack: 28/28 grün.** Das ist das Abnahmekriterium dieses Fensters, nicht „die Seite lädt".
   > Beim Prüfen die bekannte Falle beachten: Ein PATCH ohne RLS-Treffer liefert HTTP 200 mit null Zeilen. Assertions auf `data.length`, nicht auf `.ok` — sonst laufen echte Verstöße durch.
10. Manuell zusätzlich prüfen: Trainer-Zuordnung, `is_coach_of`, `wellbeing_public`, öffentlich lesbare Tabellen (`goals`/`events`/`plan_cards`), Admin-Rechte.

### Abnahme

**Stand 17.08.2026: vollständig abgenommen**, lokal gegen einen frischen
Stack verifiziert (`docker compose down -v` + `up -d`, nicht nur einmalig
hochgezogen) — Details, empirisch gefundene Lücken und der genaue Testablauf
stehen in `docs/docker-lokal-einrichten.md` Abschnitt 3.

- [x] Vier Dienste plus Migrations-Runner starten sauber (real: fünf Dienste
      inkl. `db-init`, s. dortige Begründung)
- [x] Migrationsstatus per Abfrage sichtbar, `0001`–`0017` eingespielt
- [x] RLS-Suite 28/28 gegen den lokalen Stack
- [x] Punkt 6 empirisch belegt, nicht angenommen (alle vier Fälle einzeln
      per curl durchgespielt)
- [x] Postgres von außen nicht erreichbar (aktiv gegengeprüft)

### So testest du es lokal

Das ist der aufwendigste Teil — vollständige `docker-compose.selfhost.yml` mit allen vier Diensten, Umgebungsvariablen und dem Skript zur JWT-Erzeugung stehen in `docs/docker-lokal-einrichten.md`, Abschnitt 3. Dort auch der Ablauf für den Verifikationsschritt aus Punkt 6 (die vier Testfälle) als fertige `curl`-Befehle.

```powershell
# Kompletten Stack starten (Postgres, GoTrue, PostgREST, Proxy, Migrations-Runner)
docker compose -f docker-compose.selfhost.yml up -d

# Reihenfolge prüfen: Migrations-Runner muss durchgelaufen und beendet sein,
# bevor die anderen Dienste als "healthy" gelten
docker compose -f docker-compose.selfhost.yml ps

# Postgres ist NICHT von außen erreichbar — das muss fehlschlagen:
docker compose -f docker-compose.selfhost.yml exec postgres pg_isready
# (dieser Befehl funktioniert, weil er INNERHALB des Containers läuft — von
#  außen darf derselbe Port nicht erreichbar sein, siehe docs/docker-lokal-einrichten.md
#  Abschnitt 3 für den externen Gegentest)

# RLS-Suite gegen den lokalen Stack statt gegen die Cloud
$env:SUPABASE_URL = "http://localhost/rest/v1"
npm test -- tests/supabase-rls.test.js

# Alles stoppen, inklusive Datenbank-Volume löschen (für einen sauberen Neustart)
docker compose -f docker-compose.selfhost.yml down -v
```

### ◆◆ STOPP

Ohne grüne RLS-Suite geht es nicht weiter.

---

## ═══ Übergabepunkt — hier verlässt zum ersten Mal etwas den eigenen Rechner ═══

**Bis hierhin war ausschließlich der eigene Rechner betroffen.** Alles, was jetzt weitergeht, ist ein fertig gebautes, geprüftes Artefakt — kein Quellcode, an dem anderswo weitergearbeitet wird, und kein „wir schauen mal, ob es dort auch läuft".

Diese vier Punkte müssen erfüllt sein, **bevor** DKR4 beginnt:

1. **DKR1 bis DKR3 sind vollständig abgenommen**, mit allen dortigen Haken abgehakt — insbesondere die grüne RLS-Suite aus DKR3.
2. **Das Frontend-Image aus DKR1 wird geprüft, nicht neu gebaut.** Genau das Image, das lokal getestet wurde, ist dasjenige, das später auf den Server kommt — dieselbe Image-ID, kein zweiter Build „für den Server". Ein zweiter Build, und sei er aus demselben Code, wäre wieder ein ungeprüftes Artefakt.
3. **Ein einziges Übergabepaket** wird definiert: die Compose-Datei für den Server (`docker-compose.prod.yml`, folgt in DKR4), das geprüfte Image-Tag, `.env.example` mit allen benötigten Variablen. Nichts davon enthält Zugangsdaten — Secrets werden getrennt und ausschließlich direkt auf dem Zielserver eingetragen, nie mitgeschickt.
4. **Es wird nichts vor Ort auf dem Server gebaut, kompiliert oder aus Quellcode zusammengesetzt.** Der Server zieht ein fertiges Image und startet Container — mehr nicht. Jeder Schritt, der auf dem Server mehr täte als das, gehört zurück in ein lokales Fenster.

> Das ist keine reine Formalität: Es ist die Antwort auf die Frage, wie „erst bei mir lokal fertig testen, dann weitergeben zum Hosten" tatsächlich technisch umgesetzt wird. Ohne Punkt 2 könnte ein Unterschied zwischen dem lokal geprüften Image und einem später auf fremder Infrastruktur gebauten Image entstehen — genau die Art Fehler, die sich sonst erst im Betrieb zeigt, wenn sie am schwersten zuzuordnen ist.

### Stand 19.08.2026 — Vorbereitung abgeschlossen, `docker-compose.prod.yml` bewusst noch offen

Auf Alex' Entscheidung hin deckt dieser Durchlauf nur die **Vorbereitung** ab,
nicht die vier Punkte vollständig — `docker-compose.prod.yml` bleibt bewusst
DKR4 vorbehalten (Punkt 3 nennt es selbst als „folgt in DKR4"), wird hier
also nicht vorgezogen.

> **Nachtrag, noch am selben Tag:** Es wird nie ein `docker-compose.prod.yml`
> geben — der reale Zielserver läuft mit Podman/Quadlet, nicht
> docker-compose. Details und Begründung im „⚠ Stand 19.08.2026"-Hinweis
> zu Beginn von Fenster DKR4 unten.

1. **DKR1–DKR3 abgenommen** — ✅, s. jeweilige Abnahme-Abschnitte oben.
2. **Frontend-Image geprüft, nicht neu gebaut** — das zuvor lokal getestete
   DKR1-Image war 5,5 Stunden älter als der letzte Commit (der u. a.
   `app/nginx.conf` änderte, s. DKR2), entsprach also nicht mehr sicher dem
   committeten Stand. Deshalb einmalig frisch aus dem aktuellen Commit
   gebaut — **das** ist jetzt die Referenz, kein zweiter Build "für den
   Server" später. Fest getaggt (kein `:latest`):
   - `training-dashboard-frontend:4841630` (Commit `4841630`)
   - Image-ID `sha256:47afa9dfa34a…`
   - Smoke-Test bestanden: `/` → 200, `/config.json` → 200,
     `/data/<fehlende-datei>` → 404 (nicht die SPA-Fallback-Falle)
3. **Übergabepaket-Bestandteile geprüft:**
   - `docker-compose.prod.yml` — **bewusst noch nicht angelegt**, folgt in DKR4
   - geprüftes Image-Tag — s. Punkt 2 oben
   - `.env.example` — durchgesehen, keine Lücke gefunden: `RUNTIME_ENV`
     (einziger server-spezifischer Wert ohne Cloud-Gegenstück) ist laut
     `docs/docker-lokal-einrichten.md` Abschnitt 1 bewusst kein `.env`-Wert,
     sondern wird direkt und fest in `docker-compose.prod.yml` gesetzt
     (`RUNTIME_ENV=prod`) — gehört deshalb nicht in diese Datei
4. **Nichts auf dem Server gebaut** — reine Verfahrensregel, greift erst,
   sobald DKR4 tatsächlich einen Server anfasst; aktuell nichts zu prüfen.

---

## Fenster DKR4 — Server und Auslieferungskette

**Ziel:** Der Stack läuft auf dem Zielserver — noch mit leerer Datenbank.
**Vorbedingung:** DKR3 vollständig abgenommen, Übergabepunkt oben vollständig erfüllt.
**Modell:** `[SO]`
**Warum getrennt von der Datenmigration:** Infrastrukturfehler und Datenfehler sollen nicht gleichzeitig auftreten können.

### ⚠ Stand 19.08.2026 — reale Zielinfrastruktur weicht von den Punkten 2/3 unten ab

Die ursprüngliche Planung unten (`docker-compose.prod.yml`, Punkt 2) ging
von einem generischen eigenen Server aus. Der tatsächliche Zielserver
steht fest und sieht anders aus — **apps01**, betrieben von Tony
(externer Infra-Betreiber), **rootless Podman + systemd Quadlet-Units,
kein docker-compose in Produktion**. Das ist keine Abkürzung, sondern
Tonys eigene, vorher bestehende Infrastruktur-Konvention.

Konkret geändert gegenüber der Planung unten:

- **Kein `docker-compose.prod.yml` wird es geben.** Statt Punkt 2 gilt:
  wir veröffentlichen nur versionierte Images nach GHCR (`frontend`,
  `sync`, `migrate` — s. `.github/workflows/publish-images.yml`), Tony
  übersetzt sie selbst in Quadlet-Units auf seiner Seite. Wir liefern kein
  Compose-Artefakt für den Server.
- **Self-Host-Stack-Umfang mit Tony abgestimmt:** Postgres, GoTrue,
  PostgREST, Caddy, `migrate` — 5 Dienste (nicht die von ihm zunächst
  geschätzten ~8), passt in seine Infra. Postgres/GoTrue/PostgREST/Caddy
  zieht er direkt aus den offiziellen Registries (sein Renovate-Tooling
  verfolgt sie dort), **nicht** von unserem GHCR.
- **Backup (DKR5 Punkt 5 unten) baut Tony selbst**, in seinem eigenen
  Quadlet/systemd-Stil — kein docker-compose-Backup-Service von uns.
- Punkt 3 (Netzwerk-Einbindung, Subdomain/TLS, Namenspräfixe,
  Portkollisions-Check) bleibt inhaltlich richtig, nur die Umsetzung
  liegt komplett bei Tony statt in einer von uns geschriebenen Compose-
  Datei.
- **Live bestätigt:** `https://training-dashboard.clear-solutions-it.com`
  ist erreichbar (HTTP 200, TLS-Zertifikat gültig geprüft), `/rest/v1/*`
  antwortet korrekt (Migrationen sind durchgelaufen, Datenbank ist wie
  erwartet leer an Nutzerdaten). Von außen extern verifiziert, nicht nur
  behauptet — s. Abnahme unten für was davon noch fehlt.

**Für jedes neue Chat-Fenster zu DKR4/DKR5/DKR6:** diesen Abschnitt zuerst
lesen, bevor irgendetwas mit `docker-compose.prod.yml` als Annahme geplant
wird.

1. **Image in CI bauen, nicht auf dem Server.** GitHub Actions baut aus demselben Dockerfile, das in DKR1 lokal geprüft wurde, und pusht nach GHCR. Der Server zieht ein **versioniertes Tag**. Kein `:latest` — sonst ist nicht rekonstruierbar, was gerade läuft. **Umgesetzt** (`publish-images.yml`, Tags `v1.0.0`+).
2. ~~`docker-compose.prod.yml` getrennt von der Dev-Fassung~~ — **entfällt**, s. Stand-Hinweis oben. Gepinnte Image-Tags, Healthchecks, `restart`-Verhalten, benannte Volumes sind Tonys Quadlet-Äquivalente dazu, nicht unser Artefakt.
3. **Einbindung in die vorhandene Infrastruktur** (liegt bei Tony, s. Stand-Hinweis oben):
   - Anbindung an ein bestehendes externes Docker-Netzwerk
   - Der Stack veröffentlicht selbst keine Ports
   - Eigene Subdomain, TLS über den vorhandenen Reverse Proxy
   - **Dienst- und Netzwerknamen mit Präfix versehen**, damit sie mit anderen Anwendungen auf dem Host nicht kollidieren
   - Vor dem Start prüfen, welche Ports und Netzwerknamen bereits belegt sind
4. **`.env` auf dem Server** ist die einzige unversionierte Datei (bzw. das Quadlet-Äquivalent — z. B. eine `.env`-Datei, die die Quadlet-Unit referenziert). Rechte `600`, Inhalt gegen `.env.example` gegengeprüft. **`RUNTIME_ENV=prod` explizit setzen** — fehlt der Wert, zeigt der Header laut dem in DKR1 gebauten Sicherheitsnetz "unknown" statt "prod" an (nicht fälschlich "dev", aber eben auch nicht korrekt beschriftet), s. `docs/docker-lokal-einrichten.md` Abschnitt 1.
5. **Erster Start mit leerer Datenbank:** Migrationen laufen durch, Anwendung erreichbar, Anmeldung schlägt mangels Benutzer fehl — das ist an dieser Stelle das erwartete Verhalten. **Bestätigt** (s. Stand-Hinweis oben).
6. **Ressourcengrenzen setzen** (`mem_limit`, `cpus`), damit der Stack einen geteilten Host nicht verdrängt.

### Abnahme

- [x] Anwendung über die eigene Domain mit gültigem Zertifikat erreichbar — von außen verifiziert (19.08.2026)
- [ ] Migrationsstatus auf dem Server abfragbar — Migrationen laufen nachweislich (Tabellen antworten korrekt), aber nicht direkt auf dem Server abgefragt/protokolliert
- [ ] Keine Portkollision, keine Namenskollision — nicht von außen prüfbar, Tonys Bestätigung ausstehend
- [ ] Neustart des Hosts bringt den Stack selbstständig zurück (aktiv getestet) — nicht von außen prüfbar, aktiver Test ausstehend

---

## Fenster DKR5 — Datenmigration und Backup

**Ziel:** Die echten Daten liegen auf dem Server, das Backup ist nachweislich wiederherstellbar.
**Vorbedingung:** DKR4 abgeschlossen.
**Modell:** `[F5]`

Fertige Befehle zum Kopieren (Datenmigration-Pipeline inkl. Trigger-Falle,
Abgleich-Skript, Backup-Abnahmeliste, Restore-Probe-Vorlage) stehen in
`docs/docker-server-einrichten.md` — dort auch der aktuelle Stand-Hinweis
zu Tonys Podman/Quadlet-Infrastruktur (s. „⚠ Stand 19.08.2026" oben unter
DKR4: kein `docker-compose.prod.yml`, Backup baut Tony selbst).

### Datenmigration

1. **Public-Schema übernehmen:** `pg_dump` der Cloud-Datenbank. Reihenfolge: Migrationen zuerst (Struktur), dann **nur Daten** einspielen.
2. **Benutzer gezielt übertragen, nicht das `auth`-Schema kopieren.**
   > Bei vier Accounts ist ein zielgerichtetes Skript sicherer als ein Schema-Dump, dessen Spaltenaufbau von der GoTrue-Version der Cloud abhängt und mit der lokalen Version auseinanderlaufen kann.

   Übertragen werden: `id`, `email`, `encrypted_password`, `role`, `email_confirmed_at`, Zeitstempel.

   > **Die `id`-Werte müssen identisch bleiben.** `profiles.id` und sämtliche RLS-Politiken hängen daran. Das ist der Punkt, an dem eine unbedachte Migration den gesamten Datenbestand entkoppelt.
   >
   > Die Passwort-Hashes sind übertragbar, die Anmeldedaten bleiben gültig. Das JWT-Secret wechselt jedoch: **alle bestehenden Sitzungen werden ungültig, alle Beteiligten müssen sich einmal neu anmelden.** Vorher ankündigen.
3. **Abgleich nach der Migration:** Zeilenzahl je Tabelle alt gegen neu, stichprobenartiger Inhaltsvergleich, **CTL/ATL/TSB beider Athleten identisch zur Cloud-Fassung**.
4. **RLS-Suite erneut laufen lassen** — diesmal gegen die Produktivinstanz mit echten Daten.

### Backup — vor dem Cutover, nicht danach

5. **Nächtlicher `pg_dump`** als eigener Container in ein Backup-Volume, Aufbewahrung 14 Tage, Protokollierung des Erfolgs.
6. **Verschlüsselte Kopie außerhalb des Servers.** Ein Backup, das nur auf derselben Maschine liegt, überlebt genau die Fälle nicht, für die es da ist.
7. **Restore-Probe durchführen und protokollieren:** Dump in eine leere Datenbank einspielen, Anwendung dagegen starten, Anmeldung testen, Stichprobe der Daten prüfen.
   > **Erst wenn das nachweislich funktioniert hat, gilt Punkt 5 als erledigt.** Der Ablauf aus dieser Probe wird wörtlich zur Vorlage für das Runbook in Fahrplan 2.

### Abnahme

- [ ] Alle vier bestehenden Accounts können sich anmelden
- [ ] RLS-Suite grün gegen die Produktivinstanz
- [ ] Zeilenzahlen und PMC-Werte stimmen mit der Cloud überein
- [ ] Restore-Probe durchgeführt und protokolliert
- [ ] Verschlüsselte Auslagerung funktioniert

---

## Fenster DKR6 — Cutover

**Ziel:** Die eigene Instanz ist die produktive.
**Vorbedingung:** DKR5 abgeschlossen.
**Modell:** `[SO]`

1. **Parallelbetrieb:** Neue Instanz läuft, Cloud bleibt aktiv. Umschaltung ausschließlich über `config.json`.
2. **Rückfahrkarte dokumentieren und testen:** Welcher Wert wird wo zurückgestellt, um binnen Minuten wieder auf die Cloud zu zeigen. Einmal durchspielen, nicht nur aufschreiben.
3. **Sync auf die neue Instanz umstellen.** Ab hier schreibt nur noch eine Seite — Doppelschreiben in beide Datenbanken wäre eine Quelle stiller Divergenz.
4. **Beobachtungsphase zwei bis drei Wochen:** täglich Logs sichten, Backup-Erfolg prüfen, Anmeldungen testen.
5. **Erst danach entscheiden** über: Abschaltung der Cloud-Instanz, Zukunft der GitHub-Pages-Seite, Löschung des deaktivierten Actions-Workflows.
6. **Falls die Pages-Seite bestehen bleibt:** Der aufgeschobene Punkt aus DKR2 Schritt 5 (`data/*.json` aus der Versionierung nehmen) wird hier abschließend entschieden.

### Abnahme

- [ ] Produktivbetrieb läuft über die eigene Instanz
- [ ] Rückfahrkarte einmal getestet
- [ ] Beobachtungsphase ohne Datenverlust überstanden
- [ ] Entscheidung über Cloud-Abschaltung dokumentiert

---

## Anhang — Annahmen

1. Eigene Subdomain, TLS über den auf dem Zielserver vorhandenen Reverse Proxy
2. Einbindung in ein bestehendes externes Docker-Netzwerk, keine eigenen offenen Ports
3. SSH-Zugang und eigenständige Docker-Bedienung sind vorhanden
4. Mindestens 2 GB freier Arbeitsspeicher für den schlanken Stack; bei Ergänzung um Realtime oder Storage entsprechend mehr
5. Kein Mailversand in der ersten Fassung
6. Kein Monitoring in der ersten Fassung — Healthchecks und Logs reichen zum Start
7. Die Dev-Umgebung bleibt vorerst in der Cloud; nur Prod zieht um

## Anhang — Bewusst nicht enthalten

- Realtime, Storage und Edge Functions, solange DKR0 keine Nutzung nachweist
- Öffentliche Registrierung — bleibt dauerhaft ausgeschlossen
- Monitoring, Alarmierung, Logaggregation
- Zweite Umgebung als Container (Dev bleibt Cloud)
