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
- **Fehlende ride↔activityId-Brücke** — `scripts/lib/compliance.js`
  korreliert nur transient über Array-Index, Activity-ID landet nie auf dem
  `ride`-Objekt. Blockiert retroaktive Segment-Auswertung für bereits
  synchronisierte Fahrten.
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

## Sync-Pipeline (`scripts/`)

- **HRV/Ruhepuls: 6 von 25 Tagen weichen zwischen `ride.hrv` und dem
  Wellness-Wert ab** (Athlet 1, Übergangsfenster Plan1→Plan2) — vermutlich
  ein Snapshot von vor der `wellnessFields()`-Konsolidierung, nicht
  abschließend reproduzierbar bestätigt. Nächster Schritt: nach einem
  echten Sync-Lauf `data/rides.json` für die betroffenen Tage gegenprüfen.
- **K3-Typ-Defaults nicht auf Basis der FTP-Historie neu abgeleitet** —
  braucht mindestens einen echten Ramp-Test-Eintrag pro Athlet in
  `ftp_history` (aktuell leer). `app/src/sports/cycling/session-types.ts`.

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
- **`config.json`-Bootstrap läuft ungated auch auf GitHub Pages/Vite-Dev**
  — nur in Docker liefert er etwas, auf Pages ein zusätzlicher blockierender
  Same-Origin-404-Request pro Seitenaufruf. Ungemessen, kein spürbarer
  Effekt erwartet. `app/index.html`.
- **`sport`-Spalte bewusst noch nicht in der Datenbank** — additiv
  nachrüstbar, sobald eine zweite Sportart echte Daten hat (Fahrplan 4).
  Bis dahin sind `plan_cards`/`events`/`proposals` implizit Radsport.
