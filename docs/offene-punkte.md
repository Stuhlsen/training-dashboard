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
