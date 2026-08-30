# Fahrplan 3 — Ergänzung: Sync-Produktivbetrieb (schließt Issue #31)

**Stand:** 2026-08-30 — **alle Fenster (A–D) abgeschlossen, Issue #31 geschlossen.**
Sync läuft produktiv als Container auf apps01, GitHub-Actions-Sync auf
`workflow_dispatch` reduziert, `data/*.json` entversioniert (Commit `916b98e`),
Doku nachgezogen.
**Zielablage:** `docs/fahrplan-3-sync-produktivbetrieb.md`
**Herkunft:** GitHub Issue #31 (Tony) + `docs/offene-punkte.md`, Abschnitt
„Sync-Pipeline" — beide beschreiben denselben Umbau, werden mit diesem
Dokument zusammengeführt.
**Verhältnis zu `fahrplan-3-docker-umbau.md`:** keine neue Architektur —
dieses Dokument bricht den bereits dort geplanten Produktivrollout von
Fenster DKR2 in eigene, abschließbare Fenster herunter, weil er externe
Abstimmung mit Tony braucht und nicht in einem Zug durchgeführt wird.

---

## Befund, nicht Annahme

- **Issue #31** (Tony, 23.08.2026): Aktuell generiert die Sync-Action
  `data/*.json`, committet sie ins Repo, Tonys Server pollt alle 6h ein
  öffentliches Tarball. Ziel: die Sync-Daten direkt an den Server
  weitergeben, ohne den Commit+Poll-Umweg und dessen Staleness-Fenster.
  Offene Frage von Tony: pusht die Action die Daten nach dem Generieren,
  oder läuft der ganze Sync-Job künftig auf apps01? „Either works for us."
  Zugangsdaten dafür sind auf Tonys Seite bereits vorbereitet.
  Abhängig von #30 (GitHub-Pages-Deploy entfernt) — **#30 ist gelandet**
  (Commit `7efd211`, 20.08.2026).

- **Fenster DKR2** (`fahrplan-3-docker-umbau.md`) hat die zweite Option
  bereits gebaut: ein eigener Sync-Container schreibt `data/*.json`
  atomar in ein Volume, das sich der Frontend-Container teilt — kein
  Netzwerk-Push nötig, weil beide Container auf demselben Host laufen.
  Stand 17.08.2026: Code + lokale Verdrahtung stehen, sind gegen
  Fake-/leere Werte und Abbruch-Szenarien geprüft. Das Sync-Image wird
  bereits automatisch nach GHCR gebaut und gepusht
  (`ghcr.io/stuhlsen/training-dashboard-sync`, `.github/workflows/
  publish-images.yml`, Job `sync`).

- **Was tatsächlich noch fehlt**, ist ausschließlich der Sprung von
  „lokal geprüft" zu „läuft produktiv auf apps01", plus zwei Punkte, die
  DKR2 selbst bereits als offen benennt:
  - ein echter Sync-Lauf mit echten Daten in Produktion
  - `sync-data.yml` (GitHub Actions) abschalten, **nicht löschen**
  - DKR2 Punkt 5 (`data/*.json` aus der Versionierung nehmen) — war an
    die Bedingung geknüpft, dass die GitHub-Pages-Seite nicht mehr davon
    lebt. Diese Bedingung ist mit #30 bereits erfüllt, der Schritt ist
    also nicht mehr blockiert.

- **`offene-punkte.md` nennt zusätzlich einen anderen Lösungsweg:** eigene
  Supabase-Tabelle + RLS für die Lesedaten, Sync schreibt über die API
  statt über eine JSON-Datei, Frontend fragt wie die übrigen
  Supabase-Daten ab. Das würde #31 ebenfalls lösen, ist aber ein deutlich
  größerer Eingriff (neue Migration, neue RLS-Politik, Frontend-Lesepfad
  in `app/src/api/pipeline.ts` umbauen) für dasselbe Ergebnis, das DKR2
  mit bereits vorhandenem, bereits lokal geprüftem Code erreicht.

## Vorschlag (noch nicht mit Tony abgestimmt)

**Der Supabase-Tabellen-Weg wird nicht weiterverfolgt** — nicht weil er
falsch wäre, sondern weil DKR2 dasselbe Ziel (kein Commit+Poll-Umweg mehr,
kein Staleness-Fenster) ohne neues Schema, ohne neue RLS-Fläche und ohne
Frontend-Umbau erreicht. Der `offene-punkte.md`-Eintrag wird in Fenster D
entsprechend als „durch DKR2 abgedeckt" markiert statt als eigener
Architektur-Schritt offen zu bleiben.

**Tonys Frage wird mit „ganzer Sync-Job läuft künftig auf apps01"
beantwortet** — das ist keine neue Entscheidung, sondern die Bestätigung
des in DKR2 bereits gebauten Wegs. Diese Antwort geht erst nach Alex'
ausdrücklicher Freigabe als Issue-Kommentar raus (Fenster A) — ein
öffentlicher GitHub-Kommentar ist eine sichtbare Aktion gegenüber einer
externen Person, kein Schritt, der automatisch aus diesem Dokument folgt.

## Fensterübersicht

```
Fenster A   Rücksprache mit Tony                    ✅ abgeschlossen (23.08.2026)
Fenster B   Produktivrollout DKR2 auf apps01        ✅ abgeschlossen (30.08.2026, Tony)
Fenster C   GitHub-Actions-Sync abschalten +        ✅ abgeschlossen (30.08.2026, Commit 916b98e)
            data/*.json aus der Versionierung
Fenster D   Doku-Abschluss + Issue #31 schließen    ✅ abgeschlossen (30.08.2026)
```

---

## Fenster A — Rücksprache mit Tony

**Ziel:** Tonys offene Frage aus #31 ist beantwortet, Tony hat zugesagt,
das bereits von uns gebaute Sync-Image (`ghcr.io/stuhlsen/
training-dashboard-sync`) auf apps01 als Quadlet-Unit einzubinden — nach
demselben Muster wie das Frontend-Image (DKR4).
**Vorbedingung:** keine.
**Modell:** `[SO]`

1. Entwurf für den Issue-Kommentar an Tony (Inhalt: Empfehlung „ganzer
   Sync-Job auf apps01", Verweis auf das bereits existierende Sync-Image,
   Bitte um Quadlet-Einbindung analog zum Frontend, Volume-Kopplung an
   den Frontend-Container für `data/*.json`).
2. Freigabe durch Alex, dann Kommentar posten.
3. Tonys Antwort/Zusage abwarten — insbesondere: welches Volume-Layout
   auf seiner Seite, ob er den bestehenden 6h-Zyklus übernimmt oder einen
   eigenen setzt (Umgebungsvariable, s. DKR2 Punkt 2).

### Abnahme

- [x] Kommentar an Tony gepostet (mit Alex' Freigabe)
- [x] Tonys Zusage zu Weg + Volume-Layout liegt vor — 23.08.2026: Tony
      bestätigt, kein neues Volume-Layout nötig. Bestehender Host-Ordner
      wird weiterverwendet (Frontend-Container mountet ihn bereits
      read-only unter `.../data:/usr/share/nginx/html/data:ro`, das ist
      derselbe Ordner, in den aktuell der Timer schreibt). Der Sync-Container
      bekommt denselben Host-Ordner read-write gemountet, an seinem eigenen
      `/sync/data` (passend zu `WORKDIR /sync`) — nur der Schreiber wechselt,
      Pfad bleibt gleich. `SYNC_INTERVAL_HOURS=6` (Default) bleibt, kein
      Override nötig. Da der Entrypoint intern loopt, wird daraus auf
      Tonys Seite ein simpler dauerlaufender Container statt des bisherigen
      Timer+One-Shot-Setups — letzteres wird beim Go-Live abgeschaltet.
      Zielzeitraum laut Tony: „coming week", nicht sofort.

---

## Fenster B — Produktivrollout DKR2 auf apps01

**Ziel:** Der Sync-Container läuft produktiv auf apps01, schreibt
`data/*.json` in das mit dem Frontend geteilte Volume, das Frontend zeigt
diese Daten an.
**Vorbedingung:** Fenster A abgeschlossen (Tonys Zusage + Quadlet-Unit
eingerichtet).
**Modell:** `[SO]`

**Stand 2026-08-30 — abgeschlossen.** Tony hat den Sync-Container auf apps01
deployt und verifiziert (Issue #31, Kommentar vom 30.08.2026):

- Erster echter Produktionslauf sauber durchgelaufen (`0 Fehler`), beide
  Athleten (1 + 2) geschrieben, FTP-Historie + `plan_cards` laden über die
  self-hosted PostgREST-Instanz.
- Alter fetch-timer vollständig abgebaut (Unit-Files entfernt,
  `fetch-data.sh` gelöscht); die Live-Seite liefert nachweislich die frische
  Sync-Ausgabe.
- Container publiziert keine eigenen Ports; übersteht Host-Neustart (Teil
  desselben Pod-Service wie die übrigen Container).
- **`WEATHER_LAT/LON_4` + `SUPABASE_ATHLETE4_*` bewusst weggelassen** — für
  Issue #31 nicht nötig. Athlet 4 ist im Code (`v1.9.1`) vollständig
  gebaut und braucht nur diese Werte; eigener Follow-up, sobald so weit.
  Athlet 3 hat noch keinen Sync-Codepfad (erwartet, s.
  `fahrplan-4-athlet-3.md`).

Offen bei Alex: der eine Beobachtungszyklus vor Fenster C (s. dort).

1. Tony richtet die Sync-Quadlet-Unit ein (sein Teil, analog zum
   Frontend-Deployment aus DKR4) — Zeitsteuerung im Container (6h,
   Umgebungsvariable, s. DKR2 Punkt 2), gemeinsames Volume mit dem
   Frontend-Container.
2. Secrets auf apps01 hinterlegt: dieselbe Liste wie in
   `sync-data.yml`/`.env.example` (`NOTION_API_KEY`,
   `NOTION_DATABASE_ID`, `INTERVALS_API_KEY(_2)`,
   `INTERVALS_ATHLETE_ID(_2)`, `WEATHER_LAT/LON(_2)`, plus die vier
   `SUPABASE_*`-Sync-Secrets für den `plan_cards`/`ftp_history`-Rücklesepfad,
   s. AGENTS.md „Datenquellen-Mix") — **nie im Repo, nie im Issue/Kommentar,
   nur direkt auf apps01**.
3. Erster echter Sync-Lauf gegen die produktive Datenbank/APIs (das war
   in DKR2 selbst schon als offen benannt).
4. `interval-blocks.json`-Cache mit ins Volume (DKR2 Punkt 4), damit ein
   Neustart nicht 150+ API-Abrufe erzwingt.
5. Verifikation: Frontend auf `https://training-dashboard.clear-solutions-it.com`
   zeigt aktuelle Daten (Datum/Fahrtenzahl gegenprüfen, wie beim
   22.08.-Live-Check in `docs/offene-punkte.md`).

### Abnahme

- [x] Sync läuft produktiv im Container auf apps01 (Tony, 30.08.2026)
- [x] Frontend zeigt Daten aus dem Volume, nicht mehr aus dem alten
      Tarball-Poll (fetch-timer abgebaut)
- [x] Ein echter Sync-Lauf mit echten Daten erfolgreich durchgelaufen
      (`0 Fehler`, Athlet 1 + 2)
- [x] Abgebrochener Lauf lässt alte Dateien intakt — dieselbe Image-/
      Schreiblogik wie lokal in DKR2 getestet; in Prod nicht separat
      abgebrochen

---

## Fenster C — GitHub-Actions-Sync abschalten + Versionierung bereinigen

**Ziel:** `data/*.json` wird nicht mehr über GitHub Actions committet,
Doppelquelle beseitigt.
**Vorbedingung:** Fenster B abgeschlossen und mindestens einen vollen
6h-Zyklus stabil produktiv verifiziert (nicht am selben Tag wie B
abschließen — ein Zyklus Beobachtung dazwischen).
**Modell:** `[SO]`

1. `sync-data.yml` **deaktivieren, nicht löschen** (Rückfahrkarte, wie in
   DKR2 Punkt 5/Abnahme vorgesehen) — z. B. Trigger auf
   `workflow_dispatch` allein reduzieren.
2. `data/*.json` aus der Versionierung nehmen (`.gitignore`, aus dem Repo
   entfernen) — DKR2 Punkt 5, die frühere Bedingung „nur falls Pages-Seite
   entfällt" ist mit #30 bereits erfüllt.
3. Prüfen, ob `SYNC_PUSH_TOKEN` (Branch-Protection-Workaround, s.
   Kopfkommentar `sync-data.yml`) danach noch für etwas anderes gebraucht
   wird, sonst als totes Secret markieren (nicht löschen ohne Rücksprache
   — Secrets fallen unter „Grenzen" in CLAUDE.md).

### Abnahme

- [x] `sync-data.yml` deaktiviert (`workflow_dispatch` allein), Datei bleibt im Repo (Commit `916b98e`)
- [x] `data/*.json` nicht mehr versioniert, `.gitignore` ergänzt + `git rm --cached` (Commit `916b98e`)
- [x] Ein Beobachtungszyklus (mind. 6h) ohne Datenausfall bestätigt — Live-Seite `training-dashboard.clear-solutions-it.com` zeigt frische Sync-Ausgabe

---

## Fenster D — Doku-Abschluss

**Ziel:** Dokumentation spiegelt den neuen Zustand, Issue #31 ist zu.
**Vorbedingung:** Fenster C abgeschlossen.
**Modell:** `[SO]`

1. `docs/offene-punkte.md`, Abschnitt „Sync-Pipeline": Eintrag zu
   Lesedaten/Supabase-Tabelle aktualisieren — als „durch DKR2-Produktivrollout
   abgedeckt, Tabellen-Weg bewusst nicht umgesetzt" markieren statt offen
   zu lassen.
2. `AGENTS.md`, Abschnitt „Datenquellen-Mix (lesen/schreiben)": den
   Hinweis auf GitHub Actions als Sync-Ausführungsort auf apps01-Container
   aktualisieren.
3. `fahrplan-3-docker-umbau.md`, Fenster DKR2: Abnahme-Checkliste
   vervollständigen, Verweis auf dieses Dokument als Nachtrag ergänzen.
4. Issue #31 auf GitHub schließen (mit kurzem Abschlusskommentar, was
   umgesetzt wurde).

### Abnahme

- [x] `offene-punkte.md` aktualisiert (Sync-Pipeline-Eintrag als „durch DKR2 abgedeckt" markiert)
- [x] `AGENTS.md` aktualisiert (Datenquellen-Mix: apps01-Container; `SYNC_PUSH_TOKEN` als schlafend vermerkt)
- [x] `fahrplan-3-docker-umbau.md` DKR2 verweist auf dieses Dokument (Abnahme-Checkliste vervollständigt)
- [x] Issue #31 geschlossen (30.08.2026, `reason: completed`)
