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

- [ ] `docker compose -f docker-compose.dev.yml up` liefert eine voll funktionsfähige App
- [ ] **Dasselbe Image funktioniert mit zwei verschiedenen `config.json`-Werten ohne Neubau** — das ist der eigentliche Nachweis dieses Fensters
- [ ] Image-Größe dokumentiert
- [ ] Container läuft nicht als root (gegengeprüft)

---

## Fenster DKR2 — Sync-Container

**Ziel:** Die Datensynchronisierung läuft im Container statt in GitHub Actions.
**Vorbedingung:** DKR1 abgeschlossen.
**Modell:** `[SO]`

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

- [ ] Vier Dienste plus Migrations-Runner starten sauber
- [ ] Migrationsstatus per Abfrage sichtbar, `0001`–`0017` eingespielt
- [ ] RLS-Suite 28/28 gegen den lokalen Stack
- [ ] Punkt 6 empirisch belegt, nicht angenommen
- [ ] Postgres von außen nicht erreichbar (aktiv gegengeprüft)

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

---

## Fenster DKR4 — Server und Auslieferungskette

**Ziel:** Der Stack läuft auf dem Zielserver — noch mit leerer Datenbank.
**Vorbedingung:** DKR3 vollständig abgenommen, Übergabepunkt oben vollständig erfüllt.
**Modell:** `[SO]`
**Warum getrennt von der Datenmigration:** Infrastrukturfehler und Datenfehler sollen nicht gleichzeitig auftreten können.

1. **Image in CI bauen, nicht auf dem Server.** GitHub Actions baut aus demselben Dockerfile, das in DKR1 lokal geprüft wurde, und pusht nach GHCR. Der Server zieht ein **versioniertes Tag**. Kein `:latest` — sonst ist nicht rekonstruierbar, was gerade läuft.
2. **`docker-compose.prod.yml`** getrennt von der Dev-Fassung: gepinnte Image-Tags, keine offenen Ports außer dem Frontend, Healthchecks, `restart: unless-stopped`, benannte Volumes.
3. **Einbindung in die vorhandene Infrastruktur:**
   - Anbindung an ein bestehendes externes Docker-Netzwerk
   - Der Stack veröffentlicht selbst keine Ports
   - Eigene Subdomain, TLS über den vorhandenen Reverse Proxy
   - **Dienst- und Netzwerknamen mit Präfix versehen**, damit sie mit anderen Anwendungen auf dem Host nicht kollidieren
   - Vor dem Start prüfen, welche Ports und Netzwerknamen bereits belegt sind
4. **`.env` auf dem Server** ist die einzige unversionierte Datei. Rechte `600`, Inhalt gegen `.env.example` gegengeprüft.
5. **Erster Start mit leerer Datenbank:** Migrationen laufen durch, Anwendung erreichbar, Anmeldung schlägt mangels Benutzer fehl — das ist an dieser Stelle das erwartete Verhalten.
6. **Ressourcengrenzen setzen** (`mem_limit`, `cpus`), damit der Stack einen geteilten Host nicht verdrängt.

### Abnahme

- [ ] Anwendung über die eigene Domain mit gültigem Zertifikat erreichbar
- [ ] Migrationsstatus auf dem Server abfragbar
- [ ] Keine Portkollision, keine Namenskollision
- [ ] Neustart des Hosts bringt den Stack selbstständig zurück (aktiv getestet)

---

## Fenster DKR5 — Datenmigration und Backup

**Ziel:** Die echten Daten liegen auf dem Server, das Backup ist nachweislich wiederherstellbar.
**Vorbedingung:** DKR4 abgeschlossen.
**Modell:** `[F5]`

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
