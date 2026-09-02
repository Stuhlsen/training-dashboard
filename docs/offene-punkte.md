# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte. **Nur der
> Punkt selbst + wo er lebt** — Details stehen im jeweiligen Konzeptdokument
> oder in der Commit-Historie, nicht hier. **Erledigte Punkte werden
> entfernt, nicht archiviert** — das übernimmt `git log`. Reihenfolge =
> Priorität, nicht Chronologie.

## Planungstab / Progressionssteuerung

- **Ziel-Overlay im Done-Detail-Chart ist ein flaches Band** — der
  Intervall-Zweig von `DoneDetailChart.tsx` legt die Ziel-Watt-Spanne
  (`targetBandFromCompliance()`, min–max über `compliance.matched`) als
  waagerechtes Band hinter die echte Sekunden-Watt-Kurve. Die genauere
  gestufte, zeit-ausgerichtete Ziel-Linie (Warmup niedrig → Intervall hoch →
  Pause niedrig …) braucht die Intervall-Startzeiten (`startSec`), die
  `app/src/core/compliance-match.js` intern kennt, aber nicht über
  `ComplianceInterval` (`app/src/types.js`) und die Sync-Pipeline nach außen
  gibt — größerer Umbau, bewusst zurückgestellt.

- **Drag & Drop v1** (geprüft 26.08.2026, zwei separate Punkte):
  - Kein Tastatur-Verschieben per Drag-Geste — Ersatzweg existiert bereits
    (Karte öffnen → `PlanCardForm.tsx`-Datumsfeld → Speichern, voll
    tastaturbedienbar), nur langsamer als Ziehen. Kein akuter A11y-Ausfall.
  - Keine Umsortierung innerhalb eines Tages — `sortOrder` existiert als
    Feld (`nextSortOrder()`, `app/src/api/plan-cards/patch.ts`), wird aber
    nur bei Karten-Erstellung gesetzt, nie danach geändert. Echtes neues
    Feature (Bedienelement + Schreibpfad), noch nicht gebaut.

- **Kein Self-Service zum Erstellen eines neuen Trainingsplans** — jeder Plan
  ist Code: `scripts/lib/plan2.js` (Athlet 1, Plan 2), `scripts/lib/plan-athlete2.js`
  (Athlet 2, GFNY Bremen 2026), `scripts/lib/plan-athlete4.js` (Athlet 4,
  Einsteigervorlage). Es gibt keinen Weg für einen Athleten, nach Abschluss
  eines Plans (Athlet 2 nach GFNY, 30.08.2026) einen neuen anzulegen. Der
  Planungstab kann bestehende `plan_cards` verschieben/ausfallen lassen/pushen
  und (sobald gebaut) mit „Plan um X Wochen verschieben" die generierte
  Baseline verschieben, aber keine Plan-Struktur neu aufbauen.
  - **Bevorzugter Weg (zurückgestellt, eigener Fahrplan):** Plan-Vorlagen-
    System. Wenige generierte, parametrisierte Vorlagen nach dem Muster von
    `plan-athlete4.js::PLANNED_SESSIONS_ATHLETE4` (deterministisch aus
    `START_MONDAY` + `weekPlan(i)`), Parameter: Startdatum, Wochenzahl,
    Ziel-Event, Einheiten/Woche, ggf. Grund-FTP. Athlet wählt Vorlage +
    Parameter in einem neuen „Neuer Plan"-Flow → Sync erzeugt die Baseline →
    danach normal über `plan_cards` (RLS) editierbar. Braucht: eine Tabelle
    für die Vorlagen-Auswahl je Athlet (analog `athlete_sync_config`), einen
    Vorlagen-Generator in `scripts/lib/` je Vorlagentyp,
    `generate-data.js`-Verdrahtung (Baseline-Spread wie bei Athlet 4), UI im
    Settings- oder Planungstab, Migration.
  - **Verworfen:** voller Plan-Baukasten in der UI (Athlet legt Wochen/Einheiten
    einzeln als `plan_cards` an, keine Baseline). Maximal flexibel, aber
    größter Aufwand und verliert die strukturierte Aufbau-/Periodisierungs-
    Logik, die in den Code-Plänen steckt.
  - **Zwischenlösung bis dahin:** neuer Vorlagen-Block für Athlet 2 direkt im
    Code, wie die bestehenden Pläne (z.B. Post-Race-Grundlagenblock).
  - Ursprung: Anfrage Alex 03.09.2026 (6-Punkte-Liste, Punkt 2), bewusst auf
    einen eigenen Tag/Fahrplan verschoben.

## Sync-Pipeline (`scripts/`)

- **K3-Typ-Defaults nicht auf Basis der FTP-Historie neu abgeleitet** —
  braucht mindestens einen echten Ramp-Test-Eintrag pro Athlet in
  `ftp_history` (aktuell leer). `app/src/sports/cycling/session-types.ts`.

- **Lesedaten (`rides.json`/`adjustments*.json`) als statische Dateien statt
  Supabase-Tabelle — durch DKR2-Produktivrollout abgedeckt, Tabellen-Weg
  bewusst nicht umgesetzt.** Der Sync läuft seit 30.08.2026 produktiv als
  Container auf apps01 und schreibt `data/*.json` atomar in das mit dem
  Frontend geteilte Volume — kein Commit+Poll-Umweg, kein Staleness-Fenster
  mehr (Issue #31, `docs/fahrplan-3-sync-produktivbetrieb.md`, Fenster A–D).
  Die früher hier als „langfristig sauberer" notierte eigene Tabelle + RLS für
  die Lesedaten wird nicht weiterverfolgt: dasselbe Ziel ohne neues Schema,
  neue RLS-Fläche und Frontend-Umbau in `app/src/api/pipeline.ts`.
  → Datenquellen-Mix in `AGENTS.md`.

## Explorer / Charts

- **Alle Chart-Komponenten rechnen indexbasiert** (`makeIndexScale`), nicht
  als kontinuierliche Zeitachse — bei Athlet 2 (dünne Datenlage) würden
  Datenlücken sonst sichtbar. Bewusster Nicht-Zielpunkt, Voraussetzung für
  Cursor-Sync über den Explorer hinaus. `app/src/core/chart-scale.js`.
- **Vergleichsmodus vergleicht nur CTL**, nicht ATL/TSB — bewusste
  Scope-Begrenzung. `app/src/charts/CompareChart.tsx`.
- **`compareSlots` ein Einzelwert, keine Liste** — additiv statt Umbau,
  bewusste Entscheidung. `app/src/api/hooks/useExplorerCompare.ts`.

## Settings

- **Zwei-Faktor-Login noch nicht scharf geschaltet** — der TOTP-Faktor wird
  in `TwoFactorSection.tsx` echt bei Supabase eingerichtet/verwaltet, aber
  `LoginPage.tsx`/`ProtectedRoute.tsx`/`AuthContext.tsx` fragen ihn beim
  Login noch nicht ab (kein AAL-Check). Bewusste Entscheidung Alex
  (Settings-Redesign) gegen das Risiko, sich selbst auszusperren — ein
  späterer Schritt für sich.
- **"Aktive Sitzungen" ist Platzhalter** — eine Liste eigener Geräte
  bräuchte die Supabase Admin-API (service_role), die nie clientseitig
  laufen darf. `SessionsSection.tsx`.
- **Echte E-Mail-Benachrichtigungen sind Platzhalter** — es gibt im Projekt
  keine E-Mail-Versand-Infrastruktur (kein SMTP/Provider, kein
  Edge-Function-Cron außer dem 6h-Datensync). `NotificationsSection.tsx`.
- **Trainer-Verknüpfung nur read-only** — `CoachLinkSection.tsx` zeigt den
  verknüpften Trainer an, ein Self-Service-"Verknüpfen" bräuchte einen
  eigenen Einladungs-/Bestätigungsablauf (Coach muss zustimmen), noch nicht
  gebaut.

## Sonstiges

- **`sport`-Spalte bewusst noch nicht in der Datenbank** — additiv
  nachrüstbar, sobald eine zweite Sportart echte Daten hat (Fahrplan 4).
  Bis dahin sind `plan_cards`/`events`/`proposals` implizit Radsport.
