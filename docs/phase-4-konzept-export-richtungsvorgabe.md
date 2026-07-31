# Konzept: Richtungsvorgabe beim Export für Claude

**Status:** Entwurf zur Abnahme · **Phase:** 4-Nachzug (Export/Import-Workflow)
**Betroffen:** `ui/export-panel.js`, `core/export-briefing.js`,
`docs/phase-4-prompt-vorlage-claude-trainer.md`, neue Migration
**Grundsatzentscheidung getroffen:** 1B + 2B + 3B

---

## 1. Problem

Der "Export für Claude"-Button erzeugt immer dasselbe Briefing mit derselben
Aufgabenstellung: *analysiere Form, Plan und Events, schlage Änderungen vor,
wo sie einen klaren Zweck haben.* Das ist ein brauchbarer Default, aber der
Athlet hat keine Möglichkeit zu sagen, **was er in dieser Runde eigentlich
will**. Praxisfälle, die heute nicht ausdrückbar sind:

- "Schau nur drüber, ob der Plan plausibel ist — bau nichts um."
- "Richte die Form auf mein Event am 19.09. aus" (auch wenn ein anderes Event
  näher liegt).
- "Ich will die nächsten zwei Wochen bewusst entlasten."

Ohne Vorgabe rät das Modell die Absicht aus den Daten. Das funktioniert
mittelmäßig und liefert im Zweifel Vorschläge, wo keine gewollt waren.

---

## 2. Entscheidungen

### R1 — Preset-Liste (5 Einträge)

Feste Auswahl im Export-Panel, genau ein Preset aktiv:

| Kürzel | Label | Bedeutung |
|---|---|---|
| `general` | Allgemein prüfen | heutiges Verhalten, Default |
| `event` | Auf ein bestimmtes Event optimieren | Form auf ein gewähltes Event ausrichten |
| `check` | Nur Plausibilitätscheck | Analyse ohne Änderungsvorschläge |
| `reduce` | Belastung reduzieren | Entlastung einbauen |
| `build` | Aufbau steigern | mehr Reiz, sofern die Daten es zulassen |

Fünf reichen. Weitere Wünsche gehen über das Freitextfeld (R2), nicht über
neue Presets — sonst wächst die Verzweigungslogik in R4 unkontrolliert.

### R2 — Optionales Freitextfeld

Textarea unter der Preset-Zeile, Beschriftung *"Zusatzkontext (optional)"*,
Platzhalter mit Beispiel. Wird **nicht** persistiert und startet bei jedem
Export leer — ein Satz wie "diese Woche wenig Zeit" gilt für genau diesen
Export und wäre beim nächsten irreführend. Länge auf ~500 Zeichen begrenzen,
damit das Feld nicht zum Zweitbriefing wird.

### R3 — Event-Auswahl und leerer Zustand

Wählt man `event`, erscheint darunter eine Auswahl der **echten, künftigen
Events** des Athleten (Datum + Titel + Priorität). Vorausgewählt ist das
nächste priorisierte Event.

Ist die Liste leer, wird das Preset **nicht deaktiviert**, sondern zeigt einen
Hinweis im Panel:

> Kein künftiges Event hinterlegt. Trage zuerst ein Ziel ein — z. B. einen
> Test- oder Wettkampftermin —, damit Claude die Form darauf ausrichten kann.

Dazu ein Link, der die bestehende Event-Verwaltung im Header öffnet. Der
Export-Button bleibt benutzbar; wird `event` ohne Auswahl exportiert, fällt
das Briefing auf `general` zurück und schreibt das sichtbar in den
Auftragsabschnitt (kein stiller Fallback).

**Befund nach Code-Prüfung:** `state/events.js::loadEvents(athleteId)` wird
heute nur vom Übersicht-Tab ausgelöst (`ui/event-timeline.js`/
`ui/event-form.js`). Öffnet ein Athlet den Planungstab direkt, ohne vorher die
Übersicht besucht zu haben, kann `getState().events` leer sein, obwohl Events
existieren. Schritt 3 muss das selbst absichern (z. B. einen eigenen
`loadEvents()`-Aufruf beim Öffnen des Export-Dialogs), sonst zeigt der
Leerzustands-Hinweis fälschlich "kein Event hinterlegt".

### R4 — Umsetzung von 2B: Preset formt die Aufgabenliste um

Die Prompt-Vorlage wird nicht zur Template-Engine mit Bedingungen im Text.
Stattdessen:

- `PROMPT_TEMPLATE` wird in einen **unveränderlichen Rumpf** und einen
  **Auftragsblock** getrennt. Der Rumpf enthält alles, was preset-unabhängig
  ist: JSON-Regeln, Beispiele, Grundsätze.
- Der Auftragsblock kommt aus einer Konstante
  `AUFTRAG_VARIANTEN = { general, event, check, reduce, build }` — je Preset
  ein vollständig ausformulierter Textblock, der die heutigen Punkte 1–3
  ersetzt. Keine Textbausteine, die zur Laufzeit zusammengeklebt werden;
  jede Variante ist als Ganzes lesbar und einzeln reviewbar.
- Der Auftragsblock steht weiterhin **vor** dem Briefing, an der Stelle, an
  der heute "Deine Aufgabe" steht.
- Bei `check` entfällt die Aufforderung zu Vorschlägen vollständig; die
  JSON-Regeln bleiben aber im Rumpf stehen, weil das Modell dann
  `"proposals": []` liefern muss und dafür die äußere Struktur kennen muss.
- Bei `event` wird das gewählte Event namentlich und mit Datum in den
  Auftragsblock eingesetzt — das ist die einzige zur Laufzeit gefüllte Stelle.

**Konsistenz mit der Doku (Korrektur nach Rückfrage):** Die Behauptung im
Kopfkommentar von `core/export-briefing.js` (Zeilen 12–15), ein bestehender
Test halte `PROMPT_TEMPLATE` bytegleich gegen
`docs/phase-4-prompt-vorlage-claude-trainer.md` synchron, stimmt nicht — einen
solchen Test gibt es nicht (`tests/export-briefing.test.js` deckt nur
Regex-Muster im zusammengesetzten Briefing-Output ab, nie `PROMPT_TEMPLATE`
selbst gegen die Doku-Datei). Genau diese Lücke ist der Grund, warum die
Payload-Schema-Lücke zuvor unentdeckt blieb. Schritt 2 schreibt diesen Test
deshalb **neu** (nicht "erweitert"): er prüft künftig den Rumpf **und jede der
fünf Auftragsvarianten** gegen die Doku, die alle fünf Varianten wörtlich
enthält. Der irreführende Kommentar in `core/export-briefing.js:12–15` wird im
selben Schritt korrigiert.

### R5 — Persistenz (3B): eigene Tabelle, nicht `profiles`

Gemerkt wird pro Athlet: das zuletzt gewählte Preset und — bei `event` — die
gewählte Event-ID. **Nicht** der Freitext (R2).

Die naheliegende Variante, zwei Spalten an `profiles` zu hängen, verwerfe ich:
`profiles` ist öffentlich lesbar (Phase-0-Entscheidung E1). Ein öffentlich
sichtbares `export_preset = "reduce"` verrät fremden Besuchern die
Trainingsabsicht und grenzt an die Art von Rückschluss, die die
Sichtbarkeits-Matrix (`docs/phase-6-konzept-sichtbarkeit.md`) gerade vermeidet.

Stattdessen neue Migration (nächste freie Nummer: `0008`) mit kleiner Tabelle
`export_prefs` (`profile_id`, `preset`, `event_id`, `updated_at`), RLS: **nur
der Eigentümer liest und schreibt**, kein öffentlicher Lesepfad, kein View.
Muster analog zu `trainer_view_prefs` — das steckt tatsächlich additiv in
`supabase/migrations/0006_proposals_v1.sql`, keine eigenständige Migration wie
oben ursprünglich unterstellt, bleibt aber die richtige Vorlage. Die RLS fällt
hier sogar einfacher aus als dort: `trainer_view_prefs` braucht eine
Doppelprüfung (`trainer_id = auth.uid() AND is_coach_of(athlete_id)`), weil der
Schlüssel ein Trainer-Athlet-**Paar** ist — `export_prefs` hat nur ein
einzelnes Profil als Schlüssel, eine einfache `profile_id = auth.uid()`-Policy
reicht.

### R6 — Default bei Erstnutzung

Kein Eintrag in `export_prefs` → `general`. Kein Onboarding, kein
Hinweis-Popup.

### R7 — Freitext und die öffentliche `reason`-Spalte

`reason` an Vorschlägen ist öffentlich sichtbar; die Prompt-Vorlage verlangt
dort schon heute rein lastbasierte Formulierungen. Da der Freitext künftig
Persönliches enthalten kann ("bin nächste Woche unterwegs", "fühle mich
schlapp"), bekommt der Rumpf eine zusätzliche Zeile:

> Zusatzkontext des Athleten darf deine Entscheidung beeinflussen, aber
> niemals in `reason` auftauchen — `reason` bleibt lastbasiert (TSS, TSB,
> Plan, Events).

### R8 — Persistenz-Semantik (revidiert — ursprüngliche Fassung war eine Fehlannahme)

**Korrektur nach Rückfrage:** Der menschliche Trainer nutzt das Export-Panel
NICHT. Der Export existiert, damit der Athlet Claude als Trainer konsultieren
kann — ein menschlicher Trainer hat dafür das Trainer-Dashboard und schreibt
seine Vorschläge direkt über die Direkt-/Vorschlagswege aus Phase 4.
Trainer-Zugriff aufs Export-Panel wäre ein neues Feature ohne belegten Bedarf,
kein Teil dieser Arbeit — `ownsPlan()`/`isAthlete()` in `ui/export-panel.js`
bleiben unverändert.

`export_prefs.profile_id` bezeichnet trotzdem weiterhin semantisch das
exportierende Profil — das ist heute immer der Athlet selbst. Diese Wortwahl
kostet nichts und bleibt zukunftssicher, falls ein Trainer-Export später
einmal gewollt ist (dann als eigener Fahrplanschritt, nicht rückwirkend hier).

### R9 — Nicht-Zielpunkte

- Keine gespeicherten, benannten, wiederverwendbaren Vorgaben-Vorlagen
  (Variante 1C aus der Vorüberlegung) — Overkill für fünf Presets.
- Kein Mitprotokollieren der Vorgabe an den entstandenen Vorschlägen
  (Variante 3C) — reizvoll für die Nachvollziehbarkeit, kollidiert aber mit
  der öffentlichen Sichtbarkeit von `proposals` (S1). Wandert nach
  `docs/offene-punkte.md`.
- Kein eigener Menüpunkt oder Dialog. Alles bleibt im bestehenden
  Export-Panel.
- Keine Änderung an Parser, Validator oder dem JSON-Schema v1. Die
  Richtungsvorgabe verändert nur, **was** Claude vorschlägt, nicht **wie** es
  formatiert zurückkommt.

### R10 — Nachtrag: Datenbedarf je Preset (Befund aus dem Code-Review 30.07.2026)

Die Auftragsvarianten (R4) verlangen von Claude Prüfungen, für die das
Briefing (`buildBriefingMarkdown`) heute nicht durchgängig die nötigen Werte
mitliefert:

- **Preset `event`:** verlangt "ob die Belastungskurve … bis zu diesem Termin
  ins Zielfenster läuft" — das Briefing zeigt die Projektion aber nur für
  **heute** und das **Horizont-Ende**, nicht für den konkreten Eventtag.
  Tagesgenaue Werte liegen in `getState().projection.days` bereits vor, sie
  werden im Briefing nur nicht bis zum Eventtag durchgereicht. Ebenso fehlt
  das **Zielfenster** selbst (`CONFLICT_THRESHOLDS.eventWindowMain`/
  `eventWindowSecondary`, `core/plan-config.js`) — es taucht aktuell nur
  implizit auf, wenn K-EVENT bereits eine Verletzung meldet (s. R11-Fund
  unten).
- **Preset `check`:** verlangt eine Plausibilitätsprüfung "auf Basis der
  Schwellen" — die Schwellen selbst (`CONFLICT_THRESHOLDS`,
  `core/plan-config.js`) stehen nirgends im Briefing, Claude kennt sie nur,
  wenn ein Konflikt bereits gegen sie ausgelöst hat.
- **Preset `reduce`/`build`:** verlangt eine Einschätzung von Belastungsmuster
  und -trend — TSS je Karte (Ziel-TSS-Spalte), Wochensummen und CTL-Rampe
  sind zwar rechenbar, die Ziel-TSS-Spalte im Trainingsplan-Abschnitt steht
  aber durchgehend auf "–", weil nur `tssPlanned` gelesen wird, nicht der
  K3-Typ-Default (`TYPE_DEFAULT_TSS`, `core/plan-config.js`) für Karten ohne
  expliziten Zielwert.

### R11 — Nachtrag: fachliche Bezugsgrößen einmal im Rumpf statt in fünf Varianten

Mehrere Auftragsvarianten verlangen dieselbe fachliche Prüfung wörtlich fast
identisch (`general` und `check`: "Passt die Belastungskurve zum nächsten
priorisierten Event (TSB-Zielfenster laut Briefing)?"). Kennzahlen, die
mehrere Presets gemeinsam brauchen, gehören einmal in `PROMPT_RUMPF`
beschrieben, nicht in jeder Auftragsvariante separat wiederholt — sonst
driftet die Formulierung zwischen den Varianten auseinander, ohne dass ein
Test das auffängt (`tests/export-briefing-consistency.test.js` prüft nur
Rumpf und Varianten je für sich gegen die Doku, keine Redundanz zwischen
Varianten). Kein Umsetzungsschritt in dieser Runde — der Rumpf-Text selbst
bleibt vorerst unangetastet; R11 hält nur fest, woran sich künftige
Prompt-Vorlage-Änderungen messen lassen sollen.

**Umsetzung vor dem Merge (nicht als späterer Auftrag):** Nur die beiden
konkreten Datenlücken aus R10 werden geschlossen — TSB-Zielfenster +
Eventtag-Projektion unabhängig vom Konfliktstatus zeigen (bei den
"Anstehenden Events"), Ziel-TSS-Spalte über den K3-Typ-Default befüllen
(`core/projection.js::estimateTss`, bereits vorhanden und getestet, hier nur
wiederverwendet). Die Rumpf/Varianten-Dedupe aus R11 selbst ist bewusst kein
Teil dieser Runde.

---

## 3. Abhängigkeiten und Reihenfolge

1. **Vorbedingung:** Ramp-Test-Event in `dashboard-dev` eingetragen
   (eigener Aufräum-Auftrag). Ohne echtes Event ist R3 nur im Leerzustand
   testbar.
2. **Schritt 1 [SO]** — Migration `export_prefs` (nächste freie Nummer:
   `0008`) + RLS + Grants, Datenzugriff in `data-access/supabase/`,
   State-Anbindung. Eigener Commit.
3. **Schritt 2 [SO]** — Prompt-Vorlage aufteilen (Rumpf + fünf
   Auftragsvarianten), Doku nachziehen, Konsistenztest **neu schreiben**
   (kein bestehender Test zum Erweitern, s. R4-Korrektur) samt Korrektur des
   irreführenden Kommentars in `core/export-briefing.js:12–15`. Eigener
   Commit. **Vor** der UI, damit die UI gegen ein fertiges Textmodell baut.
4. **Schritt 3 [SO]** — Export-Panel: Preset-Zeile, Freitextfeld,
   Event-Auswahl, Leerzustands-Hinweis, Persistenz-Anbindung. Eigener Commit.
5. **Schritt 4 [SO]** — Tests: Auftragsvariante je Preset, Fallback bei
   `event` ohne Auswahl, Freitext-Längenbegrenzung, Persistenz pro Profil.

Schritt 2 und 3 hängen beide an Schritt 1 nur für die Persistenz; die
Textseite (2) ist unabhängig und könnte auch zuerst laufen. Strikt
schrittweise, ein Commit je Schritt, keine Schritte überspringen.

---

## 4. Offen für die Mockup-Runde

Layout der Preset-Zeile im Export-Panel (Radio-Reihe vs. Dropdown), Position
des Freitextfelds, Darstellung des Leerzustands aus R3. Wird als eigene
Mockup-Runde gezeigt und abgenommen, bevor Schritt 3 umgesetzt wird —
Lesbarkeit und Beschriftung sind dabei die Hauptkriterien.
