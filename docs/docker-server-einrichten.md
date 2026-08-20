# Docker-Server einrichten

**Stand:** 20.08.2026
**Zielablage:** `docs/docker-server-einrichten.md`
**Rolle:** Nachschlagedokument mit den konkreten Befehlen für den
Zielserver. Gehört zu `fahrplan-3-docker-umbau.md` — dort stehen
Begründung, Reihenfolge und Abnahmekriterien, hier nur der konkrete Inhalt.

**Gilt ausschließlich für den Zielserver (apps01) bzw. den Umzug dorthin.**
`docs/docker-lokal-einrichten.md` bleibt für alles, was nur den eigenen
Rechner betrifft (DKR1–DKR3).

> **Wichtig — reale Infrastruktur, nicht die ursprüngliche Planung:**
> apps01 wird von Tony (externer Infra-Betreiber) mit rootless Podman +
> systemd Quadlet-Units betrieben, **nicht** mit docker-compose. Es wird
> nie ein `docker-compose.prod.yml` geben. Wir liefern nur versionierte
> Images nach GHCR (`frontend`, `sync`, `migrate`), Tony übersetzt sie
> selbst in Quadlet-Units. Details/Begründung:
> `fahrplan-3-docker-umbau.md`, Abschnitt „⚠ Stand 19.08.2026" unter
> Fenster DKR4 — vor jeder Änderung an diesem Dokument dort zuerst lesen.
>
> Entsprechend baut auch das **Backup** in diesem Dokument Tony selbst, in
> seinem eigenen Quadlet/systemd-Stil — hier steht dazu nur die
> Abnahme-Checkliste (Abschnitt 2), kein Compose-Snippet.

---

## Abschnitt 1 — DKR5: Datenmigration

### Vorab — einmal ankündigen, bevor migriert wird

Das JWT-Secret des Servers unterscheidet sich vom Cloud-Secret. Die
Passwort-Hashes sind übertragbar (Anmeldedaten bleiben gültig), aber
**jede bestehende Sitzung wird beim Umzug ungültig** — alle vier Accounts
müssen sich einmal neu anmelden. Das vorher den Beteiligten sagen, nicht
hinterher erklären.

### 1. Struktur — bereits erledigt

Die Migrationen (`supabase/migrations/0001`–`0017`) sind laut DKR4-Stand
bereits gegen die leere Server-DB gelaufen (Tabellen antworten korrekt über
`/rest/v1/*`, s. `fahrplan-3-docker-umbau.md`). Für DKR5 ist hier nichts
mehr zu tun — nur Daten, keine Struktur.

### 2. Public-Schema-Daten übernehmen

Connection-Strings als Platzhalter — Alex trägt die echten Werte selbst
ein, nie im Repo/Dokument. `$env:TARGET_DB_URL` ist die apps01-Postgres-
Verbindung; **wie genau die zustande kommt (SSH-Tunnel o. ä.), klärt Alex
mit Tony** — Postgres ist laut DKR3-Sicherheitsregel nach außen nicht
erreichbar, ein direkter öffentlicher Connection-String ist also ohnehin
unwahrscheinlich.

```powershell
# Nur Daten aus dem public-Schema, keine Struktur (die liegt schon über
# die Migrationen vor) und kein auth-Schema (s. Abschnitt 3)
$env:SOURCE_DB_URL = "<Cloud-Connection-String aus dem Supabase-Dashboard>"
pg_dump $env:SOURCE_DB_URL --schema=public --data-only --no-owner --format=plain --file=public-data.sql
```

**Noch nicht einspielen** — erst Abschnitt 3 (Nutzer) ist an der Reihe,
sonst kollidiert der `on_auth_user_created`-Trigger (s. dort).

### 3. Nutzer gezielt übertragen — nicht das `auth`-Schema kopieren

Ein zielgerichteter Export ist bei vier Accounts sicherer als ein
Schema-Dump, dessen Spaltenaufbau von der GoTrue-Version der Cloud abhängt
und mit der Server-Version auseinanderlaufen kann.

Übertragen werden: `id`, `email`, `encrypted_password`, `role`,
`email_confirmed_at`, `created_at`, `updated_at`. **Die `id`-Werte müssen
identisch bleiben** — `profiles.id` und sämtliche RLS-Politiken hängen
daran; das ist der Punkt, an dem eine unbedachte Migration den gesamten
Datenbestand entkoppelt.

E-Mail-Filter über Platzhalter-Variablen, nie Klartext im Dokument
(gleiche Datenschutz-Linie wie bei Athletennamen/Koordinaten in
`AGENTS.md`):

```powershell
$env:ATHLETE1_EMAIL = "<echte E-Mail, nur lokal in der Shell setzen>"
$env:ATHLETE2_EMAIL = "<...>"
$env:TRAINER1_EMAIL = "<...>"
$env:TRAINER2_EMAIL = "<...>"

psql $env:SOURCE_DB_URL -c "\copy (SELECT id, email, encrypted_password, role, email_confirmed_at, created_at, updated_at FROM auth.users WHERE email IN ('$env:ATHLETE1_EMAIL','$env:ATHLETE2_EMAIL','$env:TRAINER1_EMAIL','$env:TRAINER2_EMAIL')) TO STDOUT WITH CSV" | psql $env:TARGET_DB_URL -c "\copy auth.users(id, email, encrypted_password, role, email_confirmed_at, created_at, updated_at) FROM STDIN WITH CSV"
```

> **Trigger-Falle** (`supabase/migrations/0001_initial_schema.sql`, Zeile
> 37): `on_auth_user_created` auf `auth.users` legt beim Insert
> automatisch eine leere `public.profiles`-Zeile mit derselben `id` an.
> Kommt danach der public-Schema-Datendump aus Abschnitt 2 mit einer
> eigenen `profiles`-Zeile zur selben `id`, kollidiert das am
> Primärschlüssel. Reihenfolge zwingend:
>
> ```sql
> -- Auf TARGET_DB_URL ausführen, vor dem Nutzer-Import:
> ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
> -- jetzt der \copy-Import aus diesem Abschnitt
> ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
> -- ERST DANACH public-data.sql aus Abschnitt 2 einspielen:
> psql $env:TARGET_DB_URL --file=public-data.sql
> ```

### 4. Abgleich nach der Migration

Zeilenzahl je Tabelle alt gegen neu — `profiles` zuerst, das ist die
eigentliche Nutzerzuordnung, um die es bei der Migration geht. Tabellen aus
`supabase/migrations/0001`–`0016`, **nicht** `wellbeing_shared`: das ist
nur eine View auf `wellbeing`, ein Abgleich darauf sagt nichts über die
Basisdaten aus.

```powershell
$tables = @(
  "profiles", "goals", "events", "wellbeing", "plan_cards", "proposals",
  "feedback", "trainer_view_prefs", "ladder_history", "ftp_history",
  "session_formats", "athlete_formats", "export_prefs"
)
foreach ($t in $tables) {
  $old = psql $env:SOURCE_DB_URL -t -c "SELECT count(*) FROM public.$t"
  $new = psql $env:TARGET_DB_URL -t -c "SELECT count(*) FROM public.$t"
  Write-Output "$t : alt=$($old.Trim()) neu=$($new.Trim())"
}
```

Zusätzlich stichprobenartiger Inhaltsvergleich (ein paar Zeilen je Tabelle
manuell gegenlesen) und CTL/ATL/TSB beider Athleten gegen die
Cloud-Fassung prüfen (App gegen den Server öffnen, Werte mit der
Cloud-Version vergleichen — diese Werte kommen aus der JSON-Pipeline, nicht
aus Postgres, sollten sich also durch die DB-Migration gar nicht ändern;
eine Abweichung wäre ein Hinweis auf ein anderes Problem).

Danach RLS-Suite erneut laufen lassen, diesmal gegen die Produktivinstanz:

```powershell
$env:SUPABASE_URL = "<Server-URL>/rest/v1"
npm test -- tests/supabase-rls.test.js
```

---

## Abschnitt 2 — DKR5: Backup

**Baut Tony selbst**, in seinem eigenen Quadlet/systemd-Stil — kein
Compose-Service, kein bestimmtes Backup-Image von uns. Hier nur die
Kriterien, die am Ende gegengeprüft werden (Abnahme-Checkliste, deckt sich
mit `fahrplan-3-docker-umbau.md` DKR5):

- [ ] Nächtlicher `pg_dump`, Aufbewahrung 14 Tage
- [ ] Erfolg/Fehlschlag jedes Laufs wird geloggt
- [ ] Verschlüsselte Kopie außerhalb von apps01 (ein Backup, das nur auf
      derselben Maschine liegt, überlebt genau die Fälle nicht, für die es
      da ist)
- [ ] Restore-Probe durchgeführt **und protokolliert** — s. Ablauf-Vorlage
      unten. Erst wenn das nachweislich funktioniert hat, gilt der Punkt
      als erledigt, nicht schon wenn ein Dump existiert.

### Restore-Probe — Ablauf-Vorlage

Noch nicht durchgeführt — diese Vorlage wird nach dem echten Durchlauf mit
dem tatsächlichen Ablauf ergänzt. Sie wird laut Fahrplan später wörtlich
zur Vorlage für `docs/runbook.md` (Fahrplan 2, Fenster DOK3):

1. Dump in eine leere Test-Datenbank einspielen (nicht die produktive DB).
2. Anwendung gegen diese Test-Datenbank starten.
3. Anmeldung mit einem der vier Accounts testen.
4. Stichprobe der Daten prüfen (ein paar Zeilen je zentraler Tabelle, s.
   Tabellenliste aus Abschnitt 1.4).
5. Ergebnis hier oder in `docs/offene-punkte.md` festhalten: Datum, wer
   durchgeführt hat, was geprüft wurde, Ausgang.
