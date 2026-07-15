# Konzept: Morgen-Check-in (Phase 2, Punkt 1)

> **Ziel:** Ein kurzes tägliches Selbst-Check-in (3 Slider + optionale Notiz), das ein subjektives Bereitschaftssignal liefert — gekoppelt an die **Belastungsempfehlung** und auch an **Ruhetagen** verwertbar.
>
> **Scope-Abgrenzung:** Dieses Konzept definiert das Feature selbst (Datenmodell, UI, Sichtbarkeit) **und den Vertrag** zur Belastungsempfehlung. Die *tiefe* Verrechnung ist der eigene spätere Phase-2-Punkt „Belastungsempfehlungs-Logik um Befinden erweitern" **[OP]** und hängt am `core/readiness.js`-Refactor. Hier wird das Zusammenspiel entworfen, dort implementiert.

---

## 1 — Warum ein Morgen-Check-in

Drei Nutzen, die die objektiven Daten (TSB, RHR, HRV) **nicht** abdecken:

1. **Subjektive Bereitschaft** — RHR/HRV/TSB erklären, was der Körper *messbar* tut; sie erfassen nicht, wie sich der Athlet *fühlt*. Beides zusammen ist aussagekräftiger als jedes für sich.
2. **Ruhetag-Datenpunkt** — an Ruhetagen gibt es keine neue Fahrtdaten und der TSB steigt ohnehin. Genau hier lieferte die alte, rein TSB-basierte Logik das unpassende „Erholung priorisieren", obwohl schon Ruhetag ist. Der Check-in gibt an solchen Tagen das *primäre* Tagessignal.
3. **Längsschnitt** — auch ohne Kopplung entsteht eine tägliche Zeitreihe (Energie/Muskel/Stimmung), die sich später im Charts-Tab gegen Leistung/Belastung plotten lässt (Trend über einen Block, Frühwarnung vor Formeinbrüchen).

---

## 2 — Die drei Slider

Skala **1–5**, durchgängig „**höher = besser**" (vermeidet Vorzeichen-Verwirrung in der Verrechnung), neutraler Default **3**.

| Slider | 1 | 3 (Default) | 5 |
|---|---|---|---|
| **Energie** | ausgelaugt | normal | voll da / spritzig |
| **Muskelgefühl** | schwer / platt / Muskelkater | neutral | frisch & locker |
| **Stimmung** | mies / gereizt | ausgeglichen | top / motiviert |

+ **Notiz** (optional, Freitext) — z. B. „Kopf dicht, evtl. was im Anflug".

> **Schlaf bewusst kein Slider:** Schlaf ist bereits als Chart vorhanden und lässt sich als **gemessener Schlafscore über die intervals.icu-API** ziehen. Er gehört damit in den **objektiven** Kanal (wie RHR/HRV/TSB), nicht in die subjektive Selbstauskunft — so wird nichts doppelt erfasst. Das gefühlte Morgen-Ausgeruhtsein deckt der **Energie**-Slider ab; die gemessene Schlafqualität kommt aus den Daten.
>
> **Warum diese drei:** Energie und Muskelgefühl sind am direktesten trainingsrelevant, Stimmung liefert den Motivations-/Stress-Kontext. Ein optionaler 4. Slider (Stress oder Motivation, wie in intervals.icu) bleibt als **Entscheidung D2** offen — v1 startet schlank mit dreien.

---

## 3 — Datenmodell (`wellbeing`)

Tabelle existiert aus Phase 0; hier die konkrete Spalten-/Constraint-Festlegung:

```
wellbeing
  id           uuid  pk  default gen_random_uuid()
  athlete_id   uuid  fk → profiles.id   not null
  date         date  not null                     -- lokales Datum des Check-ins
  energy       smallint  check (1..5)
  muscle_feel  smallint  check (1..5)
  mood         smallint  check (1..5)
  note         text  null
  created_at   timestamptz default now()
  updated_at   timestamptz default now()

  unique (athlete_id, date)                        -- genau ein Eintrag pro Tag
```

- **Upsert** auf `(athlete_id, date)` — der Check-in ist über den Tag hinweg **editierbar** (Slider nachziehen, Notiz ergänzen), es entsteht keine zweite Zeile.
- `updated_at` per Trigger oder im Client mitschreiben.

---

## 4 — Sichtbarkeit & RLS (setzt E2 um)

E2 aus Phase 0: **Slider öffentlich nur, wenn der Athlet es erlaubt — Notiz nie öffentlich.**

- `profiles.wellbeing_public boolean default false` — Toggle pro Athlet (im Settings-Panel).
- **Zeilen-Policy (RLS):**
  - Athlet: voller Zugriff (r/w) auf **eigene** Zeilen.
  - Coach: **lesend** auf die Zeilen *seines* Athleten (inkl. Notiz) — über die bestehende Athlet↔Trainer-Zuordnung.
  - `anon`/öffentlich: lesend nur, wenn `wellbeing_public = true` beim Athleten.
- **Notiz nie öffentlich — an der Wurzel absichern (nicht nur im Client filtern):**
  Spalten-GRANT für `anon` *ohne* `note`:
  ```sql
  grant select (date, energy, muscle_feel, mood) on wellbeing to anon;
  -- KEIN select-Recht auf note für anon
  ```
  So kann selbst ein manuell gebauter Request die Notiz öffentlich nicht ziehen. Athlet und Coach lesen `note` regulär.

> ⚠️ **Phase-1-Lehre mitführen:** GRANTs waren die Root Cause der 403er. In der Migration die GRANTs (inkl. der **spaltengenauen** anon-Rechte) explizit mitschreiben — nicht nur RLS-Policies.

---

## 5 — Kopplung an die Belastungsempfehlung (Kernstück)

### 5.1 Zwei Kanäle
- **Objektiv** — TSB, Schlafscore (intervals.icu) (+ nach readiness-Refactor: RHR, HRV, Datenaktualität).
- **Subjektiv** — der Check-in.

Jeder Kanal erzeugt ein Level: **grün / gelb / rot**.

Subjektiv-Level (v1 gleichgewichtetes Mittel der drei Slider, Schwellen in geteilter Config, damit tunbar):
- Mittel **≥ 4,0** → grün
- **2,75 – 3,99** → gelb
- **< 2,75** → rot

### 5.2 Governor-Prinzip (die entscheidende Design-Regel)

Subjektiv wird **nicht gleichgewichtet gemittelt**, sondern wirkt **asymmetrisch als Sicherheits-Regler**:

> **Subjektiv darf jederzeit frei nach unten ziehen (Selbstschutz), aber höchstens um eine Stufe nach oben — und nie in Grün, wenn Objektiv rot ist.**

Begründung: „Ich fühl mich matt" ist ein starkes, schützendes Signal und soll auch bei frischem TSB Vorsicht auslösen. „Ich fühl mich super" darf angesammelte Ermüdung (tief negativer TSB, erhöhter RHR, gedrückte HRV) **nicht** wegwischen.

| Objektiv ↓ / Subjektiv → | **grün** | **gelb** | **rot** |
|---|---|---|---|
| **grün** | grün | gelb | gelb *(Warnhinweis; rot, wenn Notiz + klar rot)* |
| **gelb** | gelb | gelb | rot |
| **rot** | rot *(nie grün)* | rot | rot *(starkes Signal, ggf. Infekt-Frühwarnung)* |

### 5.3 Ruhetag-Fall
An Ruhetagen ist Objektiv oft „grün/erholt" ohne neue Fahrtdaten. Dann führt der Check-in:
- **subjektiv grün** → „bereit — morgen kann Belastung folgen" (statt redundantem „Erholung priorisieren").
- **subjektiv rot bei objektiv erholt** → Frühwarnung (möglicher Infekt / non-funktionelles Overreaching) → „Ruhe verlängern / beobachten", **nicht** „trainieren".

### 5.4 Aktualität (fügt sich ins geplante Confidence-Modell)
Der Check-in-Kanal hat einen eigenen Freshness-State — deckungsgleich mit dem für readiness.js geplanten `vorhanden / ausstehend / veraltet`:
- heutiger Eintrag → **vorhanden**
- nur gestriger → **veraltet** (fließt abgeschwächt/gar nicht ein)
- keiner → **ausstehend** → Fallback auf rein objektiv + UI-Hinweis „Befinden ausstehend".

### 5.5 Vertrag zu `core/readiness.js`
Der Check-in exponiert eine reine Funktion; die Governor-Verrechnung passiert in readiness.js (= der spätere [OP]-Punkt):

```js
getSubjectiveReadiness(athleteId, date) → {
  score:      number | null,          // Mittel 1..5, null ohne Eintrag
  level:      'gruen' | 'gelb' | 'rot' | null,
  freshness:  'vorhanden' | 'veraltet' | 'ausstehend',
  components: { energy, muscleFeel, mood }
}
```

readiness.js kombiniert `level` mit dem objektiven Level per Governor-Tabelle (5.2) und respektiert `freshness`.

---

## 6 — UI / UX

- **Einstiegspunkt (immer sichtbar):** kleine **Befinden-Karte** im Übersichts-Tab mit Tagesstatus — „heute erfasst ✓" bzw. „Check-in offen". Klick öffnet den Dialog.
- **Sanfter Auto-Prompt (Entscheidung D4):** beim ersten Laden am Tag, wenn noch kein Eintrag existiert, optional einmalig ein Dialog — **dismissbar, blockiert nie, kein Zwang**. „Überspringen" ist immer erlaubt (ein ausgelassener Tag ist ein gültiger Zustand, kein Fehler).
- **Nur eingeloggt & nur für den Athleten:** Besucher (Portfolio-Charakter, Athleten-Toggle bleibt frei) werden **nie** zum Check-in aufgefordert.
- **Editierbar:** Dialog jederzeit wieder öffenbar (Übersichts-Karte oder Settings-Panel „Befinden anpassen"), Upsert auf dieselbe Zeile.
- **Dialog:** Modal (konsistent mit Phase-1-Entscheidung „kein Router"), Konzept-5-Look (`#0b0e13`, Akzent `#e08a3c`, Sora/IBM Plex Mono/Inter). Drei Slider, ein Notizfeld, Speichern/Überspringen.

---

## 7 — Schichten & Dateien

| Schicht | Datei | Inhalt |
|---|---|---|
| Migration | `supabase/migrations/0003_wellbeing.sql` | Spalten/Constraints, RLS-Policies, **GRANTs inkl. spaltengenauer anon-Rechte** |
| data-access | `data-access/supabase/wellbeing.js` | `getToday`, `upsertToday`, `getRange` |
| state | `state/wellbeing.js` | heutiger Check-in als State, Subscribe |
| ui | `ui/checkin-dialog.js` | Modal (3 Slider + Notiz) |
| ui | Übersicht-Renderer | Befinden-Statuskarte |
| ui | `ui/settings-panel.js` | „Befinden anpassen" + `wellbeing_public`-Toggle |
| core | `core/readiness.js` | subjektiver Kanal + Governor *(Großteil = späterer [OP]-Punkt)* |
| pipeline | `generate-data.js` | Schlafscore aus intervals.icu ziehen → objektiver Kanal *(eigener [SO]-Punkt in Phase 2)* |

Schichtregel bleibt: `core/` → `data-access/` → `state/` → `ui/`. readiness.js (core) konsumiert nur die reine Vertragsfunktion, kennt kein Supabase.

---

## 8 — Entscheidungen (getroffen)

- **D1** ✅ — Skala **1–5** („höher = besser", Default 3).
- **D-Schlaf** ✅ — Schlaf **kein** Slider; als gemessener Schlafscore über intervals.icu in den objektiven Kanal (siehe Abschnitt 2).
- **D2** ✅ — Start mit **drei** Slidern (Energie, Muskelgefühl, Stimmung); optionaler 4. (Stress/Motivation) später nachrüstbar.
- **D3** ✅ — **Governor-Asymmetrie** aus 5.2 (subjektiv frei runter, max. 1 Stufe hoch, nie Grün bei Objektiv-Rot).
- **D4** ✅ — Übersichts-Karte immer sichtbar **plus** sanfter, dismissbarer Auto-Prompt (kein Zwang).
- **D5** ✅ — Notiz-Schutz über **spaltengenaue anon-GRANTs** (nicht nur Client-Filter).
- **D6** ✅ — Slider-Gewichtung v1 **gleichgewichtet**; Gewichte als Config-Werte offen.

---

## 9 — Danach in Phase 2

Nach diesem Konzept: Mockup Check-in-Dialog **[SO]** → Umsetzung `wellbeing` + Dialog **[SO]** → dann der separate **[OP]**-Punkt „Belastungsempfehlungs-Logik um Befinden erweitern" (Governor real in readiness.js). Parallel-Strang bleibt Event-Verwaltung / Timeline.

---

## 10 — Offener Punkt: öffentliche Anzeige (`wellbeing_public`)

`profiles.wellbeing_public` und die `wellbeing_shared`-View (Phase 1 bzw. Migration 0003) sind DB-seitig fertig und getestet — `anon` kann `date/energy/muscle_feel/mood` lesen, wenn der Athlet den Toggle aktiviert hat, `note` nie. Es gibt aber **noch keinen Frontend-Konsumenten**: `data-access/supabase/wellbeing.js` fragt ausschließlich den authentifizierten Client für den eigenen heutigen Check-in ab, keine Funktion liest `wellbeing_shared` für einen fremden/betrachteten Athleten. Die „Befinden heute"-Karte (Abschnitt 6) ist bewusst nur für den eingeloggten Athleten selbst gedacht, nicht für Besucher — der Toggle hat dadurch aktuell sichtbar **keinen Effekt** im UI.

Eigener späterer Punkt mit eigenem kurzen Konzept/Mockup: was genau zeigt die öffentliche Ansicht (nur „heute"? Verlauf? in welchem Tab?), bevor Umsetzung.
