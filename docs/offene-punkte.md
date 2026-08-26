# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte. **Nur der
> Punkt selbst + wo er lebt** — Details stehen im jeweiligen Konzeptdokument
> oder in der Commit-Historie, nicht hier. **Erledigte Punkte werden
> entfernt, nicht archiviert** — das übernimmt `git log`. Reihenfolge =
> Priorität, nicht Chronologie.

## Planungstab / Progressionssteuerung

- **`ladder_progression_enabled` jetzt Self-Service statt SQL-Freigabe**
  (26.08.2026) — Migration `0018_ladder_progression_self_service.sql`
  erlaubt Athleten das Schreiben ihrer eigenen Spalte, Schalter
  "Stufenvorschlag (Auto-Progression)" in `ProfileSection.tsx`. Migration
  0018 noch NICHT eingespielt (weder dev noch prod) — vor dem nächsten
  Docker-Check tun, dann Schalter einmal live gegen dashboard-dev
  ausprobieren. Datenreife pro Athlet (Grund für die ursprüngliche Sperre,
  0016) bleibt unverändert unklar — jetzt aber bewusst athletenseitig
  entschieden statt zentral. → `docs/konzept-progressionssteuerung.md` C3/C4.
- **Drag & Drop v1** (geprüft 26.08.2026, drei separate Punkte):
  - Kein Tastatur-Verschieben per Drag-Geste — Ersatzweg existiert bereits
    (Karte öffnen → `PlanCardForm.tsx`-Datumsfeld → Speichern, voll
    tastaturbedienbar), nur langsamer als Ziehen. Kein akuter A11y-Ausfall.
  - Keine Umsortierung innerhalb eines Tages — `sortOrder` existiert als
    Feld (`nextSortOrder()`, `app/src/api/plan-cards/patch.ts`), wird aber
    nur bei Karten-Erstellung gesetzt, nie danach geändert. Echtes neues
    Feature (Bedienelement + Schreibpfad), noch nicht gebaut.
  - Karte behält altes `week`/`phase`-Label, wenn die Zielwoche komplett
    leer ist (`app/src/core/plan-drag.js::weekLabelForDate()`) — bewusste
    v1-Grenze, kein Bug: es gibt keine von Karten unabhängige Quelle für
    "welche Plan-Woche/Phase ist Kalenderwoche X", nur das Abschauen von
    Nachbarkarten. Nur lösbar mit einer echten Kalenderwoche→Plan-Phase-
    Zuordnung unabhängig von `plan_cards` — größerer Umbau, kein Fix
    nebenbei.
- **Kein Streams-Pipeline für den Planungstab-Detail-Chart** — der reiche
  Leistungs-/Puls-Verlauf (Rauschen, HR-Linie) aus dem Redesign-Mockup
  braucht Rohdaten (Sekunden-Samples), die nirgends in der Pipeline
  existieren. Etappe 13e liefert stattdessen einen vereinfachten
  Stufenchart aus `core/compliance-match.js`-Intervallen (kein HR — kein
  Feld dafür in `RideCompliance`). → `app/src/features/planning/
  DoneDetailChart.tsx`.
  Grobe Skizze für später (26.08.2026, noch nicht begonnen, eigenes
  Vorhaben): Abruf NICHT über die Sync-Pipeline/`data/rides.json` (zu groß
  auf Vorrat für alle Fahrten), sondern client-seitig on-demand beim
  Aufklappen einer Karte — über denselben intervals.icu-API-Key, der schon
  für den Wahoo-Push in `localStorage` liegt, nur im Speicher gehalten,
  nicht persistiert. Größte offene Unbekannte: ob/wie intervals.icu einen
  Streams-Endpunkt (`/activity/{id}/streams` o.ä.) pro API-Key freigibt —
  das müsste zuerst einmalig live verifiziert werden, analog zum
  M3-external_id-Nachweis oben.

## Sync-Pipeline (`scripts/`)

- **K3-Typ-Defaults nicht auf Basis der FTP-Historie neu abgeleitet** —
  braucht mindestens einen echten Ramp-Test-Eintrag pro Athlet in
  `ftp_history` (aktuell leer). `app/src/sports/cycling/session-types.ts`.

- **Lesedaten (`rides.json`/`adjustments*.json`) noch als statische Dateien,
  nicht in Supabase** — Sofort-Fix aus Tonys Diagnose (22.08.2026,
  Sync-Container ohne Zugangsdaten) ist umgesetzt und bestätigt: Live-Check
  gegen `clear-solutions-it.com` am 22.08.2026 (Playwright, `fetch()` im
  echten Browser) zeigt `rides.json` aktuell — `updated` 22.08.2026 18:15 UTC,
  95 Fahrten bis 22.08. Langfristig sauberer bleibt trotzdem: eigene Tabelle + RLS für diese Daten,
  Sync schreibt via API statt JSON-Datei, Frontend fragt wie die übrigen
  Supabase-Daten ab — würde den ganzen Datei-Umweg entfallen lassen. Größere
  Architektur-Entscheidung, nicht nebenbei. → Datenquellen-Mix in `AGENTS.md`.

## Explorer / Charts

- **Alle Chart-Komponenten rechnen indexbasiert** (`makeIndexScale`), nicht
  als kontinuierliche Zeitachse — bei Athlet 2 (dünne Datenlage) würden
  Datenlücken sonst sichtbar. Bewusster Nicht-Zielpunkt, Voraussetzung für
  Cursor-Sync über den Explorer hinaus. `app/src/core/chart-scale.js`.
- **Vergleichsmodus vergleicht nur CTL**, nicht ATL/TSB — bewusste
  Scope-Begrenzung. `app/src/charts/CompareChart.tsx`.
- **`compareSlots` ein Einzelwert, keine Liste** — additiv statt Umbau,
  bewusste Entscheidung. `app/src/api/hooks/useExplorerCompare.ts`.

## Sonstiges

- **`sport`-Spalte bewusst noch nicht in der Datenbank** — additiv
  nachrüstbar, sobald eine zweite Sportart echte Daten hat (Fahrplan 4).
  Bis dahin sind `plan_cards`/`events`/`proposals` implizit Radsport.
