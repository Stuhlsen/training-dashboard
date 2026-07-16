# Phase 4 — Konzept: Trainer-Sicht & Trainer-Rechte [F5]

> **Ziel:** Ein Trainer sieht „seinen" Athleten vollständig und kann dessen Plan
> entweder **direkt ändern** oder Änderungen **als Vorschlag** einreichen, die der
> Athlet annimmt oder ablehnt. Grundlage: Rollenmatrix aus Phase 0, jeder Athlet hat
> genau einen eigenen Trainer (Mensch mit Account **oder** Claude ohne Account,
> via Export/Import).
>
> **Sicherheits-Grundsatz:** Alle Rechte werden in **RLS** durchgesetzt, nie nur im
> UI. Das UI blendet aus, die Datenbank verbietet.

---

## 1. Trainer-Zuordnung im Datenmodell

- `profiles.trainer_id uuid null` → referenziert das Profil des Trainers.
  *Abgleichpunkt vor Umsetzung:* prüfen, ob `0001_initial_schema.sql` die Zuordnung
  schon anders modelliert (eigene Tabelle o. ä.) — dann die bestehende Form nutzen.
- Genau **ein** Trainer pro Athlet (Fahrplan-Entscheidung). Ein Trainer kann mehrere
  Athleten betreuen (n:1 auf trainer_id).
- **Claude als Trainer hat keinen Account:** `trainer_id` bleibt dann `null`;
  Claude-Vorschläge kommen über den Import-Workflow durch den *Athleten selbst* in die
  App (Quelle-Kennzeichnung im Vorschlags-Schema, s. eigenes Konzept). Es gibt also
  keinen „Claude-User" in Supabase — kein Service-Account, kein geteilter Login.
- Trainer-Settings: nur Display-Name änderbar (bestehende Fahrplan-Entscheidung,
  bereits in `ui/settings-panel.js` angelegt für Athleten).

## 2. Was der Trainer sieht

| Datenbereich | Sichtbarkeit für den eigenen Trainer |
|---|---|
| Lesedaten (Fahrten, PMC, Wetter …) | ohnehin öffentlich — ja |
| `plan_cards`, `events`, `goals` | ja (öffentlich lesbar, E1) |
| Prognose/Konflikte (Phase 3) | ja — gleiche Ansicht wie der Athlet |
| `wellbeing` Slider-Werte | **ja, immer** — unabhängig vom öffentlichen `wellbeing_public`-Toggle (E2); ohne Befinden kann ein Trainer keine Belastung steuern |
| `wellbeing.note` (Freitext) | **T1 — Entscheidung, s. u.** |
| `proposals` des Athleten | ja (eigene + fremde Historie am Athleten) |
| Governor-Empfehlung des Tages | ja — sie ist der zentrale Coaching-Input |

Der Athleten-Toggle bleibt frei (Portfolio-Charakter) — die *Trainer-Rechte* greifen
aber nur auf dem eigenen Athleten; auf fremden Athleten ist der Trainer normaler
Besucher.

## 3. Was der Trainer darf

**Zwei Wege pro Änderung, der Trainer wählt beim Speichern:**

- **„Direkt übernehmen"** → schreibt unmittelbar in `plan_cards` (bzw. `events`).
  Für kleine, unstrittige Korrekturen (Tippfehler, TSS-Anpassung, kurzfristiger Tausch
  nach Absprache).
- **„Als Vorschlag"** → schreibt in `proposals`; der Athlet sieht den Vorschlag im
  Planungstab und nimmt an oder lehnt ab (Flow im Schema-Konzept). Für alles
  Substanzielle — Wochenumbau, neue Blöcke, Streichungen.

**Harte Grenzen (RLS-durchgesetzt):**

- Kein Zugriff auf Athleten, bei denen `trainer_id ≠ auth.uid()`.
- **Kein Wahoo-Push durch den Trainer.** Der intervals.icu-Token gehört dem Athleten;
  Push bleibt Athleten-exklusiv. Ändert der Trainer eine bereits gepushte Karte
  (`pushed_external_id` gesetzt), greift dieselbe Warn-Regel wie beim Athleten
  (CRUD-Konzept §5) — nur sieht der *Athlet* die Warnung als Handlungshinweis.
- Kein Schreiben an `profiles` des Athleten (Ziele ja via `goals`, Profil nein),
  kein Zugriff auf `wellbeing` schreibend, kein Löschen fremder `proposals`.
- `feedback`-Moderation bleibt beim `is_admin`-Flag (E3), unabhängig von der
  Trainer-Rolle.

## 4. Kennzeichnung & Nachvollziehbarkeit

- `plan_cards.updated_by uuid null` (Migration ergänzt Spalte): jede Direktänderung
  trägt den Verursacher.
- UI: Karten, die zuletzt vom Trainer geändert wurden, tragen einen dezenten Badge
  „vom Trainer geändert" im bestehenden Badge-Stil — verschwindet, sobald der Athlet
  die Karte selbst anfasst oder den Badge wegklickt (lokal quittiert, kein eigenes
  Notification-System in v1).
- Vorschläge sind durch die `proposals`-Tabelle ohnehin voll historisiert
  (wer, wann, was, angenommen/abgelehnt).

## 5. Trainer-Modus im UI

Kein separates Dashboard-Layout: Der Trainer nutzt **denselben Planungstab** im
Kontext seines Athleten (über den bestehenden Athleten-Toggle). Ist der eingeloggte
Nutzer der Trainer des angezeigten Athleten, erscheint zusätzlich eine schmale
**Trainer-Leiste** über dem Plan:

- Athleten-Kurzstatus: letztes Check-in (Slider kompakt), Governor-Empfehlung heute,
  TSB aktuell;
- Zähler offener eigener Vorschläge („2 Vorschläge offen");
- Hinweis, in welchem Modus Speichern-Aktionen landen (Direkt/Vorschlag-Umschalter,
  Default: **Vorschlag** — die konservative Vorgabe, Direktändern ist die bewusste
  Ausnahme).

Wiederverwendung statt Neubau: Edit-Dialog, Karten, Konflikt-Badges — alles aus
Phase 3; die Trainer-Sicht fügt nur Rechte-Kontext und die Leiste hinzu.

## 6. RLS-Policies (Kern, Prosa — SQL in der Migration)

- `plan_cards` UPDATE/INSERT/DELETE: erlaubt, wenn `athlete_id = auth.uid()` **oder**
  `athlete_id` in der Menge der Athleten mit `trainer_id = auth.uid()`.
- `proposals` INSERT: Trainer des Ziel-Athleten **oder** der Athlet selbst (für
  Claude-Importe). UPDATE (Status annehmen/ablehnen): **nur** der Athlet.
  DELETE: nur der Ersteller, solange Status offen.
- `wellbeing` SELECT: der Athlet selbst, sein Trainer, sowie öffentlich gemäß
  E2-Toggle (nur Slider). `note`-Sichtbarkeit gemäß T1.
- GRANTs für `authenticated` in derselben Migration **mitführen** (Phase-1-Lehre).
- Tests: `tests/supabase-rls.test.js` um Trainer-Fälle erweitern (fremder Athlet ⇒
  403, eigener ⇒ ok, Athlet lehnt Vorschlag ab ⇒ Trainer kann Status nicht
  zurücksetzen).

---

## Getroffene Entscheidungen

- Rechte in RLS, UI nur kosmetisch. ✅
- Kein Claude-Account/Service-User — Claude-Vorschläge laufen über den Athleten-Import. ✅
- Kein Wahoo-Push durch den Trainer; Push bleibt Athleten-exklusiv. ✅
- Trainer sieht Wellbeing-Slider immer (unabhängig vom öffentlichen Toggle). ✅
- Speichern-Default im Trainer-Modus: **Vorschlag** (Direktändern = bewusste Ausnahme). ✅
- **T1 — Check-in-Notiz für den Trainer: per Athleten-Toggle im Profil, Default aus.**
  Slider sieht der Trainer immer, die Notiz nur nach bewusstem Opt-in; der
  Check-in-Dialog zeigt den aktuellen Stand transparent an. ✅
- **T2 — Direktänderungs-Rechte: nur bestehende Karten ändern/verschieben.**
  Anlegen/Löschen läuft immer als Vorschlag — Planhoheit bleibt beim Athleten;
  Lockerung später ist eine RLS-Policy-Zeile. ✅

**Review-UI für ersetzende Vorschläge** (alte und neue Karte nebeneinander, Auswahl
oder Direkt-Übernahme ohne Vergleich): definiert im Vorschlags-Schema-Konzept, §5.
