# Konzept: Progressionssteuerung (Trainingsplan-Anpassung im Claude-Export)

**Stand:** 01.08.2026
**Zielablage:** `docs/konzept-progressionssteuerung.md`
**Bezug:** `docs/phase-4-konzept-export-richtungsvorgabe.md`, `core/plan-config.js`, `core/projection.js`, `core/session-classify.js`, `core/export-briefing.js`
**Gewählte Varianten:** B0 (Vorbedingung), B1 = 1C, B2 = 2C, B3 = 3C, B4 = 4A, B5 = 5A + 5B, B6 = 6A, B7 = 7B (Formatkatalog als Daten), B8 = 8B (Ruhetage als Karten — *überholt seit Fahrplan 6: Ruhetage abgeleitet statt als Karten, s. D6*), B9 = 9C (Wirkungsanzeige auf allen Karten)

---

## 0. Problemstellung

Heute verändert die Preset-Wahl beim Export ("Entlasten" / "Aufbau steigern") den Trainingsplan über `target_tss` je Karte. Drei strukturelle Schwächen:

1. **Falsche Steuerungsgröße.** TSS = Dauer × IF². Eine TSS-Änderung ist physiologisch mehrdeutig — sie kann ein Intervall streichen, alle Intervalle kürzen, die Zielwatt senken oder das Ausrollen kappen. Für Intervalleinheiten ist die adaptationsrelevante Größe die *Zeit in der Zielzone*, nicht der Summenwert.
2. **Keine Progressionsfolge.** Jeder Export ist ein frischer Chat. "Steigern" heißt: der Trainer erfindet etwas Plausibles. Beim nächsten Export etwas anderes Plausibles. Kontinuierliche Verbesserung setzt eine *Folge* voraus, keine Einzelentscheidungen.
3. **Kein Auslöser aus der Ist-Leistung.** Progression wird vom Blockplan getrieben, nicht davon, ob die letzte Einheit sauber gefahren wurde — obwohl seit dem `?intervals=true`-Umbau genau diese Daten vorliegen.

**Ziel:** Die Plananpassung wird deterministisch, nachvollziehbar und aus Ist-Daten begründet. Der Trainer-Chat wählt nicht mehr frei, sondern bewegt sich auf einer definierten Leiter und muss Abweichungen begründen.

---

## G1 — Verhältnis zum React-Umbau (Dashboard 3.0) — **entschieden**

**Entscheidung (01.08.2026): vollständige Umsetzung in der aktuellen Live-Version, unabhängig vom React-Umbau.** Branch `main`, Vanilla-`ui/`, kein Warten auf Dashboard 3.0.

Das heißt konkret:

- `core/`, `data-access/`, `scripts/` und die Export-Textgenerierung entstehen ohnehin framework-agnostisch und werden beim 3.0-Umbau nur neu angebunden.
- Die **Intervalltabelle aus 3C wird jetzt in Vanilla gebaut** (Schritt 6b) und beim React-Umbau als Komponente neu geschrieben. Das ist bewusst in Kauf genommene Doppelarbeit — begründet dadurch, dass die Tabelle zur Kalibrierung des Soll-Ist-Matchings gebraucht wird und nicht bis zum Umbau warten soll.
- **Nachtrag im 3.0-Konzept nötig:** `docs/dashboard-3.0-konzept-react-umbau.md` muss die neuen UI-Flächen als Portierungsposten aufnehmen — Intervalltabelle, Leiterstand-Anzeige, Compliance-Ampel im Planungstab. Sonst fehlen sie beim Etappenzuschnitt 5–9. Das ist ein eigener kleiner Commit, kein Bauschritt (siehe Schritt 13).

**Bewusst nicht getan:** die Kette 2→6 wird *nicht* auf den Branch `dashboard-3.0` gelegt. Das Datenmodell (D1, D2) ist laut 3.0-Zuschnitt ohnehin unangetastet und gehört auf `main`; eine Aufteilung über zwei Branches würde die Migrationskette spalten.

---

## 1. Datenmodell

### D1 — Workout-Schema (aus 1C)

Neues Feld `plan_cards.workout_structure` (jsonb, nullable). Ersetzt `payload.workout` als Freitext **nicht** — der bleibt als Anzeigetext erhalten und wird künftig aus der Struktur generiert.

```json
{
  "version": 1,
  "steps": [
    { "kind": "warmup",   "duration_s": 600, "target_pct_ftp": 55 },
    { "kind": "set", "reps": 3,
      "work":     { "duration_s": 900, "target_pct_ftp": 90 },
      "recovery": { "duration_s": 300, "target_pct_ftp": 50 } },
    { "kind": "cooldown", "duration_s": 600, "target_pct_ftp": 50 }
  ]
}
```

Abgeleitet berechnet (nicht gespeichert):

- `computedTss` = Σ (duration_s × IF²) / 36, mit IF = target_pct_ftp / 100
- `timeInZone_s` je Zone, aus der Zonenkonfiguration und `ftpAt(profileId, plan_date)`
- `targetZoneTime_s` = Summe der `work`-Anteile aller `set`-Schritte (die Progressionswährung)

**Entscheidung D1.1 (mein Vorschlag, zur Abnahme):** Verschachtelte Sets werden nicht unterstützt. Der 30/15-Fall (3 Sätze × 13 Wiederholungen) wird als drei aufeinanderfolgende `set`-Schritte mit einem `rest`-Schritt dazwischen abgebildet. Begründung: verschachtelte Wiederholungen sind auch im Zielformat nicht offiziell unterstützt, und ein flaches Schema ist testbar mit deutlich weniger Kombinationen.

**Entscheidung D1.2:** `target_pct_ftp` immer relativ zur FTP, nie absolut in Watt. Die Auflösung nach Watt passiert erst bei der Ausgabe über `ftpAt()`. Sonst wird beim nächsten Ramp-Test der ganze Plan falsch — dieselbe Begründung, die schon zur FTP-Historie geführt hat.

**Entscheidung D1.3 (neu mit B7, zur Abnahme):** Zwei weitere Schrittarten, beide flach — sie umgehen das Verschachtelungsverbot aus D1.1 nicht, sondern lösen dieselben Fälle ohne Verschachtelung.

```json
{ "kind": "alternating", "reps": 3, "cycles": 3,
  "over":     { "duration_s": 120, "target_pct_ftp": 105 },
  "under":    { "duration_s": 120, "target_pct_ftp": 88 },
  "recovery": { "duration_s": 300, "target_pct_ftp": 50 } }

{ "kind": "accessory", "subtype": "sprint", "reps": 4,
  "work":     { "duration_s": 15, "target": "max" },
  "recovery": { "duration_s": 285, "target_pct_ftp": 50 } }
```

- `alternating` bildet Over-Unders ab: `cycles` ist die Zahl der Over/Under-Wechsel *innerhalb* eines Blocks, `reps` die Zahl der Blöcke. `3 × 10 min mit 2/2` = `reps: 3, cycles: 3` (aufgerundet auf volle Wechsel, siehe D1.4).
- `accessory` bildet Zusätze wie Sprints ab. **Wichtig:** `accessory`-Schritte zählen *nicht* in `targetZoneTime_s` und *nicht* in die Compliance-Ampel des Hauptteils. Sie haben eine andere Währung (Wiederholungszahl und Spitzenleistung) und eine eigene, sehr kurze Progression.

**Entscheidung D1.4:** Bei `alternating` muss `cycles × (over + under)` exakt der Blockdauer entsprechen; krumme Reste werden abgelehnt, nicht stillschweigend gerundet. Begründung: sonst weicht die berechnete Zeit in Zone systematisch von der geplanten ab und die Compliance-Schwellen aus C2 verschieben sich unbemerkt.

### D2 — Leiterzustand (aus 2C)

Neue Tabelle `ladder_history`, bewusst analog zu `ftp_history` modelliert:

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | uuid | |
| `profile_id` | uuid | FK profiles |
| `format_id` | text | FK auf `session_formats` (D4) — ersetzt die frühere feste Typenliste |
| `step` | int | Stufennummer innerhalb der Familie |
| `valid_from` | date | |
| `reason` | text | 'compliance-green' \| 'compliance-red' \| 'manual' \| 'block-start' |
| `source_ride_id` | text | nullable, welche Fahrt die Fortschreibung ausgelöst hat |

**Begründung Historie statt Einzelfeld:** identisch zur FTP-Entscheidung — ohne `valid_from` lässt sich im Nachhinein nicht mehr rekonstruieren, auf welcher Stufe eine alte Einheit geplant war, und der Abschlussvergleich eines Blocks wird wertlos.

**RLS:** wie `ftp_history` — Athlet schreibt nur für sich, Trainer liest über `is_coach_of`, `anon` kein GRANT.

### D3 — Compliance je Fahrt (aus 3C)

Kein DB-Feld. Wird im Generierungslauf berechnet und in `data/rides.json` mitgeschrieben, analog zu `typDetection`:

```json
"compliance": {
  "matchedCardId": "...",
  "plannedZoneTime_s": 2700,
  "actualZoneTime_s": 2610,
  "intervalsPlanned": 3,
  "intervalsCompleted": 3,
  "fadePct": -2.4,
  "rating": "green",
  "rule": "all-intervals-complete"
}
```

### D4 — Formatkatalog (aus 7B)

Zwei neue Tabellen. Sie sind der Grund, warum L2–L8 unten eine *Startbelegung* sind und keine im Code festgeschriebene Liste.

**`session_formats`** — der Katalog, athletenunabhängig:

| Spalte | Typ | Bemerkung |
|---|---|---|
| `id` | text | z. B. `sweetspot-long`, `over-under`, `vo2-short` |
| `label` | text | Anzeigename |
| `target_system` | text | 'aerob-ermuedungsresistenz' \| 'schwelle' \| 'laktat-clearance' \| 'vo2max' \| 'neuromuskulaer' |
| `currency` | text | 'zone-time' \| 'over-time' \| 'time-above-90' \| 'reps' |
| `evidence_grade` | text | 'studienlage' \| 'coaching-konsens' |
| `block_targets` | text[] | für welche Blockziele zulässig |
| `axes` | jsonb | Progressionsachsen (siehe unten) |

**`athlete_formats`** — welche Familien für wen aktiv sind:

| Spalte | Typ |
|---|---|
| `profile_id` | uuid |
| `format_id` | text |
| `active` | boolean |
| `added_at` | timestamptz |

**Entscheidung D4.1 (zur Abnahme):** `evidence_grade` ist ein Pflichtfeld und wird im Export-Briefing mit ausgegeben. Begründung: Over-Unders sind mechanistisch plausibel und Coaching-Konsens, aber nicht auf dem Evidenzniveau der VO2-Formate. Der Trainer-Chat soll den Unterschied sehen, statt beide als gleich belegt zu behandeln — sonst wird eine Praxisheuristik zur Studienaussage aufgewertet.

**Entscheidung D4.2:** `axes` beschreibt die Progression parametrisch, nicht als aufgezählte Stufenliste:

```json
{
  "primary":   { "name": "reps",     "values": [3, 4] },
  "secondary": { "name": "duration", "values": [600, 720, 900, 1080, 1200] },
  "tertiary":  { "name": "pct_ftp",  "values": [88, 90, 91], "gate": "green-twice" }
}
```

Die Leiterstufen werden daraus generiert: primäre und sekundäre Achse zuerst (Volumen), die tertiäre Achse (Intensität) rückt nur vor, wenn die Bedingung in `gate` erfüllt ist. Damit braucht eine neue Bauform keine Code-Änderung mehr, nur einen Katalogeintrag.

**RLS:** `session_formats` öffentlich lesbar (kein personenbezogener Inhalt), Schreiben nur Admin. `athlete_formats` wie `ftp_history` — Athlet für sich, Trainer lesend über `is_coach_of`.

### D5 — Test-Events abgrenzen

Neue Spalte `events.is_test` (boolean, default false). Alternativ als `priority: 'test'` — siehe D5.1.

**Warum:** Das derzeit einzige eingetragene Event ist der FTP Ramp Test am 19.09. Das ist ein *Messtermin*, kein Wettkampf. Wenn die Familienwahl daran hängt, steuert das System in Richtung dessen, was den Ramp-Test-Wert hebt — der reagiert stark auf VO2max und anaerobe Kapazität. Das Ergebnis wäre eine Optimierung auf die Messung statt auf die Fitness: die 210 W im September wären teilweise ein Testeffekt, und die Diskrepanz zwischen Testwert und tatsächlicher Ausdauerleistung fiele erst danach auf.

**Wirkung von `is_test = true`:**

| Bereich | Verhalten |
|---|---|
| TSB-Zielfenster | greift wie bei einem Event (frisch antreten) |
| Taper | kurz, 3–4 Tage statt voller Taper |
| Familienwahl (L1.1) | **kein Einfluss** — Blockziel bleibt maßgeblich |
| Leiter | wird zum Testtermin eingefroren, nicht hochgestuft |
| Preset "Auf Event hin" | wählbar, aber Hinweis: "Testtermin — der Plan wird nicht auf die Testform hin umgebaut" |

**Entscheidung D5.1 (Vorschlag):** eigenes Boolean-Feld statt eines neuen `priority`-Werts. Begründung: `priority` ist eine Rangfolge zwischen konkurrierenden Events; "ist ein Test" ist eine orthogonale Eigenschaft. Ein Test kann durchaus das wichtigste anstehende Datum sein, ohne dass der Plan auf ihn hin umgebaut wird — das ließe sich mit einer Rangfolge nicht ausdrücken.

**Entscheidung D5.2:** Bestehende Events bleiben `is_test = false`; der Ramp Test 19.09. wird im Zuge der Migration einmalig umgesetzt. Kein Rateverfahren über den Titel.

### D6 — Ruhetage als Karten (aus 8B)

> **Überholt seit Fahrplan 6** (`docs/fahrplan-6-ruhetag-planwochen-modell.md`,
> RUH1–RUH6, umgesetzt 2026-08-29). Ruhetage sind **keine `plan_cards`-Zeilen
> mehr**, sondern aus dem Plan-Wochen-Modell abgeleitet
> (`app/src/core/plan-week-model.js`): „Ruhe-Slot-Tag ohne aktive Karte". Die
> Entscheidungen D6.1/D6.2 (Compliance-Ausnahme, eigene Intensitätskategorie
> „ruhe", K-LEER/K-HARTFOLGE-Verhalten) gelten **inhaltlich unverändert
> weiter** — nur die Quelle ist jetzt das Modell statt eine `rest`-Karte. Der
> Abschnitt unten bleibt als Entwurfshistorie stehen.

Heute ist ein Ruhetag nicht von einer Planungslücke unterscheidbar. Das ist ein semantisches Loch mit drei konkreten Folgen: K-HARTFOLGE (5B) kann nicht prüfen, ob zwischen zwei harten Tagen bewusst frei geplant war; der Trainer-Chat füllt bei "Aufbau steigern" genau die Tage zu, die frei bleiben sollten; und Erholungswochen sind nur aus dem Blockplan ableitbar, nicht aus dem Plan selbst — obwohl die Sperrregel in C3 daran hängt.

**Dreiteilung, sauber getrennt:**

| Zustand | Bedeutung | `target_tss` |
|---|---|---|
| Karte `rest` | bewusst komplett frei | 0 |
| Karte `recovery` | Z1-Ausfahrt, echte Regeneration | echter Wert |
| **keine Karte** | ungeplant | — |

Kein neues Datenmodell nötig: `rest` und `recovery` sind Werte im bestehenden Typfeld. CRUD, Drag&Drop und die Konfliktlogik greifen unverändert.

**Entscheidung D6.1 (Vorschlag):** `rest`-Karten tragen `workout_structure = null` und werden von der Compliance-Auswertung (C1/C2) ausgenommen — ein nicht gefahrener Ruhetag ist Erfüllung, kein Ausfall. Eine `rest`-Karte, an der doch gefahren wurde, erzeugt stattdessen ein eigenes Trainer-Signal ("Ruhetag gefahren"), analog zum bestehenden Abweichungssignal geplant/erkannt.

**Entscheidung D6.2:** `rest`-Karten zählen nicht als "harter Tag" und nicht als "leichter Tag", sondern als eigene Kategorie. Für K-HARTFOLGE erfüllen sowohl `rest` als auch `recovery` die Trennbedingung.

**Folgeanpassung:** K-LEER darf auf Tagen mit `rest`-Karte nicht mehr feuern (siehe P2).

---

## 2. Formatfamilien und Leitern

### L1 — Drei Entscheidungsebenen, sauber getrennt

Die Frage "was sind die besten Intervalle für diesen Athleten" ist nicht beantwortbar — weder aus der Studienlage noch aus n=1-Daten. Beantwortbar sind drei getrennte Fragen, und das System entscheidet sie aus drei verschiedenen Quellen:

| Ebene | Frage | Quelle | Instanz |
|---|---|---|---|
| 1 | Welches Ziel hat der Block, und woran misst man die Einheit? | Studienlage | fest (`target_system`, `currency`) |
| 2 | Welche Bauformen treffen dieses Ziel? | Coaching-Praxis, unterschiedlich gut belegt | Katalog (`session_formats`) |
| 3 | Welche Stufe innerhalb der Familie? | eigene Daten (Compliance, Fade, RPE) | System (C3) |

Ebene 3 ist die einzige, auf der überhaupt etwas "am besten" sein kann — und die einzige, die dieses Dashboard als einziges Werkzeug im Raum bedienen kann. Ebene 1 und 2 werden gepflegt, nicht berechnet.

### L1.1 — Auswahlregeln

- Das Blockziel aus `periodization.js` bestimmt, welche Familien überhaupt zulässig sind (`block_targets`).
- Davon sind nur die für den Athleten aktiven Familien wählbar (`athlete_formats`).
- **Maximal zwei aktive Familien pro Block** — sonst ist keine Leiter mehr erkennbar.
- **Kein Familienwechsel innerhalb eines Blocks.** Ein Wechsel setzt die Leiterposition zurück und macht den Blockvergleich wertlos.
- Der Trainer-Chat darf abweichen, aber nur mit Pflichtbegründung im Vorschlag.
- **Events mit `is_test = true` beeinflussen die Familienwahl nicht** (D5). Ein Ramp Test ist ein Messtermin; auf ihn hin zu optimieren hieße, den Messwert statt die Fitness zu trainieren.

### L1.2 — Zwei Achsen, klare Rangfolge

Innerhalb jeder Familie: **Volumen wächst zuerst**, Intensität rückt nur an definierten Toren vor und nur nach zweimal grün. Das folgt der gängigen Coaching-Logik, im Aufbau kürzere Intervalle am oberen Zonenende zu halten und die Dauer erst zu verlängern, wenn dieses Niveau konsistent gehalten wird.

---

**Die folgenden Tabellen L2–L8 sind die Startbelegung des Katalogs, nicht seine Definition.** Sie werden bei der Migration als Zeilen in `session_formats` angelegt und sind danach ohne Code-Änderung erweiterbar.

### L2 — Familie `sweetspot-long` (88–93 % FTP)

| Stufe | Struktur | Zeit in Zone | % FTP |
|---|---|---|---|
| S1 | 3 × 10 min | 30 min | 88 |
| S2 | 3 × 12 min | 36 min | 88 |
| S3 | 3 × 15 min | 45 min | 90 |
| S4 | 4 × 12 min | 48 min | 90 |
| S5 | 2 × 20 min | 40 min | 91 |
| S6 | 3 × 18 min | 54 min | 90 |
| S7 | 3 × 20 min | 60 min | 91 |
| S8 | 2 × 30 min | 60 min | 90 |

Erholungspausen: 5 min bei Intervallen ≤ 15 min, 8 min darüber.
S5 ist bewusst ein Intensitätssprung bei sinkendem Volumen — das ist der Achsenwechsel, kein Fehler in der Tabelle.

### L3 — Familie `threshold-long` (95–105 % FTP)

| Stufe | Struktur | Zeit in Zone | % FTP |
|---|---|---|---|
| T1 | 3 × 8 min | 24 min | 98 |
| T2 | 4 × 8 min | 32 min | 98 |
| T3 | 2 × 15 min | 30 min | 100 |
| T4 | 3 × 12 min | 36 min | 100 |
| T5 | 2 × 20 min | 40 min | 100 |
| T6 | 3 × 15 min | 45 min | 100 |
| T7 | 4 × 12 min | 48 min | 102 |

### L4 — Familien `vo2-short` und `vo2-long`

Die Evidenzlage ist hier ausdrücklich strittig: das 30/15-Protokoll zeigte in Radsport-Studien über zehn Wochen größere VO2max- und Leistungszuwächse als 4×5 min, während eine Laufstudie fand, dass intensivierte 30-Sekunden-Intervalle *weniger* Zeit über 90 % VO2max erzeugten als klassische 3-Minuten-Intervalle. Deshalb kein "richtiges" Format, sondern **zwei getrennte Familien** — kein `branch`-Feld mehr, sondern zwei Katalogeinträge, die sich über L1.1 gegenseitig ausschließen (beide zulässig für dasselbe Blockziel, aber nur eine pro Block aktiv).

**`vo2-short` (30/15):**

| Stufe | Struktur | Arbeitszeit | % FTP |
|---|---|---|---|
| V-K1 | 2 Sätze × 10 × 30/15 | 10 min | 110 |
| V-K2 | 3 Sätze × 10 × 30/15 | 15 min | 110 |
| V-K3 | 3 Sätze × 13 × 30/15 | 19,5 min | 112 |
| V-K4 | 4 Sätze × 13 × 30/15 | 26 min | 112 |

**`vo2-long`:**

| Stufe | Struktur | Arbeitszeit | % FTP |
|---|---|---|---|
| V-L1 | 4 × 3 min | 12 min | 112 |
| V-L2 | 5 × 3 min | 15 min | 112 |
| V-L3 | 4 × 4 min | 16 min | 108 |
| V-L4 | 4 × 5 min | 20 min | 106 |
| V-L5 | 5 × 5 min | 25 min | 106 |

**Entscheidung L4.1 (Vorschlag):** maximal eine VO2max-Einheit pro Woche, und sie wird nie auf einen Tag mit Governor gelb/rot gelegt. Bei rot wird sie verschoben, nicht abgeschwächt — eine abgeschwächte VO2max-Einheit ist physiologisch eine Schwelleneinheit mit schlechterem Reiz-Ermüdungs-Verhältnis.

### L5 — Familie `over-under`

Zielsystem Laktat-Clearance: durch das wiederholte Fluten mit Laktat in den "over"-Phasen und das knappe Unterschreiten der Schwelle in den "under"-Phasen wird die Clearance-Fähigkeit trainiert. **`evidence_grade: coaching-konsens`** — mechanistisch plausibel und breit in der Praxis verankert, aber ohne RCT-Fundament vergleichbar mit den VO2-Formaten. Steht so auch im Briefing.

Währung ist hier **nicht** die Gesamtzeit in Zone, sondern `over-time` (Summe der Over-Phasen) plus die Zahl der Wechsel.

| Stufe | Struktur (over/under) | Over-Zeit | Wechsel | % FTP over/under |
|---|---|---|---|---|
| OU1 | 3 × 9 min, 2/1 | 18 min | 9 | 103 / 88 |
| OU2 | 3 × 10 min, 2/2 | 15 min | 9 | 105 / 88 |
| OU3 | 3 × 12 min, 2/2 | 18 min | 9 | 105 / 88 |
| OU4 | 3 × 12 min, 2/2 | 18 min | 9 | 107 / 90 |
| OU5 | 3 × 15 min, 3/2 | 27 min | 9 | 105 / 90 |
| OU6 | 4 × 12 min, 2/2 | 24 min | 12 | 107 / 90 |

Achsenrangfolge abweichend: **erst Over-Zeit, dann Delta** (over − under), erst zuletzt die Blockzahl. Begründung: das Delta ist die eigentliche Reizgröße dieser Familie; es zuerst zu erhöhen macht die Einheit zu einer Serie kurzer VO2-Stöße und verfehlt das Zielsystem.

### L6 — Familie `sprint-accessory`

Kein eigenständiger Einheitentyp, sondern ein Zusatz zu einer Hauptfamilie (`kind: "accessory"` aus D1.3). Zielsystem neuromuskulär, Währung `reps`.

| Stufe | Struktur |
|---|---|
| SP1 | 3 × 10 s max, 4 min Pause |
| SP2 | 4 × 10 s max, 4 min Pause |
| SP3 | 4 × 15 s max, 5 min Pause |
| SP4 | 6 × 15 s max, 5 min Pause |

**Entscheidung L6.1 (Vorschlag):** Zusätze werden nie an eine VO2max-Einheit angehängt und zählen nicht in die Ampel des Hauptteils. Sie werden separat als erfüllt/nicht erfüllt geführt. Begründung: sonst kippt ein abgebrochener Sprint eine sauber gefahrene Schwelleneinheit auf rot und stuft die falsche Leiter zurück.

### L7 — Startbelegung je Athlet

| Athlet | Aktive Familien |
|---|---|
| Stuhlsen | `sweetspot-long`, `threshold-long`, `vo2-long`, `vo2-short` |
| hc_diZee | `over-under`, `threshold-long`, `sprint-accessory`, `vo2-short` |

Das ist die Erstbefüllung von `athlete_formats` aus dem, was beide heute real fahren — danach über das Athletenmenü änderbar.

### L8 — Ablage

Katalog und Athletenzuordnung liegen in Supabase (D4), nicht in `core/plan-config.js`. Dort bleiben nur die *Regeln* (Achsenrangfolge, Tore, Sperren) neben den K1/K3-Schwellen. Der Trainer-Chat bekommt die aktive Familie, die aktuelle Stufe, die zwei Nachbarstufen und den `evidence_grade` genannt — nie den ganzen Katalog.

### L9 — Bedienung: wo die Familienwahl stattfindet (E1 + E2)

**Nicht im Export-Panel.** Eine sechste Kachelreihe neben den Presets wurde geprüft und verworfen — aus zwei Gründen, von denen der erste der wichtigere ist:

1. **Falsche Granularität.** Das Export-Panel gilt ausdrücklich nur für den einzelnen Export ("Gilt nur für diesen Export"). Die Familie darf sich laut L1.1 innerhalb eines Blocks gerade *nicht* ändern. Ein Steuerelement, das pro Export wirkt, für eine Entscheidung, die vier bis sechs Wochen hält, ist ein Kategorienfehler.
2. **Vermischte Bedeutungsebenen.** Die Preset-Reihe wählt *Absicht* ("was soll Claude in dieser Runde tun"), die Familie wäre *Inhalt*. In einer Reihe nebeneinander verwischt beides — und ein Athlet ohne Trainingslehre-Hintergrund würde die Familie als eine Art stärkeres Preset lesen.

**E1 — Anzeige im Export-Panel** *(klein)*
Unter der Preset-Erklärungszeile eine schreibgeschützte Zeile mit dem aktuellen Stand, z. B.:

> Aktuell: Sweet Spot lang · Stufe S3 (3×15) — Schwelle lang · Stufe T2 (4×8)

Transparenz ohne Lenkrad. Nutzt dieselbe Fläche, auf der heute der Preset-Erklärungstext steht.

**E2 — Blockstart-Dialog** *(mittel)*
Die Wahl bekommt einen eigenen Ort: beim Übergang in einen neuen Block, und **nur dann, wenn für das Blockziel mehr als eine Familie zulässig und für den Athleten aktiv ist**. Inhalt je Option: Zielsystem im Klartext, `evidence_grade`, Beispieleinheit der Startstufe, und eine vom System begründet vorausgewählte Option. Erscheint alle vier bis sechs Wochen und darf deshalb erklärend sein — im Gegensatz zu einer Kachel, die bei jedem Export mitgeklickt wird.

**Ventil für den Ausnahmefall:** kein zusätzliches Bedienelement. Ein Satz im Zusatzkontext-Feld ("diesen Block gern mal Over-Unders") reicht — der Trainer schlägt den Wechsel mit Begründung vor, der Athlet nimmt ihn über den normalen Import-Weg an. Damit läuft auch dieser Fall durch die Konfliktprüfung aus 5B.

**Bewusst nicht E3 (vollautomatisch):** Vorliebe zählt hier sachlich. Wer 30/15er hasst, fährt sie schlechter oder gar nicht — und Adhärenz schlägt Formatwahl auf diesem Leistungsniveau deutlich.

---

## 3. Compliance und Leiter-Fortschreibung

### C1 — Soll-Ist-Matching

Die geplanten `set`-Schritte werden gegen die `ACTIVE`-Blöcke aus `?intervals=true` gematcht. Zuordnung über zeitliche Reihenfolge, nicht über Dauergleichheit.

Ein Intervall gilt als **erfüllt**, wenn:
- Dauer ≥ 90 % der geplanten Dauer, **und**
- mittlere Leistung ≥ Zielwatt − 3 %

### C2 — Ampel

| Bewertung | Bedingung |
|---|---|
| **grün** | alle Intervalle erfüllt, Zeit in Zone ≥ 95 % des Solls, Fade ≥ −3 %, RPE ≤ 7 |
| **gelb** | Zeit in Zone ≥ 85 %, oder Fade −3 bis −8 %, oder RPE ≥ 8 bei sonst grün |
| **rot** | Zeit in Zone < 85 %, oder ein abgebrochenes Intervall, oder Fade < −8 % |

`fadePct` = mittlere Leistung des letzten Arbeitsintervalls gegenüber dem ersten.

**Entscheidung C2.1 (Vorschlag):** RPE ≥ 8 verhindert das Hochstufen, führt aber nicht zu gelb bei allen anderen grünen Kriterien. Begründung: die Systematik, dass subjektive Marker akute und chronische Belastung sensitiver abbilden als objektive, spricht dafür, RPE als Bremse zuzulassen — aber ein einzelner hoher Wert soll eine sauber gefahrene Einheit nicht abwerten.

### C3 — Fortschreibungsregel

Nach jeder gematchten Einheit:

- **grün** → Stufe +1 für die nächste Planung dieses Typs
- **gelb** → Stufe halten
- **rot** → Stufe −1

Gesperrt (Stufe bleibt, unabhängig von der Ampel), wenn eine der folgenden zutrifft:
- laufende Erholungswoche — erkennbar aus der Häufung von `rest`/`recovery`-Karten (D6) statt nur aus der 3:1-Struktur des Blockplans
- Governor-Level rot am Planungstag
- projizierte CTL-Rampe der Folgewoche > 8 Punkte
- bereits eine Hochstufung desselben Typs in dieser Woche erfolgt

**Entscheidung C3.1 (Vorschlag):** Fortschreibung schreibt in `ladder_history`, ändert aber **keine bestehende Plankarte automatisch**. Der Leiterstand ist eine Empfehlung, die im nächsten Export mitgeht; die Karte selbst ändert sich weiterhin nur über einen angenommenen Vorschlag. Begründung: der Import-/Abnahme-Workflow ist der etablierte Schreibweg, und ein zweiter, automatischer Schreibweg auf `plan_cards` würde die Konfliktprüfung aus 5B umgehen.

### C4 — Bedeutung der Presets nach dem Umbau

| Preset | Neue Semantik |
|---|---|
| Aufbau steigern | Stufe +1 vorschlagen, sofern keine Sperre greift |
| Entlasten | Stufe −1 **und** Sperre für zwei Wochen |
| Nur prüfen | keine Stufenänderung, nur Plausibilität gegen Leitplanken |
| Allgemein prüfen | Stufe aus C3 vorschlagen, Trainer darf abweichen mit Begründung |
| Auf Event hin | Leiter läuft bis Taper-Beginn, danach eingefroren |

---

## 4. Fortschritt und Wirkung (4A + 9C)

### F1 — Fortschrittsindikatoren im Briefing (4A)

Neue Briefing-Sektion, rein aus vorhandenen Daten, kein neues Datenmodell:

- **eFTP-Trend** über 8 Wochen, mit Datum des letzten gemessenen Ramp-Tests aus der FTP-Historie
- **Efficiency Factor** (NP / mittlere HF) — nur auf Fahrten mit `typDetected` in Z1/Z2 und Dauer ≥ 60 min, als Trendlinie über 8 Wochen
- **Decoupling** derselben Fahrten; unter etwa 5 % gilt als Hinweis auf tragfähige aerobe Ausdauer
- **Bestwerte** bei 5 min und 20 min der letzten 6 Wochen gegen die 6 Wochen davor

Sinn: zwischen zwei Ramp-Tests liegen bei dir rund fünf Monate. eFTP allein ist zu unruhig, um darauf zu steuern; EF und Decoupling zeigen Basisfortschritt auch dann, wenn die FTP-Zahl steht.

### W1 — Wirkungsanzeige auf der Plankarte (9C)

Jede Plankarte zeigt, was sie in den Werten voraussichtlich bewirkt. Die Zahlen stammen aus `getState().projection`, die die tagesgenauen Werte bereits vorhält — es kommt keine neue Rechenschicht dazu, nur eine Anzeige.

Die Arithmetik macht sichtbar, was am PMC kaum jemand intuitiv hat: **Ermüdung fällt schnell, Fitness fällt langsam.** Ein Tag mit 0 TSS kostet ATL ein Siebtel (14,3 %), CTL nur ein Zweiundvierzigstel (2,4 %).

Beispiel bei CTL 55 / ATL 60:

| | vorher | nach 1 Ruhetag | nach 2 |
|---|---|---|---|
| Fitness (CTL) | 55,0 | 53,7 | 52,4 |
| Ermüdung (ATL) | 60,0 | 51,4 | 44,1 |
| Form (TSB) | −5,0 | +2,3 | +8,3 |

**Umfang:** alle Kartentypen, nicht nur Ruhetage. Dass eine Sweet-Spot-Einheit die Form um zwölf Punkte drückt, ist genauso wissenswert, und die Maschinerie ist dieselbe. Zusätzlich Vorher/Nachher beim Verschieben — die Drag&Drop-Rückmeldung aus Phase 3 existiert bereits und bekommt hier nur Inhalt.

**Entscheidung W1.1 (Vorschlag):** Beschriftung neutral und ausgeschrieben — „Ermüdung −8,6 · Fitness −1,3 · Form +7,3", mit dem Zusatz *modelliert*. **Nicht** „TSB +7" als prominente Einzelzahl. Begründung: eine hervorgehobene Formzahl pro Karte lädt dazu ein, auf TSB hin zu optimieren — genau die Verwendung, vor der die Kritik an diesen Modellen warnt (siehe P2). Als Anschauung für das Verhältnis von Belastung und Erholung ist die Zahl wertvoll, als Zielgröße nicht.

**Entscheidung W1.2:** Die Anzeige hängt an Schritt 3. Solange die TSS/TRIMP-Skalenmischung besteht, zeigte die Karte einen auf gemischter Skala gerechneten Effekt — eine sichtbar falsche Zahl ist schlechter als keine.

---

## 5. Leitplanken (5A + 5B)

### P1 — Briefing-Sektion (5A)

Der Trainer sieht die Grenzen, bevor er plant:

- CTL-Rampe der letzten vier Wochen und projizierte Rampe des Planungshorizonts
- harte Tage pro Woche (Sweet Spot / Schwelle / VO2max)
- kürzester Abstand zwischen zwei harten Tagen im Plan
- Intensitätsverteilung der letzten vier Wochen gegen den Zielkorridor des laufenden Blocks
- Wochen-TSS gegen die Obergrenze CTL × 8

### P2 — Konfliktregeln beim Import (5B)

Neu in `core/conflicts.js`, greifen im Import-Pfad, nicht nur beim manuellen Planen:

| ID | Regel | Schwelle |
|---|---|---|
| K-RAMPE | projizierte CTL-Rampe | Info ab 6, Warnung ab 8 Punkte/Woche |
| K-HARTFOLGE | zwei harte Tage ohne `rest`- oder `recovery`-Karte dazwischen (D6.2) | Warnung |
| K-WOCHENTSS | Wochen-TSS > CTL × 8 | Warnung |
| K-TID | Anteil hoher Intensität außerhalb des Blockkorridors über 4 Wochen | Info |

**Anpassung bestehender Regeln:** K-LEER darf auf Tagen mit `rest`-Karte nicht mehr feuern — ein bewusst freier Tag ist keine Planungslücke. Das ist die einzige Änderung an einer bestehenden Konfliktregel und gehört zu Schritt 1c, nicht zu Schritt 11.

**Alle vier sind Warnungen, keine Ablehnungen.** Das ist die bewusste Fortführung deiner Entscheidung gegen 5C: die zugrunde liegenden Modelle sind Leitplanken, keine kausalen Steuergrößen. Die verwandte Acute:Chronic-Workload-Logik ist methodisch schwer angegriffen — es gibt keine Evidenz für ihren Einsatz als Steuerungsinstrument, und die statistischen Eigenschaften des Quotienten machen ihn ungenau. Ein System, das solche Grenzen hart durchsetzt, tut so, als wären sie belastbarer, als sie sind.

---

## 6. Entscheidungsgedächtnis (6A)

Neue Briefing-Sektion vor der Aufgabenliste:

- die letzten 10 Vorschläge mit Datum, Operation, Status (angenommen / abgelehnt) und der Begründung aus dem Vorschlag
- **Ergänzungsvorschlag über 6A hinaus:** der aktuelle Leiterstand je Sessiontyp plus die zwei Nachbarstufen. Das war ursprünglich 6B und hing an 2C — da 2C jetzt gebaut wird, kostet es fast nichts mehr und ist der eigentliche Grund, warum das Gedächtnis wirkt. Ohne Leiterstand sieht der Trainer nur, *was* entschieden wurde, nicht *wo im Aufbau* er steht. **Zur Abnahme.**

---

## 7. Schrittfolge

Modellkürzel wie gewohnt: `[F5]` Architektur/Security/Debugging, `[SO]` Arbeitspferd, `[HA]` Kleinkram.

| # | Schritt | Modell | Abhängigkeit |
|---|---|---|---|
| 0 | **B0 — Skalenmischung auflösen.** `estimateTss()` mischt echten TSS (Vergangenheit) mit TRIMP-Proxy (Zukunft, 10–20 % zu niedrig). Solange das steht, rechnen alle Rampen- und Steigerungsentscheidungen falsch. | `[F5]` | — |
| 1 | **6A — Entscheidungsgedächtnis.** Letzte 10 Vorschläge ins Briefing. Klein, unabhängig, wirkt ab dem nächsten Export. | `[SO]` | — |
| 1b | **D5 — Test-Events.** Migration `events.is_test`, Feld im Event-Formular, Wirkung in Taper/TSB-Fenster und Ausschluss aus der Familienwahl, Ramp Test 19.09. umsetzen. | `[SO]` | — |
| 1c | **D6 — Ruhetage als Karten.** Typen `rest`/`recovery`, Darstellung im Planungstab, Aufnahme in die Briefing-Plantabelle, K-LEER-Anpassung, Erholungswochen aus dem Plan erkennbar. | `[SO]` | — |
| 2 | **D1 — Workout-Schema.** Migration, Validierung, `workout_structure` in `plan_cards`. Freitext bleibt vorerst führend für die Anzeige. | `[SO]` | 0 |
| 3 | **Berechnung aus Schema.** `computedTss`, `timeInZone_s`, `targetZoneTime_s`; `estimateTss()` nutzt für Karten mit Struktur die Rechnung statt des Typ-Defaults. Schließt B0 für strukturierte Karten endgültig. | `[SO]` | 2 |
| 3b | **W1 — Wirkungsanzeige (9C).** ΔFitness/ΔErmüdung/ΔForm auf allen Plankarten aus `getState().projection`, plus Vorher/Nachher in der bestehenden Drag&Drop-Rückmeldung. | `[SO]` | 3, 1c |
| 4 | **Workout-Ausgabe (1C).** *Vorgeschalteter Verifikationsschritt:* an einem Beispiel prüfen, welche Importwege intervals.icu tatsächlich akzeptiert und wie die Textsyntax genau geparst wird — die Plain-Text-Syntax des Workout-Builders ist nur teilweise offiziell dokumentiert, ZWO/MRC/ERG-Import ist zusätzlich vorhanden. Erst danach den Generator bauen. Ergebnis: kopierbarer Workout-Text je Karte. | `[SO]` | 3 |
| 5 | **C1 — Soll-Ist-Matching.** Zuordnung geplanter Sets zu `ACTIVE`-Blöcken. Architektonisch der heikelste Teil (Schichtgrenze `data-access/` ↔ `core/`, Cache-Verhalten von `interval-blocks.json`). | `[F5]` | 4 |
| 6 | **C2 — Compliance-Score + Ampel** in `data/rides.json`, plus Compliance-Zeile je Ist-Fahrt im Briefing. **STOPP vor Commit:** Vergleichstabelle über alle Fahrten mit Plankartenbezug, wie schon bei der Typerkennung. | `[SO]` | 5 |
| 6b | **Intervalltabelle in der UI** (Vanilla `ui/`): Soll-Ist je Intervall, Fade, Ampel — an der Ist-Fahrt im Planungstab. Dient zugleich der Kalibrierungsprüfung aus Schritt 6. | `[SO]` | 6 |
| 7 | **D4 — Formatkatalog.** Migration `session_formats` + `athlete_formats`, RLS, Startbelegung L2–L7 als Seed-Daten, parametrische Leitergenerierung aus `axes`. | `[SO]` | — (parallel ab 2 möglich) |
| 7b | **`ladder_history`** (Migration, RLS, Tests gegen dashboard-dev) + Familienauswahl im Athletenmenü. | `[SO]` | 7 |
| 7c | **E1 + E2.** Leiterstand-Zeile im Export-Panel; Blockstart-Dialog zur Familienwahl, nur bei echter Auswahl. | `[SO]` | 7b, 1b |
| 8 | **C3 — Fortschreibung + Presets umstellen.** Ampel → Stufenänderung, Sperrregeln, neue Preset-Semantik aus C4. | `[F5]` | 6, 7 |
| 9 | **4A — Fortschrittsindikatoren** als Briefing-Sektion. | `[SO]` | — |
| 10 | **5A — Leitplanken-Sektion** im Briefing. | `[SO]` | 0, 3 |
| 11 | **5B — Konfliktregeln** K-RAMPE / K-HARTFOLGE / K-WOCHENTSS / K-TID im Import-Pfad. | `[SO]` | 10 |
| 12 | **Prompt-Vorlage + Konsistenztest nachziehen.** Vollständiges Schema für `workout_structure` je `op`-Typ, Leiterstand-Semantik, neue Preset-Bedeutung. Bestehenden Konsistenztest erweitern. | `[SO]` | 8, 11 |
| 13 | **3.0-Konzept nachziehen.** Neue UI-Flächen (Intervalltabelle, Leiterstand, Compliance-Ampel) als Portierungsposten in `docs/dashboard-3.0-konzept-react-umbau.md`. Reiner Doku-Commit. | `[HA]` | 6b, 8, 10 |

Parallelisierbar in getrennten Chatfenstern: **0 und 1**, später **7 und 9** neben der Kette 2→3→4→5→6.
Ab Schritt 2 ist es eine echte Kette — 5 ohne 4 zu bauen erzeugt genau die Soll-Ist-Lücke, die das Vorhaben beheben soll.

**Schritt 12 ist nicht optional.** Der Payload-Schema-Bug aus dem Import-Parser-Fall hatte exakt diese Ursache: die Prompt-Vorlage beschrieb die innere Struktur nicht, und der Trainer-Chat lieferte formal korrekt das Falsche.

---

## 8. Abnahmekriterien

1. Eine Sweet-Spot-Karte trägt eine Struktur, aus der TSS, Zeit in Zone und ein importierbarer Workout-Text erzeugt werden — ohne Freitext-Interpretation.
2. Nach einer gefahrenen Intervalleinheit steht im Briefing, wie viele Intervalle erfüllt wurden, wie stark der Fade war und wie die Ampel steht.
3. Der Leiterstand je aktiver Familie ist abfragbar, historisiert und wird aus der Ampel fortgeschrieben — mit nachvollziehbarem `reason`.
4. Eine neue Bauform lässt sich als Katalogzeile anlegen, ohne Code zu ändern — nachgewiesen an einer Familie, die nicht in der Startbelegung steht.
5. Athlet 2 bekommt über den Katalog eine Over-Under-Einheit mit Sprint-Zusatz vorgeschlagen, ohne dass der Sprint in die Compliance-Ampel des Hauptteils zählt.
5b. Der Ramp Test 19.09. setzt ein TSB-Zielfenster und einen kurzen Taper, verändert aber nachweislich weder die aktive Familie noch die Leiterstufe.
5c. Der Blockstart-Dialog erscheint nur, wenn für das Blockziel tatsächlich mehr als eine aktive Familie zulässig ist — sonst gar nicht.
5d. Ein Tag mit `rest`-Karte löst kein K-LEER aus, erfüllt die Trennbedingung von K-HARTFOLGE und wird vom Trainer-Chat bei "Aufbau steigern" nicht zugeplant.
5e. Jede Plankarte zeigt ihre modellierte Wirkung auf Fitness, Ermüdung und Form; beim Verschieben erscheint der Vorher/Nachher-Vergleich.
6. Preset "Aufbau steigern" erzeugt reproduzierbar denselben Vorschlag bei gleicher Datenlage.
7. Alle vier Leitplanken feuern nachweislich beim Import eines verletzenden Vorschlags — als Warnung, nicht als Ablehnung.
8. Prompt-Vorlage und `PROMPT_TEMPLATE` sind über den erweiterten Konsistenztest abgesichert.
9. `npm test` grün gegen den bekannten Stand vorbestehender Fehlschläge.

---

## 9. Bewusst nicht enthalten

- **4B Benchmark-Einheit / 4C Responder-Klassifikation** — nicht gewählt. 4B bleibt als sinnvoller Nachzug denkbar, sobald die Leiter läuft.
- **5C harte Ablehnung** — bewusst verworfen, siehe P2.
- **Automatisches Schreiben auf `plan_cards`** — siehe C3.1.
- **8C — System schlägt Ruhetage selbst vor.** Zurückgestellt bis die Leiter läuft: sonst schlägt das System Ruhetage vor, während der Trainer-Chat gleichzeitig Einheiten vorschlägt, ohne dass geklärt ist, wer gewinnt.
- **Familienauswahl als Kachelreihe im Export-Panel** — geprüft und verworfen, Begründung in L9.
- **E3 (vollautomatische Familienwahl)** — verworfen, Begründung in L9.
- **7C — Seed der Formatfamilien aus der eigenen Historie.** Bewusst zurückgestellt: die Formaterkennung aus realen Intervallstrukturen setzt voraus, dass das Soll-Ist-Matching (Schritt 5/6) seine Datenqualität erst bewiesen hat. Als Nachzug nach Schritt 8 sinnvoll, als Startpunkt riskant.

---

## 10. Einordnung des zu erwartenden Effekts

Ehrlich benannt, damit die Erwartung stimmt: für dein Leistungsniveau ist die Sensitivität gegenüber der Feinsteuerung geringer, als es sich beim Bauen anfühlt. Metaanalytisch führen polarisierte und nicht-polarisierte Verteilungen bei trainierten Radfahrern zu vergleichbaren Verbesserungen, und jenseits eines notwendigen Umfangs bringt mehr Umfang keine zusätzliche Leistung. Der große Hebel bleibt Konsistenz plus saubere Blockstruktur — beides steht bereits.

Der Wert dieses Umbaus liegt in **Reproduzierbarkeit und Nachvollziehbarkeit** der Trainingsentscheidungen: gleiche Datenlage, gleicher Vorschlag, dokumentierte Begründung. Als Portfolio-Argument ist das ohnehin der stärkere Rahmen als ein behaupteter physiologischer Sprung.

---

## 11. Offene Punkte für dich

| ID | Punkt | Vorschlag |
|---|---|---|
| ~~G1~~ | Verhältnis zum React-Umbau | **entschieden: vollständig in der Live-Version, Vanilla, `main`** |
| D1.1 | verschachtelte Sets | nicht unterstützen, flach abbilden |
| D1.3 | Schrittarten `alternating` / `accessory` | neu, für Over-Under und Sprint-Zusatz |
| D1.4 | krumme Over-Under-Reste | ablehnen statt runden |
| D4.1 | `evidence_grade` im Katalog | Pflichtfeld, geht mit ins Briefing |
| D4.2 | Leiter parametrisch statt aufgezählt | Achsen im Katalog, Stufen generiert |
| L6.1 | Sprint-Zusatz in der Ampel | separat führen, nie an VO2max anhängen |
| D5.1 | Test-Event als Feld oder Priorität | eigenes Boolean, `priority` bleibt Rangfolge |
| D5.2 | Altbestand | alles false, Ramp Test 19.09. einmalig gesetzt |
| D6.1 | Ruhetag in der Compliance | ausgenommen; gefahrener Ruhetag als Trainer-Signal |
| D6.2 | Ruhetag als eigene Kategorie | weder hart noch leicht; erfüllt K-HARTFOLGE |
| W1.1 | Beschriftung der Wirkung | ausgeschrieben und neutral, keine prominente TSB-Zahl |
| W1.2 | Reihenfolge | Wirkungsanzeige erst nach Schritt 3 |
| C2.1 | RPE-Wirkung | bremst Hochstufung, wertet grün nicht ab |
| C3.1 | automatische Kartenänderung | nein, Leiterstand ist Empfehlung |
| L4.1 | VO2max bei Governor rot | verschieben statt abschwächen |
| 6A+ | Leiterstand im Gedächtnis | aufnehmen (war 6B, kostet mit 2C fast nichts) |

G1 ist entschieden. Die übrigen fünf sind begründete Vorschläge — Widerspruch reicht, sonst gelten sie als abgenommen.
