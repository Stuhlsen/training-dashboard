# docs/ — Wegweiser

Diese Übersicht zeigt, was in `docs/` liegt, was jedes Dokument enthält und
wann man es liest. Ein Absatz je lebendem Dokument, sortiert nach Themen.

## Repo-weite Konventionen

**`../AGENTS.md`** (Repo-Root, nicht hier in `docs/`) — die zentrale
Referenz für Architektur, Befehle, Commit-Konvention, Datenschutzregeln und
bekannte Eigenheiten. Bei jeder Aufgabe zuerst hier nachsehen.

## Laufender Fahrplan (aktuelle Umbauten)

- **`fahrplan-0-uebersicht.md`** — Einstiegsdokument für die laufende
  Aufräum-/Umbaurunde nach Fertigstellung von Dashboard 3.0: Zielbild,
  Entscheidungen, Reihenfolge der vier Fahrpläne. Keine Schrittdetails.
- **`fahrplan-1-vanilla-entfernen.md`** — Entfernung des alten Vanilla-JS-Zweigs
  (`assets/js/`) aus `main`. **Abgeschlossen.**
- **`fahrplan-2-doku-aufraeumen.md`** — dieser Aufräumdurchgang selbst: Docs
  einordnen (dieses Dokument ist ein Ergebnis davon), `.gitignore`/`.env.example`,
  später ein Betriebs-Runbook. **DOK1/DOK2 abgeschlossen; DOK3 (Runbook) offen bis DKR6.**
- **`fahrplan-3-docker-umbau.md`** — Ablösung der Supabase-Cloud durch einen
  selbst gehosteten Docker-Verbund. **DKR0–DKR4 abgeschlossen, Frontend live
  auf apps01; DKR5 (Backup/Restore-Probe) + DKR6 (Cutover) offen.**
- **`fahrplan-4-athlet-3.md`** — dritter Athlet und Multi-Sport-Ausbau.
  **Noch nicht begonnen** (Athlet 4 „bentastiic" ist angebunden, aber als
  Radsport-Einsteiger, nicht als der geplante Triathlet `athlete3`; die
  `sport`-Normalisierung aus ATH1 steht noch aus).

Vor dem Start einer Aufgabe in diesem Themenbereich das jeweilige
Fahrplan-Fenster lesen (Ziel, Vorbedingung, Abnahme) statt nur den Titel.

## Anleitungen

- **`docker-lokal-einrichten.md`** — lokaler Docker-Container
  (`docker-compose.dev.yml`, `http://localhost:8080`) für den finalen
  Produktions-Build-Check vor jedem Commit-Vorschlag (s. „Arbeitsweise" in
  `../CLAUDE.md`).
- **`docker-server-einrichten.md`** — Betrieb auf dem Produktivserver
  (Fahrplan 3, Docker-Umbau/Self-Hosting).
- **`handoff-sync-apps01.md`** — Übergabe an Tony: was er auf apps01 für den
  Sync-Container umzusetzen hat (Quadlet-Unit, Volume, Env-Datei), Issue #31.
  Umsetzung von `fahrplan-3-sync-produktivbetrieb.md` Fenster B.

## Weitere laufende Fahrpläne (eigenständig, nicht Teil der vier oben)

- **`fahrplan-5-planungstab-redesign.md`** — Umbau des Planungstabs
  (Mo–So-Raster statt Karten-Liste, Soll/Ist-Tabelle statt Karten-Liste)
  nach dem „Planungstab Live"-Mockup aus Claude Design. Etappen 13a–13i.
  **Abgeschlossen.**
- **`fahrplan-6-ruhetag-planwochen-modell.md`** — Ruhetage als abgeleitetes
  Plan-Wochen-Modell statt gespeicherter `plan_cards`-Zeilen. Fenster RUH0–RUH7.
  **Abgeschlossen.**
- **`fahrplan-3-sync-produktivbetrieb.md`** — bricht den Sync-Produktivrollout
  aus `fahrplan-3-docker-umbau.md` Fenster DKR2 in eigene Fenster herunter
  (Issue #31): Sync-Job zieht von GitHub Actions auf den apps01-Container.
  **Abgeschlossen (Issue #31 geschlossen, 30.08.2026).**
- **`fahrplan-7-sync-credentials-self-service.md`** — Sync-Zugangsdaten +
  Standort wandern in die RLS-Tabelle `athlete_sync_config`, die jeder Athlet
  in Settings selbst füllt; die Env des Sync-Containers schrumpft auf
  `SUPABASE_URL` + Service-Role-Key. Fenster CRED0–CRED6. **CRED0–CRED4
  umgesetzt (Stand 31.08.2026), CRED5 (Tony) + CRED6 (Doku-Haken) offen.**

## Laufende Konzepte

- **`dashboard-3.0-konzept-react-umbau.md`** — Gesamtkonzept + Etappenplan des
  React-Neubaus unter `/app/`. Sehr groß, gewachsen über den gesamten Umbau;
  zeigt pro Etappe Entscheidung, Ergebnis und offene Punkte. Bei Fragen "warum
  ist das so gebaut" in `app/src/**` meist die erste Anlaufstelle nach den
  modul-lokalen READMEs.
- **`konzept-progressionssteuerung.md`** — wie der Claude-Trainer-Export
  Trainingsplan-Anpassungen (Formatkatalog, Ruhetage-als-Karten, Wirkungsanzeige)
  vorschlägt und validiert. Bezug zu `core/plan-config.js`, `core/projection.js`,
  `core/export-briefing.js` (Pfade im Dokument selbst noch mit Vanilla-Präfix,
  gemeint ist die jeweils portierte Datei unter `app/src/core/`).
- **`phase-4-prompt-vorlage-claude-trainer.md`** — die wörtliche Prompt-Vorlage
  für den Claude-Trainer-Export. **Nicht verschieben oder umbenennen** — ein
  Konsistenztest (`app/src/core/export-briefing-consistency.test.js`) prüft
  `PROMPT_TEMPLATE` byteweise gegen den Inhalt dieser Datei.
- **`phase-6-konzept-besucher-feedback.md`** — Konzept für anonymes
  Besucher-Feedback (einziger Schreibzugriff ohne Login), Moderation über
  `is_admin`.
- **`phase-6-konzept-sichtbarkeit.md`** — verbindliche Matrix, welcher Datentyp
  öffentlich sichtbar ist und welcher Login/Rolle braucht.

## Zentrale Sammelstelle

- **`offene-punkte.md`** — laufend gepflegte Liste offener/bekannter Punkte
  über alle Bereiche (Verifikationen, bewusst zurückgestellte Entscheidungen,
  bekannte Lücken). Vor größeren Änderungen kurz gegenprüfen, ob der Bereich
  dort schon einen offenen Punkt hat.

## Archiv

**`archiv/`** — abgeschlossene Phasen-Konzepte, überholte Fahrpläne und
Vanilla-Ära-Grundlagendokumente. Jede Datei trägt einen Archiv-Hinweis am
Kopf. **Nichts darin gilt noch für den aktuellen Code** — nützlich nur als
historischer Kontext (warum wurde etwas so entschieden), nicht als
Anleitung für neue Arbeit. Bei Unsicherheit: aktueller Code + `AGENTS.md` +
die modul-lokalen READMEs unter `app/src/**` sind immer die Quelle der
Wahrheit, nicht das Archiv.
