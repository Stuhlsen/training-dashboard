# Docker lokal einrichten

**Stand:** 14.08.2026
**Zielablage:** `docs/docker-lokal-einrichten.md`
**Rolle:** Nachschlagedokument mit vollständigen Dateien zum Kopieren. Gehört zu `fahrplan-3-docker-umbau.md` — dort stehen Begründung, Reihenfolge und Abnahmekriterien, hier nur der konkrete Inhalt.

**Gilt ausschließlich für den eigenen Rechner.** Nichts in diesem Dokument berührt einen Server. Die Server-Fassungen (`docker-compose.prod.yml` etc.) entstehen erst in DKR4 und gehören nicht hierher.

---

## Voraussetzungen

- Docker Desktop installiert und gestartet (enthält Docker Engine + Compose v2)
- Prüfen: `docker --version` und `docker compose version` liefern beide eine Ausgabe
- Node ≥22.3 lokal installiert (für Testläufe außerhalb des Containers, z. B. `npm test`)
- PowerShell — alle Befehle hier sind ohne `&&`-Verkettung geschrieben

---

## Abschnitt 1 — DKR1: Frontend-Image

**Stand 17.08.2026: alle Dateien in diesem Abschnitt sind bereits im Repo
angelegt** — dieser Abschnitt ist ab jetzt Dokumentation des tatsächlichen
Stands, nicht mehr nur Kopiervorlage.

### Verzeichnisstruktur

```
app/
  Dockerfile
  .dockerignore
  nginx.conf
  docker-entrypoint.sh
docker-compose.dev.yml       ← im Repo-Wurzelverzeichnis
.env                         ← nicht versioniert
.env.example                 ← versioniert, dieselbe Datei wie für `npm run sync`
                                (SUPABASE_URL/SUPABASE_ANON_KEY werden doppelt genutzt)
```

### Vorab nötige Code-Änderung: Laufzeit-Konfiguration

Der DKR0-Bericht (`docs/offene-punkte.md`) hatte eine Lücke aufgedeckt:
`app/src/api/supabase/config.ts` wählte Supabase-URL/Key bislang
ausschließlich über eine feste Hostname-Tabelle — ohne jeden Mechanismus,
zur Laufzeit etwas anderes einzuspeisen. Der Abnahmenachweis "ein Image,
zwei Konfigurationen" wäre damit nicht erbringbar gewesen. Das genaue
Warum (Container läuft selbst auf `localhost`) und Wie (synchrone
`XMLHttpRequest` in `index.html`, `window.__RUNTIME_CONFIG__`,
Vorrang-Reihenfolge in `resolveEntry()`) steht nicht hier doppelt, sondern
ausschließlich als Kommentar direkt in `app/index.html` und
`app/src/api/supabase/config.ts` — das ist die eine Stelle, die bei einer
künftigen Änderung der Logik gepflegt werden muss.

**Sicherheitsnetz für DKR4:** `RUNTIME_ENV` wird nicht 1:1 durchgereicht.
Fehlt der Wert, gilt "dev" (der einzige Fall, den DKR1 selbst braucht); ist
er exakt `"prod"`, gilt "prod"; jeder andere Wert (Tippfehler wie
`"production"`) ergibt "unknown" — sichtbar im `EnvBadge`, statt
stillschweigend als "dev" durchzugehen. `docker-compose.prod.yml` (DKR4)
muss `RUNTIME_ENV=prod` trotzdem explizit setzen, sonst zeigt der Header
"unknown" statt "prod" auf einer echten Produktivinstanz.

### `app/Dockerfile`

```dockerfile
# Stufe 1: Bauen
FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stufe 2: Ausliefern
FROM nginx:alpine
RUN addgroup -g 1001 appgroup && adduser -D -u 1001 -G appgroup appuser
COPY --from=build /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-write-config.sh
RUN chmod +x /docker-entrypoint.d/40-write-config.sh \
    && chown -R appuser:appgroup /usr/share/nginx/html /var/cache/nginx /var/run \
    && touch /var/run/nginx.pid \
    && chown appuser:appgroup /var/run/nginx.pid
USER appuser
EXPOSE 8080
```

> **Warum Port 8080 und nicht 80:** Ein Nicht-Root-Nutzer darf keine Ports unter 1024 öffnen. `nginx.conf` unten hört deshalb auf 8080, die Portzuordnung nach außen passiert in der Compose-Datei.

### `app/.dockerignore`

```
node_modules
dist
.git
docs
tests
*.md
.env
```

### `app/nginx.conf`

```nginx
server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;

    gzip on;
    gzip_types text/css application/javascript application/json;

    # config.json wird bei jedem Containerstart neu geschrieben — nie cachen
    location = /config.json {
        add_header Cache-Control "no-store, no-cache, must-revalidate";
        try_files $uri =404;
    }

    # gehashte Assets dürfen lange gecacht werden
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # SPA-Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### `app/docker-entrypoint.sh`

```bash
#!/bin/sh
set -e

# Fail fast statt leise leeres config.json zu schreiben: sonst faellt die App
# unbemerkt auf die hart eingetragene dev-Hostname-Tabelle zurueck (config.ts
# verwirft leere Werte), und ein fehlendes .env sieht dann aus wie ein
# funktionierender Container.
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
  echo "docker-entrypoint: SUPABASE_URL/SUPABASE_ANON_KEY nicht gesetzt — .env pruefen" >&2
  exit 1
fi

# RUNTIME_ENV bewusst ohne Shell-seitigen Default: der einzige Default
# ("fehlt env -> dev") lebt in config.ts::resolveEntry(), nicht hier UND dort.
cat > /usr/share/nginx/html/config.json <<EOF
{
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}",
  "env": "${RUNTIME_ENV}"
}
EOF
```

> Läuft automatisch beim Containerstart, weil nginx alle Skripte in `/docker-entrypoint.d/` vor dem eigentlichen Start ausführt — kein manueller Aufruf nötig.

### `docker-compose.dev.yml`

```yaml
services:
  frontend:
    build:
      context: ./app
    ports:
      - "8080:8080"
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### `.env.example`

Keine eigene Datei — `docker-compose.dev.yml` liest `SUPABASE_URL`/
`SUPABASE_ANON_KEY` aus derselben Repo-Wurzel-`.env`, die auch
`npm run sync` und `npm test` nutzen (s. `.env.example`, Abschnitt
"Supabase, dev-Projekt"). Mit den echten Werten aus `dashboard-dev` füllen,
niemals aus `dashboard-prod`. `.env` steht in `.gitignore` (siehe
Fahrplan 2, DOK2).

**Werte ohne Anführungszeichen eintragen** (`SUPABASE_URL=https://...`,
nicht `SUPABASE_URL="https://..."`) — Docker Compose entfernt Anführungszeichen
bei der `${VAR}`-Ersetzung in der Compose-Datei nicht, sie würden sonst
wörtlich Teil des Werts und die vom Entrypoint erzeugte `config.json` wäre
kein gültiges JSON mehr (landet dann im `catch` in `index.html`, App fällt
still auf die Hostname-Tabelle zurück).

### Testablauf

```powershell
docker compose -f docker-compose.dev.yml build
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
start http://localhost:8080
```

Nachweis "ein Image, zwei Konfigurationen":

```powershell
# SUPABASE_URL/ANON_KEY in .env auf ein zweites Projekt ändern, dann NUR:
docker compose -f docker-compose.dev.yml up -d
# kein build dazwischen — im Browser prüfen, dass sich config.json geändert hat
curl http://localhost:8080/config.json
```

---

## Abschnitt 2 — DKR2: Sync-Container

**Stand 17.08.2026: alle Dateien in diesem Abschnitt sind bereits im Repo
angelegt** und lokal geprüft (Build, Volume-Verdrahtung, Fail-Fast-Pfad,
Abbruchtest) — offen sind nur noch die beiden Punkte unter „Noch offen"
unten, die einen echten Lauf gegen deine echte `.env` bzw. eine
Produktiv-Entscheidung brauchen.

### `scripts/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /sync
COPY package*.json ./
RUN npm ci --omit=dev
COPY scripts/ ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
```

Build-Kontext ist das Repo-Wurzelverzeichnis (`context: .`), deshalb gibt es
dort ein eigenes `.dockerignore` (schließt u. a. `app/`, `data/`, `docs/`,
`tests/` aus — nur `package*.json` und `scripts/` werden tatsächlich
gebraucht).

### `scripts/docker-entrypoint.sh` — Zeitsteuerung im Container

Löst DKR2 Punkt 2 (Intervall über Umgebungsvariable statt Host-Cron):

```sh
#!/bin/sh
INTERVAL_HOURS="${SYNC_INTERVAL_HOURS:-6}"

run_once() {
  start_ts=$(date +%s)
  echo "[sync] Start: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  node scripts/generate-data.js
  status=$?
  end_ts=$(date +%s)
  echo "[sync] Ende: $(date -u +"%Y-%m-%dT%H:%M:%SZ") (exit $status, $((end_ts - start_ts))s)"
  return $status
}

if [ "${SYNC_ONESHOT:-false}" = "true" ]; then
  run_once
  exit $?
fi

while true; do
  run_once
  if [ $? -ne 0 ]; then
    echo "[sync] Lauf fehlgeschlagen — naechster Versuch in ${INTERVAL_HOURS}h" >&2
  fi
  sleep $(( INTERVAL_HOURS * 3600 ))
done
```

Zwei Betriebsarten über Umgebungsvariablen, kein zweites Image nötig:

- **Standard (kein `SYNC_ONESHOT`):** Endlosschleife — sofortiger erster
  Lauf, danach alle `SYNC_INTERVAL_HOURS` Stunden (Default 6) erneut. Das
  ist der Modus für `up -d sync` (Dauerbetrieb).
- **`SYNC_ONESHOT=true`:** genau ein Lauf, dann Exit mit dem Exit-Code des
  Sync-Laufs. Das ist der Modus für den manuellen Auslöser (`run --rm`,
  DKR2 Punkt 2 zweiter Halbsatz).

Bewusst kein `set -e`: ein fehlgeschlagener Lauf soll die Schleife
fortsetzen (nächster Versuch in `SYNC_INTERVAL_HOURS`), nicht den Container
beenden.

### Ergänzung in `docker-compose.dev.yml`

```yaml
services:
  frontend:
    # … wie oben …
    volumes:
      - data:/usr/share/nginx/html/data:ro

  sync:
    build:
      context: .
      dockerfile: scripts/Dockerfile
    env_file: .env
    environment:
      SYNC_INTERVAL_HOURS: ${SYNC_INTERVAL_HOURS:-6}
    volumes:
      - data:/sync/data
    restart: unless-stopped
    # profiles: startet nicht automatisch bei einem normalen "up" — nur
    # gezielt via "up -d sync" (Dauerbetrieb) oder "run --rm sync" (Einmal-Lauf)
    profiles: ["sync"]

volumes:
  data:
```

> **Achtung `env_file: .env`:** Dieser Dienst lädt bei JEDEM Start —
> `up -d sync` genauso wie `run --rm sync` — deine echte lokale `.env` mit
> echten Notion-/intervals.icu-Zugangsdaten. Das ist beabsichtigt (genau
> die Werte, die auch `npm run sync` nutzt), heißt aber: **`run --rm sync`
> ohne weitere Flags macht einen echten Sync-Lesevorgang gegen echte
> APIs** — dieselbe Rücksprache-Pflicht wie bei `npm run sync` (s.
> `docs/offene-punkte.md`, M3-Punkt). Ein `--env-file <andere-datei>` auf
> der `docker compose`-Kommandozeile überschreibt das NICHT — dieses Flag
> gilt nur für `${VAR}`-Platzhalter in der Compose-Datei selbst, nicht für
> den service-eigenen `env_file:`-Eintrag. Für einen sicheren Trockenlauf
> ohne echte Aufrufe gezielt einzelne Variablen leeren:
> `docker compose run --rm -e NOTION_API_KEY= -e NOTION_DATABASE_ID= -e SYNC_ONESHOT=true sync`
> — das lässt `requireEnv()` sofort fehlschlagen, bevor irgendein Netzwerkaufruf passiert.

### `app/nginx.conf` — Nachtrag aus DKR2

DKR1s `nginx.conf` kannte den Pfad `/data/` noch nicht als eigenes Volume.
Mit einem leeren oder noch nicht befüllten Volume griff die SPA-Fallback-
Regel (`location /`) auch für `/data/rides.json` und lieferte `index.html`
mit `Content-Type: text/html` und Status 200 zurück — das Frontend hätte an
`JSON.parse()` einer HTML-Seite undurchsichtig scheitern können, statt ein
sauberes „keine Daten" zu erkennen. Fix: eigener `location /data/`-Block
**vor** der SPA-Fallback, mit `try_files $uri =404;` (kein Fallback) und
`Cache-Control: no-cache` (Dateien werden vom Sync-Container laufend neu
geschrieben). Empirisch geprüft: fehlende Datei → echtes 404, vorhandene
Datei → 200 mit `Content-Type: application/json`.

### Testablauf

```powershell
# Einmaligen Sync auslösen (macht einen ECHTEN API-Aufruf, s. Warnung oben!)
# -e SYNC_ONESHOT=true nicht vergessen — ohne das Flag startet der Container
# in die Endlosschleife (Dauerbetrieb) statt nach einem Lauf zu beenden.
docker compose -f docker-compose.dev.yml run --rm -e SYNC_ONESHOT=true sync

# Volume-Inhalt prüfen
docker compose -f docker-compose.dev.yml exec frontend ls -la /usr/share/nginx/html/data

# Abbruchtest
docker compose -f docker-compose.dev.yml run --rm -e SYNC_ONESHOT=true sync &
Start-Sleep -Seconds 2
docker compose -f docker-compose.dev.yml kill sync
docker compose -f docker-compose.dev.yml exec frontend cat /usr/share/nginx/html/data/rides.json
# — muss den alten Stand zeigen, nicht leer oder beschädigt sein
```

> **Git-Bash-Falle (falls du testest, ohne PowerShell zu nutzen):** Git Bash
> auf Windows übersetzt absolute Unix-Pfade wie `/usr/share/nginx/html/data`
> automatisch in Windows-Pfade und verfälscht so `docker compose exec`-
> Aufrufe. Abhilfe: `export MSYS_NO_PATHCONV=1` vor dem Befehl, oder
> PowerShell verwenden (dort tritt das Problem nicht auf).

### Bereits verifiziert (17.08.2026, gegen Fake-/leere Werte, keine echten Secrets)

- Sync-Image baut (`docker compose build sync`)
- Fail-Fast ohne echten Netzwerkaufruf: fehlende `NOTION_API_KEY`/
  `NOTION_DATABASE_ID` lassen `requireEnv()` sofort greifen (`exit 1`,
  < 1s Laufzeit, Volume bleibt leer)
- Atomare Schreiblogik (`scripts/lib/output.js::writeOutput()`, s. unten):
  ein mitten im Schreiben abgebrochener Lauf lässt die zuvor geschriebene
  Datei unverändert — mehrfach mit einer künstlich verlangsamten
  Schreibschleife gegengeprüft, nie eine leere/halbe Zieldatei beobachtet
- Volume-Verdrahtung frontend↔sync: leeres Volume → echtes 404 auf
  `/data/rides.json`; Datei manuell ins benannte Volume geschrieben → 200
  mit `Content-Type: application/json`

### Noch offen (braucht deine echte `.env` bzw. eine bewusste Entscheidung)

- **Echter Sync-Lauf mit echten Daten, Frontend zeigt sie an** — Abnahme-
  Punkt 2 aus `fahrplan-3-docker-umbau.md`. Das ist der einzige noch nicht
  gegengeprüfte der vier Abnahme-Punkte; die anderen drei sind oben belegt.
  Bitte selbst auslösen (`docker compose run --rm -e SYNC_ONESHOT=true sync`, dann `up -d
  frontend` und im Browser prüfen) — siehe Warnung oben zu `env_file: .env`.
- **`data/*.json` aus der Versionierung nehmen** (DKR2 Punkt 5) — bewusst
  NICHT umgesetzt. Bis zum Cutover (DKR6) liefert GitHub Pages die
  öffentliche Seite weiterhin aus den versionierten Dateien; ein Entfernen
  jetzt würde die Live-Seite von ihrer Datenquelle abschneiden. Eigene
  Entscheidung wert, nicht nebenbei mitgemacht.
- **GitHub-Actions-Workflow (`sync-data.yml`) deaktivieren** (Abnahme-Punkt
  4) — bewusst NICHT umgesetzt, aus demselben Grund: das ist aktuell die
  einzige Datenquelle der Live-Seite. Erst deaktivieren, wenn der lokale
  Sync-Container nachweislich läuft und du das explizit willst.

---

## Abschnitt 3 — DKR3: Self-Host-Stack (Postgres, GoTrue, PostgREST, Proxy)

**Stand 17.08.2026: alle Dateien in diesem Abschnitt sind bereits im Repo
angelegt und lokal voll verifiziert** — `tests/supabase-rls.test.js` läuft
28/28 grün gegen den lokalen Stack, alle fünf Abnahme-Punkte aus
`fahrplan-3-docker-umbau.md` DKR3 sind erfüllt. Fünf Dienste
(`postgres`, `db-init`, `migrate`, `gotrue`, `postgrest`, `proxy` — der
Fahrplan zählt `db-init` nicht separat, s. u. warum er trotzdem nötig war),
die zusammen die Supabase-Cloud ersetzen. Das Frontend (DKR1) läuft separat,
nicht Teil dieser Compose-Datei — hier wird ausschließlich das Backend
geprüft.

### Vier empirisch gefundene Lücken gegenüber dem ursprünglichen Entwurf

Der erste Testlauf deckte vier Stellen auf, an denen sich das
`supabase/postgres`-Image und `supabase/gotrue:v2.151.0` anders verhalten
als der ursprüngliche Entwurf angenommen hatte. Alle vier sind unten in
`docker-compose.selfhost.yml` bereits eingearbeitet:

1. **`authenticator`/`supabase_auth_admin` haben ein eigenes Passwort**,
   unabhängig von `POSTGRES_PASSWORD` — PostgREST scheiterte zunächst mit
   `password authentication failed for user "authenticator"`. Der neue
   Dienst `db-init` setzt beide Passwörter explizit, **bevor** `migrate`
   läuft.
2. **GoTrue muss sich als `supabase_auth_admin` verbinden, nicht als
   `postgres`.** Mit `postgres` löste GoTrue unqualifizierte Tabellennamen
   wie `identities` nicht auf (`relation "identities" does not exist`) —
   `supabase_auth_admin`s `search_path` ist auf das `auth`-Schema
   vorkonfiguriert, `postgres`s nicht.
3. **GoTrue hört auf Port 8081, nicht auf das oft dokumentierte 9999** (aus
   dem Log dieses konkreten Images: `GoTrue API started on: :8081`).
   Healthcheck und `Caddyfile.local` zeigen entsprechend auf 8081.
4. **Das Image vergibt per `ALTER DEFAULT PRIVILEGES FOR ROLE postgres`
   automatisch ALLE Rechte** (SELECT/INSERT/UPDATE/DELETE/…) an
   `anon`/`authenticated`/`service_role` auf jede künftig im `public`-Schema
   angelegte Tabelle — das hebelt die feingranularen `GRANT`s aus
   `supabase/migrations/0002_grants.sql` vollständig aus. Sichtbar wurde das
   erst durch den RLS-Testlauf selbst (5 von 28 Tests fielen mit "anon darf
   X nicht lesen" durch, obwohl 0002 dafür kein `SELECT` vorsieht). `db-init`
   widerruft diese Default-Privileges **für die Rolle `postgres`** (nicht
   für `supabase_admin`, das ist ein eigener, hier falscher erster Versuch
   gewesen), bevor `migrate` die Tabellen anlegt.

Zwei weitere Lücken kamen beim Verifikationsschritt (DKR3 Punkt 6 und 9)
dazu:

5. **Per GoTrue-Admin-API angelegte Nutzer haben ein leeres `role`-Feld** in
   `auth.users`, solange man es nicht explizit im Request-Body mitgibt
   (`"role": "authenticated"`) oder danach per SQL nachträgt. Ohne das ist
   der `role`-Claim im ausgestellten JWT leer, und PostgREST lehnt mit
   `role "" does not exist` ab.
6. **`scripts/lib/env.js` überschrieb einen vorab in der Shell gesetzten
   Wert immer mit dem Inhalt aus `.env`** — der unten dokumentierte
   `$env:SUPABASE_URL = "http://localhost"`-Override vor `npm test` wäre
   damit wirkungslos gewesen. Behoben: ein vorab gesetzter, **nicht-leerer**
   Wert gewinnt jetzt gegen `.env` (ein leerer String zählt bewusst als
   "nicht gesetzt", sonst würde z. B. der Docker-Dry-Run-Test mit
   `-e NOTION_API_KEY=` aus Abschnitt 2 einen späteren echten `.env`-Wert im
   selben Prozess blockieren) — Details im Kommentar dort.

### `docker-compose.selfhost.yml`

```yaml
services:
  postgres:
    image: supabase/postgres:15.1.0.147
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # KEIN "ports:" hier — von außen absichtlich nicht erreichbar
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 10

  # s. Lücken 1 und 4 oben — setzt Passwörter und widerruft die vom Image
  # automatisch vergebenen Default-Privileges, bevor "migrate" läuft.
  db-init:
    image: supabase/postgres:15.1.0.147
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      PGPASSWORD: ${POSTGRES_PASSWORD}
    entrypoint: ["bash", "-c"]
    command:
      - >
        psql -h postgres -U supabase_admin -d postgres -c
        "ALTER ROLE authenticator WITH PASSWORD '$$PGPASSWORD' LOGIN;" &&
        psql -h postgres -U supabase_admin -d postgres -c
        "ALTER ROLE supabase_auth_admin WITH PASSWORD '$$PGPASSWORD';" &&
        psql -h postgres -U supabase_admin -d postgres -c
        "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;"

  migrate:
    image: ghcr.io/amacneil/dbmate
    depends_on:
      db-init:
        condition: service_completed_successfully
    environment:
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres?sslmode=disable
    volumes:
      - ./supabase/migrations:/db/migrations
    command: ["--wait", "up"]

  gotrue:
    image: supabase/gotrue:v2.151.0
    depends_on:
      migrate:
        condition: service_completed_successfully
      db-init:
        condition: service_completed_successfully
    environment:
      GOTRUE_DB_DRIVER: postgres
      # supabase_auth_admin, nicht postgres — s. Lücke 2 oben.
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:${POSTGRES_PASSWORD}@postgres:5432/postgres?sslmode=disable
      GOTRUE_SITE_URL: http://localhost:8080
      GOTRUE_URI_ALLOW_LIST: http://localhost:8080
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_EXP: "3600"
      GOTRUE_DISABLE_SIGNUP: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      API_EXTERNAL_URL: http://localhost/auth/v1
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"
    healthcheck:
      # Port 8081, nicht 9999 — s. Lücke 3 oben.
      test: ["CMD", "wget", "-qO-", "http://localhost:8081/health"]
      interval: 5s
      timeout: 5s
      retries: 10

  postgrest:
    image: postgrest/postgrest:v12.0.2
    depends_on:
      migrate:
        condition: service_completed_successfully
      db-init:
        condition: service_completed_successfully
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@postgres:5432/postgres
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}
    # Kein Healthcheck moeglich: das Image hat weder Shell noch wget/curl,
    # nur die statische postgrest-Binary ("executable file not found in
    # $PATH" bei jedem exec-Versuch, empirisch geprueft). PostgREST
    # verbindet sich laut Log binnen ~1-2s — die Restrace gegen "proxy"
    # aeussert sich hoechstens als einzelner transienter 502 direkt nach
    # "up -d", kein Dauerzustand.

  proxy:
    image: caddy:2-alpine
    depends_on:
      gotrue:
        condition: service_healthy
      postgrest:
        condition: service_started
    ports:
      - "80:80"
    volumes:
      - ./Caddyfile.local:/etc/caddy/Caddyfile

volumes:
  pgdata:
```

### `Caddyfile.local`

```
:80 {
    handle /auth/v1/* {
        uri strip_prefix /auth/v1
        reverse_proxy gotrue:8081
    }
    handle /rest/v1/* {
        uri strip_prefix /rest/v1
        reverse_proxy postgrest:3000
    }
    handle {
        respond "DKR3 self-host stack: nur /auth/v1 und /rest/v1 sind geroutet, das Frontend laeuft separat (DKR1)." 404
    }
}
```

### Migrationsdateien: `-- migrate:up`/`-- migrate:down`-Marker

`dbmate` verlangt beide Marker pro Datei. Allen 17 Dateien unter
`supabase/migrations/` wurde `-- migrate:up` als erste und ein leerer
`-- migrate:down`-Block als letzte Zeile hinzugefügt (reiner
Kommentar-Zusatz, keine SQL-Änderung) — dieses Projekt rollt Migrationen nie
automatisiert zurück, dbmate verlangt den Marker aber trotzdem, damit er die
Datei überhaupt akzeptiert.

### JWT-Secret und Schlüssel erzeugen

```powershell
# Einmalig ein zufälliges Secret erzeugen und in .env eintragen
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
# → JWT_SECRET in .env eintragen (POSTGRES_PASSWORD analog)
```

`scripts/generate-jwt-keys.js` (abhängigkeitsfreier HS256-Signer, Node-
`crypto`) gibt `anon`- und `service_role`-JWT auf `stdout` aus:

```powershell
node scripts/generate-jwt-keys.js
```

Die Werte gehören **niemals** ins Repo oder in eine Datei, nur zum Kopieren
in die eigene Shell/`.env`.

### Testaccounts für die RLS-Suite anlegen

Der lokale Stack startet mit leerer `auth.users` — die RLS-Suite loggt sich
aber mit echten Accounts ein (`SUPABASE_ATHLETE1_EMAIL/PASSWORD`,
`SUPABASE_TRAINER_EMAIL/PASSWORD` aus der eigenen `.env`). Zwei frische,
von der Cloud getrennte Accounts mit denselben Login-Werten über die
GoTrue-Admin-API anlegen (braucht den `service_role`-JWT von oben,
**`"role": "authenticated"` im Body nicht vergessen** — s. Lücke 5 oben):

```powershell
curl -X POST http://localhost/auth/v1/admin/users `
  -H "Authorization: Bearer $env:SERVICE_KEY" -H "apikey: $env:SERVICE_KEY" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"<SUPABASE_ATHLETE1_EMAIL>\",\"password\":\"<SUPABASE_ATHLETE1_PASSWORD>\",\"email_confirm\":true,\"role\":\"authenticated\",\"user_metadata\":{\"display_name\":\"Stuhlsen\",\"role\":\"athlete\"}}'

curl -X POST http://localhost/auth/v1/admin/users `
  -H "Authorization: Bearer $env:SERVICE_KEY" -H "apikey: $env:SERVICE_KEY" `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"<SUPABASE_TRAINER_EMAIL>\",\"password\":\"<SUPABASE_TRAINER_PASSWORD>\",\"email_confirm\":true,\"role\":\"authenticated\",\"user_metadata\":{\"display_name\":\"Trainer-ST\",\"role\":\"coach\"}}'
```

Danach `profiles.coach_id` einmalig per SQL verknüpfen (Trainer → Athlet,
analog zur echten dashboard-dev-Beziehung):

```powershell
docker compose -f docker-compose.selfhost.yml exec postgres psql -U postgres -d postgres -c `
  "UPDATE public.profiles SET coach_id = (SELECT id FROM auth.users WHERE email = '<SUPABASE_TRAINER_EMAIL>') WHERE id = (SELECT id FROM auth.users WHERE email = '<SUPABASE_ATHLETE1_EMAIL>');"
```

### Testablauf

```powershell
docker compose -f docker-compose.selfhost.yml up -d
docker compose -f docker-compose.selfhost.yml ps -a
```

**Verifikation — die vier Fälle aus DKR3 Punkt 6 (Kong-Frage), alle bestätigt:**

```powershell
# Fall 1: ausgeloggt lesend auf öffentlich lesbare Tabelle — 200, leeres Array
curl http://localhost/rest/v1/goals -H "apikey: $env:ANON_KEY" -H "Authorization: Bearer $env:ANON_KEY"

# Fall 2: eingeloggt lesend — erst Token holen
curl -X POST "http://localhost/auth/v1/token?grant_type=password" `
  -H "Content-Type: application/json" -H "apikey: $env:ANON_KEY" `
  -d '{\"email\":\"<test-account>\",\"password\":\"<test-passwort>\"}'
# access_token aus der Antwort in $env:USER_TOKEN speichern, dann:
curl "http://localhost/rest/v1/profiles?select=*" `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY"

# Fall 3: eingeloggt schreibend — z.B. eigenes wellbeing_public
curl -X PATCH "http://localhost/rest/v1/profiles?display_name=eq.<eigener-name>" `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY" `
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{\"wellbeing_public\":true}'

# Fall 4: Zugriff auf fremde Daten — MUSS scheitern (hier: leeres Array, HTTP 200 —
# die bekannte Falle, s. "Typische Fehler" unten, Assertion auf Zeilenzahl prüfen)
curl -X PATCH "http://localhost/rest/v1/profiles?display_name=eq.<fremder-name>" `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY" `
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{\"wellbeing_public\":true}'
```

**Externer Gegentest — Postgres darf von außen nicht erreichbar sein:**

```powershell
# Muss fehlschlagen (Verbindung abgelehnt oder Timeout)
Test-NetConnection -ComputerName localhost -Port 5432
```

**Migrationsstatus abfragen:**

```powershell
docker compose -f docker-compose.selfhost.yml exec postgres `
  psql -U postgres -d postgres -c "SELECT version FROM schema_migrations WHERE version ~ '^00' ORDER BY version;"
```

**RLS-Suite gegen den lokalen Stack — 28/28 grün, empirisch bestätigt:**

```powershell
$env:SUPABASE_URL = "http://localhost"
$env:SUPABASE_ANON_KEY = "<anon-jwt>"
npm test -- tests/supabase-rls.test.js
```

**Aufräumen (auch die Datenbank löschen, für einen sauberen Neustart):**

```powershell
docker compose -f docker-compose.selfhost.yml down -v
```

---

## Typische Fehler beim ersten Versuch

| Symptom | Wahrscheinliche Ursache |
|---|---|
| `frontend` startet, aber `config.json` fehlt | Entrypoint-Skript nicht ausführbar (`chmod +x` im Dockerfile vergessen) |
| `postgrest` startet nicht, Fehler zu Rollen | `migrate`-Dienst ist noch nicht fertig — `depends_on: condition: service_completed_successfully` fehlt oder falsch gesetzt |
| RLS-Test schlägt fehl, obwohl die Anfrage 200 zurückgibt | Bekannte Falle: ein PATCH ohne RLS-Treffer liefert HTTP 200 mit null Zeilen — Test muss auf `data.length` prüfen, nicht auf `.ok` |
| `gotrue` kommt nicht hoch | `GOTRUE_JWT_SECRET` und `PGRST_JWT_SECRET` weichen voneinander ab — müssen identisch sein |
| Port 80 schon belegt | Anderer lokaler Dienst (z. B. IIS, Skype, ein anderer Container) — `proxy`-Port in `docker-compose.selfhost.yml` testweise auf `8081:80` ändern |

---

## Nächster Schritt nach diesem Dokument

Wenn DKR1 bis DKR3 hier lokal durchlaufen und abgenommen sind: zurück zu `fahrplan-3-docker-umbau.md`, Abschnitt **„Übergabepunkt"** zwischen DKR3 und DKR4. Von dort geht es weiter auf den Server — mit anderen, eigenen Dateien (`docker-compose.prod.yml`), die hier bewusst nicht enthalten sind.
