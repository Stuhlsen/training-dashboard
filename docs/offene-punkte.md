# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte. **Nur der
> Punkt selbst + wo er lebt** — Details stehen im jeweiligen Konzeptdokument
> oder in der Commit-Historie, nicht hier. **Erledigte Punkte werden
> entfernt, nicht archiviert** — das übernimmt `git log`. Reihenfolge =
> Priorität, nicht Chronologie.

## Planungstab / Progressionssteuerung

- **`profiles.ladder_progression_enabled` für keinen Athleten gesetzt** —
  Stufenvorschlag ist fertig gebaut und getestet
  (`app/src/core/ladder-progression.js::presetAction()`), aber nirgends live
  scharf. Reine Freigabe-Entscheidung, kein Code. →
  `docs/konzept-progressionssteuerung.md` C3/C4.
- **`CONFLICT_THRESHOLDS.eventTaperDays: 7`** (`app/src/core/plan-config.js`)
  — eigene Annahme, nie extern (sportwissenschaftlich) bestätigt.
- **M3 — `external_id`-Upsert nie live gegen intervals.icu verifiziert** —
  kein Sandbox-Account, ein Push würde den echten Trainingskalender
  treffen. Nicht ohne Rücksprache ausführen. `app/src/api/intervals/push.ts`.
- **Drag & Drop v1**: kein Tastatur-Verschieben, keine Umsortierung
  innerhalb eines Tages, Karte behält altes `week`-Label bei leerem
  Wochenblock. → §4/§7 im Konzept.
- **K-RAMPE/K-WOCHENTSS nie einzeln verifiziert**, ob 0 Treffer an echter
  Ruhe oder an zu konservativen Schwellen liegt (K-TID ist geprüft: echter
  Nulltreffer). `app/src/core/conflicts.js`.
- **Kein Streams-Pipeline für den Planungstab-Detail-Chart** — der reiche
  Leistungs-/Puls-Verlauf (Rauschen, HR-Linie) aus dem Redesign-Mockup
  braucht Rohdaten (Sekunden-Samples), die nirgends in der Pipeline
  existieren. Etappe 13e liefert stattdessen einen vereinfachten
  Stufenchart aus `core/compliance-match.js`-Intervallen (kein HR — kein
  Feld dafür in `RideCompliance`). → `app/src/features/planning/
  DoneDetailChart.tsx`.

## Sync-Pipeline (`scripts/`)

- **HRV/Ruhepuls: 6 von 25 Tagen weichen zwischen `ride.hrv` und dem
  Wellness-Wert ab** (Athlet 1, Übergangsfenster Plan1→Plan2) — vermutlich
  ein Snapshot von vor der `wellnessFields()`-Konsolidierung, nicht
  abschließend reproduzierbar bestätigt. Nächster Schritt: nach einem
  echten Sync-Lauf `data/rides.json` für die betroffenen Tage gegenprüfen.
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

- **Schlafscore fließt nicht in Governor/UI** — kalibrierungssensibler
  Eingriff in bereits getestete Schwellenwerte, bewusst zurückgestellt.
  `app/src/core/readiness.js`/`app/src/core/export-briefing.js`.
- **`sport`-Spalte bewusst noch nicht in der Datenbank** — additiv
  nachrüstbar, sobald eine zweite Sportart echte Daten hat (Fahrplan 4).
  Bis dahin sind `plan_cards`/`events`/`proposals` implizit Radsport.
