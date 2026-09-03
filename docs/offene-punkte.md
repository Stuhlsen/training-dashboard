# Offene Punkte / bekannte Lücken

> Zentrale Sammelstelle für phasenübergreifende offene Punkte. **Nur der
> Punkt selbst + wo er lebt** — Details stehen im jeweiligen Konzeptdokument
> oder in der Commit-Historie, nicht hier. **Erledigte Punkte werden
> entfernt, nicht archiviert** — das übernimmt `git log`. Reihenfolge =
> Priorität, nicht Chronologie.

## Planungstab / Progressionssteuerung

- **„Plan verschieben…" (Migration 0026) — vier bewusst offen gelassene
  Restkanten** (6-Punkte-Liste Punkt 1, 03.09.2026), alle für den einen
  Einsteiger-Athleten zurückgestellt:
  - Nur Verschiebung nach hinten (positives N) — rückwärts kollidieren die
    festen Wochentags-Slots.
  - Sync-Baseline ↔ `plan_cards` divergieren an den Rändern → „Phantom-
    Geplant/verpasst" für wenige Einträge. Fix: `plan_offset_anchor_date`
    speichern + Karten-Ausfall-Status in die Vorlage (`shiftPlannedSessions4`)
    spiegeln.
  - Teil-Fehlschlag beim Massen-Shift lässt den Offset stehen; atomar nur
    per Supabase-RPC.
  - Einzel-Drag im ersten Render-Fenster schreibt evtl. ein Phasen-Label aus
    dem noch unverschobenen Modell (`useAthletePlanOffset` liefert bis zur
    ersten Antwort `0`).

- **Kein Tastatur-Verschieben per Drag-Geste** — Ersatzweg (Karte öffnen →
  `PlanCardForm.tsx`-Datumsfeld) ist voll tastaturbedienbar, nur langsamer.
  Kein akuter A11y-Ausfall.

- **Kein Self-Service für einen neuen Trainingsplan** — Pläne sind Code
  (`scripts/lib/plan2.js` / `plan-athlete2.js` / `plan-athlete4.js`); nach
  Plan-Ende kann ein Athlet keinen neuen anlegen. Bevorzugter Weg: Plan-
  Vorlagen-System (parametrisierte Generatoren + Auswahl-Tabelle + „Neuer
  Plan"-Flow), eigener Fahrplan. Zwischenlösung: neuer Vorlagen-Block für
  Athlet 2 direkt im Code. Verworfen: voller Plan-Baukasten in der UI
  (Wochen/Einheiten einzeln, keine Baseline) — verliert die Periodisierungs-
  Logik der Code-Pläne. (6-Punkte-Liste Punkt 2, 03.09.2026.)

## Sync-Pipeline (`scripts/`)

- **K3-Typ-Defaults nicht aus der FTP-Historie neu abgeleitet** — braucht je
  Athlet einen echten Ramp-Test-Eintrag in `ftp_history` (aktuell leer).
  `app/src/sports/cycling/session-types.ts`.

## Explorer / Charts

- **Charts rechnen indexbasiert**, nicht als kontinuierliche Zeitachse —
  bewusst (sonst sichtbare Datenlücken bei Athlet 2), aber Voraussetzung für
  Cursor-Sync über den Explorer hinaus. `app/src/core/chart-scale.js`.
- **Vergleichsmodus nur CTL**, nicht ATL/TSB — bewusste Scope-Begrenzung.
  `app/src/charts/CompareChart.tsx`.
- **`compareSlots` ein Einzelwert, keine Liste** — additiv statt Umbau.
  `app/src/api/hooks/useExplorerCompare.ts`.

## Settings

- **Zwei-Faktor-Login nicht scharf** — TOTP wird eingerichtet
  (`TwoFactorSection.tsx`), aber beim Login nicht abgefragt (kein AAL-Check
  in `LoginPage.tsx` / `ProtectedRoute.tsx` / `AuthContext.tsx`). Bewusst
  zurückgestellt (Aussperr-Risiko).
- **„Aktive Sitzungen" ist Platzhalter** — bräuchte die Supabase Admin-API
  (service_role), die nie im Client laufen darf. `SessionsSection.tsx`.
- **E-Mail-Benachrichtigungen sind Platzhalter** — keine
  Mail-Infrastruktur im Projekt. `NotificationsSection.tsx`.
- **Trainer-Verknüpfung nur read-only** — Self-Service bräuchte einen
  Einladungs-/Bestätigungsablauf (Coach muss zustimmen).
  `CoachLinkSection.tsx`.

## Sonstiges

- **`sport`-Spalte noch nicht in der DB** — additiv nachrüstbar, sobald eine
  zweite Sportart echte Daten hat (Fahrplan 4); `plan_cards` / `events` /
  `proposals` sind bis dahin implizit Radsport.
