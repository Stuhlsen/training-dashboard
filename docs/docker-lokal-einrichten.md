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

### Verzeichnisstruktur

```
app/
  Dockerfile
  .dockerignore
  nginx.conf
  docker-entrypoint.sh
docker-compose.dev.yml       ← im Repo-Wurzelverzeichnis
.env                         ← nicht versioniert
.env.example                 ← versioniert
```

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

cat > /usr/share/nginx/html/config.json <<EOF
{
  "supabaseUrl": "${SUPABASE_URL}",
  "supabaseAnonKey": "${SUPABASE_ANON_KEY}"
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

```
# Gegen dashboard-dev testen, niemals gegen prod
SUPABASE_URL=https://<dein-dev-projekt>.supabase.co
SUPABASE_ANON_KEY=<dev-anon-key>
```

Kopieren nach `.env` und mit den echten Werten aus `dashboard-dev` füllen. `.env` steht in `.gitignore` (siehe Fahrplan 2, DOK2).

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

### `scripts/Dockerfile`

```dockerfile
FROM node:22-alpine
WORKDIR /sync
COPY package*.json ./
RUN npm ci --omit=dev
COPY scripts/ ./scripts/
CMD ["node", "scripts/generate-data.js"]
```

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
    volumes:
      - data:/sync/data
    # kein "up" von allein starten — wird manuell oder über Zeitsteuerung ausgelöst
    profiles: ["sync"]

volumes:
  data:
```

> **`profiles: ["sync"]`** verhindert, dass der Sync-Dienst bei einem normalen `up` automatisch mitstartet. So bleibt er auf Abruf, wie ATH1/DKR2 es vorsehen — Auslösung über `run`, nicht über Dauerbetrieb.

### Testablauf

```powershell
# Einmaligen Sync auslösen
docker compose -f docker-compose.dev.yml run --rm sync

# Volume-Inhalt prüfen
docker compose -f docker-compose.dev.yml exec frontend ls -la /usr/share/nginx/html/data

# Abbruchtest
docker compose -f docker-compose.dev.yml run --rm sync &
Start-Sleep -Seconds 2
docker compose -f docker-compose.dev.yml kill sync
docker compose -f docker-compose.dev.yml exec frontend cat /usr/share/nginx/html/data/rides.json
# — muss den alten Stand zeigen, nicht leer oder beschädigt sein
```

---

## Abschnitt 3 — DKR3: Self-Host-Stack (Postgres, GoTrue, PostgREST, Proxy)

Das ist der umfangreichste Teil. Vier Dienste, die zusammen die Supabase-Cloud ersetzen.

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

  migrate:
    image: ghcr.io/amacneil/dbmate
    depends_on:
      postgres:
        condition: service_healthy
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
    environment:
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/postgres?sslmode=disable
      GOTRUE_SITE_URL: http://localhost:8080
      GOTRUE_URI_ALLOW_LIST: http://localhost:8080
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_EXP: "3600"
      GOTRUE_DISABLE_SIGNUP: "true"
      GOTRUE_MAILER_AUTOCONFIRM: "true"
      API_EXTERNAL_URL: http://localhost/auth/v1
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true"

  postgrest:
    image: postgrest/postgrest:v12.0.2
    depends_on:
      migrate:
        condition: service_completed_successfully
    environment:
      PGRST_DB_URI: postgres://authenticator:${POSTGRES_PASSWORD}@postgres:5432/postgres
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: ${JWT_SECRET}

  proxy:
    image: caddy:2-alpine
    depends_on:
      - gotrue
      - postgrest
      - frontend
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
        reverse_proxy gotrue:9999
    }
    handle /rest/v1/* {
        uri strip_prefix /rest/v1
        reverse_proxy postgrest:3000
    }
    handle {
        reverse_proxy frontend:8080
    }
}
```

### JWT-Secret und Schlüssel erzeugen

```powershell
# Einmalig ein zufälliges Secret erzeugen und in .env eintragen
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
# → JWT_SECRET in .env eintragen
```

Für die `anon`- und `service_role`-JWTs (signiert mit demselben Secret) das Erzeugungsskript aus dem Repo verwenden, sobald es in DKR3 Schritt 5 angelegt ist — die Werte selbst gehören **niemals** ins Repo, nur das Skript, das sie erzeugt.

### Testablauf

```powershell
docker compose -f docker-compose.selfhost.yml up -d
docker compose -f docker-compose.selfhost.yml ps
```

**Verifikation — die vier Fälle aus DKR3 Punkt 6 (Kong-Frage):**

```powershell
# Fall 1: ausgeloggt lesend auf öffentlich lesbare Tabelle — muss klappen
curl http://localhost/rest/v1/goals -H "apikey: $env:ANON_KEY" -H "Authorization: Bearer $env:ANON_KEY"

# Fall 2: eingeloggt lesend — erst Token holen
curl -X POST http://localhost/auth/v1/token?grant_type=password `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"<test-account>\",\"password\":\"<test-passwort>\"}'
# access_token aus der Antwort in $env:USER_TOKEN speichern, dann:
curl http://localhost/rest/v1/profiles?select=* `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY"

# Fall 3: eingeloggt schreibend — z.B. eigenes wellbeing-Feld
curl -X PATCH "http://localhost/rest/v1/wellbeing?profile_id=eq.<eigene-id>" `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY" `
  -H "Content-Type: application/json" -d '{\"energy\":4}'

# Fall 4: Zugriff auf fremde Daten — MUSS scheitern (leeres Ergebnis oder 401/403)
curl "http://localhost/rest/v1/wellbeing?profile_id=eq.<fremde-id>" `
  -H "Authorization: Bearer $env:USER_TOKEN" -H "apikey: $env:ANON_KEY"
```

**Externer Gegentest — Postgres darf von außen nicht erreichbar sein:**

```powershell
# Muss fehlschlagen (Verbindung abgelehnt oder Timeout)
Test-NetConnection -ComputerName localhost -Port 5432
```

**Migrationsstatus abfragen:**

```powershell
docker compose -f docker-compose.selfhost.yml exec postgres `
  psql -U postgres -c "SELECT * FROM schema_migrations ORDER BY version;"
```

**RLS-Suite gegen den lokalen Stack:**

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
