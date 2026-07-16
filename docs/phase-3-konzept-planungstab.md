# Phase 3 — Konzept: Interaktiver Planungstab

> **Ziel:** Trainingskarten hinzufügen / bearbeiten / löschen / per Drag & Drop
> auf einen anderen Tag verschieben. Schreibziel: `plan_cards` (Supabase).
> Technisch anspruchsvollste UI-Phase — Vanilla JS, Pointer Events, kein Framework.
>
> **Vorentscheidungen (bestätigt):**
> - Raster: **nur pro Tag** — eine Karte gehört einem Datum, keine Uhrzeit / kein Tageszeit-Slot.
> - **Kein** globaler „Auf intervals.icu übernehmen"-Button. Sync läuft ausschließlich
>   über den bestehenden per-Karte-Knopf „Auf Wahoo pushen" (§5). Verschieben allein
>   pusht nie.
> - Drop auf **vergangene Tage wird abgewiesen** — kein Plan-neben-Ist-Sonderfall (§6).
>
> **Ist-Stand-Vorbehalt:** Der bestehende Planungstab (`planned.js`) rendert **nicht**
> aus `plan_cards`, sondern aus einer vorhandenen Plan-Struktur (`s.name`/`s.workout`/
> `s.km`, eigenes Datums-„Verschieben"-Formular `.planned-move-form`, per-Karte „Auf
> Wahoo pushen"). Die Frage „bestehenden Plan nach `plan_cards` migrieren oder beide
> Quellen parallel?" ist ein eigenes [F5]-Architekturthema **vor** der Umsetzung — siehe
> §8.

---

## 1. Datenmodell `plan_cards`

Annahme zum Ist-Stand (aus `0001_initial_schema.sql`, vor Umsetzung mit echtem Schema
abgleichen — analog zum `wellbeing`/`events`-Vorgehen der letzten beiden Features):

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | zugleich Basis der intervals.icu-`external_id` (§5) |
| `athlete_id` | uuid FK → profiles | Besitzer der Karte |
| `plan_date` | date | **einziger** Zeitanker (Tag-Granularität) |
| `title` | text | z. B. „Sweet-Spot 3×12" |
| `type` | text | Zonen-/Kategorie-Typ (steuert `border-left`-Farbe, s. §2) |
| `target_tss` | int null | geplanter TSS für die Prognose |
| `km` | int null | geplante Distanz (bestehendes Feld im UI) |
| `note` | text null | Freitext |
| `workout` | jsonb null | strukturierte Blöcke (WU / Intervalle / CD) für pushbare Einheiten |
| `pushed_external_id` | text null | gesetzt, sobald die Karte auf den Wahoo/intervals.icu gepusht wurde (§5) |
| `status` | text | `planned` \| `cancelled` — trägt das bestehende „Ausgefallen"-Feature |
| `cancel_reason` | text null | Grund bei Ausfall (heute in adjustments.json) |
| `moved_from_date` | date null | trägt den bestehenden „Verschoben von …"-Badge inkl. Rückgängig |
| `move_reason` | text null | Grund der Verschiebung |
| `week` | text null | Wochen-Label (z. B. `P2-W3`) für die bestehende Wochen-Gruppierung |
| `phase` | text null | Phasenname der Woche (z. B. „Sweet Spot") |
| `sort_order` | int | Reihenfolge **innerhalb** eines Tages |
| `created_at` / `updated_at` | timestamptz | |

Die Spalten `status`/`cancel_reason`/`moved_from_date`/`move_reason`/`week`/`phase` sind
keine Neuerfindung, sondern die Übersetzung dessen, was der Tab heute schon anzeigt
(Ausgefallen-Sektion, Verschoben-Badge mit Rückgängig, W-Badges) — ohne sie verliert die
Migration sichtbare Features. „Rückgängig" wird zu: `plan_date = moved_from_date`,
`moved_from_date/move_reason = null`.

**Vor der Migration prüfen** (wie bei 0003/0004): existiert die Tabelle schon mit
abweichenden Spaltennamen? Gibt es bereits Zeilen? — bevor Spalten gedroppt/umbenannt
werden. Migration idempotent halten (kein bedingungsloses `drop column`, das auf
`dashboard-prod` still Daten frisst — die Lehre aus 0004).

**RLS:** Athlet schreibt nur eigene Karten; Trainer des Athleten schreibt/schlägt vor
(Phase 4, hier nur mitdenken); öffentlich lesbar (E1 aus Phase 0). GRANTs für
`authenticated` **mitführen** (Root Cause der Phase-1-403er).

---

## 2. UI-Aufbau — bestehenden Look weiterverwenden

Der Planungstab hat bereits sein Design (`planned.css`, Konzept 3 Stufe 5). Phase 3 baut
**darauf auf**, statt ein neues Layout einzuführen:

- Karten bleiben `.planned-card` mit linkem Zonen-Rand (`border-left-color` nach `type`:
  Sweet Spot `#e08a3c`, Schwelle `#d94f4f`, VO2max `#a24ad0`, Z2 `#4a7fa8`,
  Recovery `#4a9a6e`, Gruppenfahrt/FTP-Test `#c9a84c`, Ruhetag/NLS `#6b7280`).
- Kartenkopf `.planned-card-header`: Icon + Name links, `.planned-card-meta` rechts
  (Datum, „Morgen"/„in N Tagen", km).
- Bestehende Blöcke (Wetter, Z2, Recovery, Workout-Badges `.pwb`) und `.planned-card-actions`
  unten bleiben unverändert.
- Wochengliederung `.planned-week` / `.planned-week-badge` (W3 …) bleibt.

**Neu in Phase 3 sind nur zwei Elemente:**
1. ein **Drag-Griff** an der Karte (`ti-grip-vertical`), der den Verschiebe-Modus startet;
2. eine **Drop-Zone** am Zieltag (gestrichelter Rahmen im Akzent, „auf <Tag> ablegen").

Kein dupliziertes CSS — vorhandene Klassen wiederverwenden (die wiederkehrende
Review-Notiz).

---

## 3. CRUD

- **Hinzufügen:** Dialog analog `ui/event-form.js` (Titel, Typ, Ziel-TSS, km, Notiz,
  optional Workout-Blöcke). `plan_date` = angeklickter Tag.
- **Bearbeiten:** gleicher Dialog, vorbefüllt.
- **Löschen:** mit Bestätigung; optimistisches Entfernen, Rollback bei Fehler.
  Wenn die Karte bereits gepusht ist (`pushed_external_id` gesetzt), gilt §5.
- **State:** `state/plan-cards.js` nach dem Muster von `state/events.js` —
  `requestId`-Schutz gegen Race Conditions, `requireUser()`-Guard, lokaler Cache pro
  Athlet, `loadedForAthleteId`-Absicherung gegen Fremd-Karten beim Athletenwechsel.

Das bestehende `.planned-move-form` (Datum manuell wählen) bleibt als **Fallback- und
A11y-Pfad** erhalten — Drag & Drop ist der schnelle Direktweg für denselben Vorgang, kein
Ersatz.

---

## 4. Drag & Drop (Vanilla, Pointer Events)

- `pointerdown` auf den Griff → `setPointerCapture`, Klon als Drag-Ghost, Originalkarte
  halbtransparent.
- `pointermove` → Ghost folgt; Drop-Zone unter dem Zeiger via `elementFromPoint`
  ermitteln und hervorheben.
- `pointerup` → Ziel-Tag bestimmen. Ist es ein **erlaubtes** Ziel (heute oder Zukunft,
  §6): `plan_date` (und ggf. `sort_order`) optimistisch setzen, dann persistieren;
  Rollback bei Fehler. Ist es ein **vergangener** Tag: Drop abweisen, Ghost schnappt an
  die Ausgangsposition zurück (§6).
- **Kein** natives HTML-`draggable` (Touch-schwach, schlechte Kontrolle) — Pointer Events
  decken Maus + Touch + Pen einheitlich ab.
- Kanten-Autoscroll, wenn der Ghost an den Rand der Wochenliste kommt.
- A11y-Fallback: Karte fokussierbar, Verschieben auch per Tastatur (Pfeile + Enter) bzw.
  über das bestehende `.planned-move-form`, damit die Funktion nicht rein
  maus-/touchgebunden ist.

**Prognose bei Verschiebung [F5, eigener Fahrplan-Schritt]:** Verschiebt sich eine Karte,
ändert sich die TSS/CTL-Prognose. Für dieses Konzept nur die Schnittstelle festhalten:
`core/`-Funktion `projectLoad(cards)` → liefert PMC-Vorschau; die UI ruft sie nach jedem
Drop neu auf. Die eigentliche Konfliktlogik ist der nächste Fahrplan-Punkt.

---

## 5. Sync mit intervals.icu / Wahoo (der 4×-Duplikat-Bug)

**Wie der Sync real läuft:** Es gibt **keinen** separaten intervals.icu-Push und **keinen**
globalen „Übernehmen"-Button. Eine strukturierte Einheit wird über den bestehenden
per-Karte-Knopf **„Auf Wahoo pushen"** als **Event** auf intervals.icu geschrieben; der
Wahoo zieht sich das Event von dort. **Verschieben einer Karte allein löst nie einen
externen Call aus** — es ändert nur `plan_cards.plan_date`.

**Ursache des alten Bugs:** Der Push war an das *Datum* gekoppelt und nicht idempotent,
sodass ein Tausch/Verschieben ein zweites Event anlegte (4× statt 1×) und im Fahrtenbuch
nach altem Datums-Mapping zuordnete.

**Lösung — External-ID statt Datum:** intervals.icu-Kalender-Events haben eine `id`
(deren Primärschlüssel) **und eine optionale `external_id`** (unser Schlüssel). Beim
ersten Push setzen wir `external_id = plan_cards.id` und merken sie als
`pushed_external_id`. Jeder weitere Push/Änderung adressiert dasselbe Event über diese ID
→ **Update statt Insert**, kein Duplikat. Event (Plan) und Activity (gefahrene
Aufzeichnung) sind laut API zwei getrennte Records — das Löschen des einen lässt das
andere unberührt, was die Plan-vs-Journal-Trennung sauber stützt.
(Scope `CALENDAR:WRITE` nötig. Genaue API-Feldnamen einmalig per Live-Log verifizieren,
bevor die Mapping-Keys festgeschrieben werden — wie bei RPE/Feel.)

**Offener Verifikationspunkt — Wahoo-Weiterreichung:** Die reine intervals.icu-API kann
ein Event per `external_id` aktualisieren. Ob eine Änderung, die **nach** dem ersten
Wahoo-Sync passiert, sauber auf dem Gerät ankommt, hängt vom Wahoo-Sync-Verhalten ab
(nicht von der intervals.icu-API) und muss **live getestet** werden.

**Regel bis dahin (konservativer Default):** Wird eine bereits gepushte Karte
(`pushed_external_id` gesetzt) verschoben, **warnt** die UI nur — „schon auf Wahoo, dort
ggf. manuell anpassen" — und macht selbst **keinen** externen Call. Sobald der Live-Test
zeigt, dass der Wahoo ein Event-Update zuverlässig übernimmt, kann diese Regel auf
automatisches External-ID-Update hochgezogen werden.

---

## 6. Vergangene Tage — Drop abweisen

Ein vergangener Tag ist entweder bereits gefahren (dann steht das Ist längst über die
read-only-Pipeline da) oder verpasst (dann ist er ohnehin vorbei). Es gibt keinen
praktischen Grund, eine geplante Karte rückwärts zu ziehen.

**Regel:** Drop-Ziele sind **nur heute und zukünftige Tage**. Ein Drop auf einen
vergangenen Tag wird von der Zielspalte nicht angenommen; der Ghost schnappt sichtbar an
die Ausgangsposition zurück. Vergangene Tage werden während des Drags nicht als Drop-Zone
hervorgehoben (gedimmt).

Damit entfällt jede Plan-neben-Ist-Kollisionslogik — „Plan" bleibt zukunftsgerichtet
(schreibt nach intervals.icu), „Journal" bleibt vergangenheitsgerichtet (liest aus
intervals.icu), und ein Vergangenheits-Drop kann den Sync-Bug gar nicht erst auslösen.

---

## 7. Edge Cases für die Tests (Fahrplan-Punkt „Tests inkl. Edge Cases")

- Zwei Karten am selben Tag → `sort_order` stabil, Drag innerhalb des Tages sortiert um.
- Drop auf denselben Tag (kein Datumswechsel) → kein Schreibvorgang, kein Sync.
- Drop in die Vergangenheit → abgewiesen, Ghost kehrt zurück (§6).
- Verschieben einer bereits gepushten Karte → Warnung, kein externer Call (§5).
- Athletenwechsel mitten im Drag → Drag abbrechen, keine Fremd-Karte schreiben.
- Schreibfehler → optimistische Änderung rollt zurück, Karte kehrt sichtbar zurück.
- Doppel-Drop / schneller Zweitklick → `requestId`-Guard verhindert Doppelschreibung.

---

## 8. Architektur [F5] — Datenquelle des Planungstabs

### 8.1 Ist-Architektur (Befund aus `planned.js`)

Der Plan ist heute **kein** eigenständiger Datenbestand, sondern ein zur Renderzeit
zusammengesetztes Konstrukt aus drei Schichten:

1. **Basisplan im Code:** `Data.plannedSessions` stammt aus Plan-Definitionen in
   JS-Dateien (z. B. `plan-athlete2.js`). Sessions tragen `name`, `date`, `week`
   (`P2-W3`), `workout` (WU/Intervalle/CD mit `pct`), `km`, `details`.
2. **Änderungs-Overlay per GitHub-Commit:** Verschiebungen/Ausfälle liegen in
   `data/adjustments.json` (Athlet 1) bzw. `adjustments-2.json` (Athlet 2, über den
   `_canEdit()`-Pfad-Switch) und werden per `writeRepoFile()` **aus dem Browser als
   Commit ins Repo geschrieben**. `applyAdjustment(session, adjustments)` merged beides
   beim Rendern.
3. **Push in der falschen Schicht:** Der Wahoo-Push ist ein direkter `fetch` auf
   `POST /athlete/{id}/events` **innerhalb von `ui/planned.js`** — ein Verstoß gegen die
   eigene Schichtenarchitektur (externe API-Calls gehören nach `data-access/`). Der
   Duplikat-Guard `_findExistingEvent()` matcht heuristisch über
   **Name + Datum + Description**; der Code-Kommentar benennt selbst, dass keine externe
   Referenz-ID im Payload steckt. **Das ist die Wurzel des 4×-Bugs:** verschobene Session
   → anderes Datum → Heuristik findet das alte Event nicht → neues Event entsteht, das
   alte bleibt.

### 8.2 Optionen

**M-A — Vollmigration (eine Quelle):** Basisplan + adjustments werden einmalig
materialisiert nach `plan_cards` überführt (eine Zeile pro Session, mit effektivem
Datum + Verschiebe-/Ausfall-Historie in den §1-Spalten). `planned.js` wechselt seine
Datenquelle auf `state/plan-cards.js`; adjustments.json und `writeRepoFile`-Schreibpfad
werden für die Planung stillgelegt.

**M-B — `plan_cards` als Overlay:** Basisplan bleibt im Code, `plan_cards` ersetzt nur
adjustments.json (Deltas in Supabase statt im Repo). Geringste Migration — aber
**Hinzufügen und Löschen von Karten ist gegen einen einkompilierten Basisplan nicht
sauber abbildbar** (Lösch-Tombstones, Add-Karten ohne Basiszeile, zwei Merge-Semantiken).
Das Kernziel von Phase 3 (volles CRUD) bliebe verkrüppelt.

**M-C — Parallel:** `plan_cards` nur für neue Karten, alter Plan bleibt. Zwei Wahrheiten
im selben Tab, Merge- und Divergenz-Komplexität ohne Endzustand. Abgelehnt.

### 8.3 Empfehlung: M-A, Vollmigration

- Nur M-A macht Karten zu **First-Class-Entities** — Voraussetzung für CRUD und Phase 4
  (Trainer-Vorschläge referenzieren Karten-IDs).
- Die GitHub-Commit-Schreibmechanik entfällt für die Planung: kein Token-basiertes
  Repo-Schreiben aus dem Browser, kein Commit-Noise, keine Raw-Fetch-Cache-Latenz.
- RLS + `athlete_id` ersetzen den `_canEdit()`-Pfad-Hack (adjustments vs. adjustments-2)
  strukturell.
- Der Push-Umbau auf `external_id` (§5) muss den Push-Code ohnehin anfassen — der Umzug
  von `ui/planned.js` nach `data-access/` (z. B. `data-access/intervals/push.js`)
  geschieht im selben Zug und heilt den Schichten-Verstoß.
- Dev/Prod-Risiko ist begrenzt: Prod (main) läuft bis zum Merge von `dashboard-2.0`
  unverändert auf dem alten Mechanismus; die Migration passiert zuerst gegen
  `training-dashboard-dev`. Eine echte Parallelphase im selben Build gibt es nicht.

### 8.4 Migrationsweg (Skizze)

1. Einmaliges Skript `scripts/migrate-plan-to-supabase.js` (Node): liest
   Plan-Definitionen beider Athleten + beide adjustments-Dateien, wendet
   `applyAdjustment()` an, schreibt pro Session eine `plan_cards`-Zeile (effektives
   `plan_date`, Historie in `moved_from_date`/`move_reason`/`status`/`cancel_reason`,
   `week`/`phase`-Labels, `workout` als jsonb). Erst gegen dashboard-dev, verifizieren,
   dann prod beim Rollout.
2. `state/plan-cards.js` + `data-access/supabase/plan-cards.js` (Muster `events.js`).
3. `planned.js` behält Rendering/Look, tauscht nur die Quelle:
   `Data.plannedSessions + applyAdjustment` → Selektoren aus `state/plan-cards.js`.
   Wetter-/Recovery-Blöcke bleiben unverändert (Lesedaten, Join über Datum).
   Erledigt-Vergleich matcht Rides weiterhin über Datum.
4. Push-Code zieht nach `data-access/`, `_findExistingEvent`-Heuristik wird durch
   `external_id = plan_cards.id` ersetzt (§5).
5. adjustments.json/-2.json: Schreibpfad stilllegen; Dateien bleiben als Archiv im Repo
   (Historie), `applyAdjustment()`-Aufruf im Tab entfällt.

### 8.5 Getroffene Entscheidungen ✅

- **M1 — Migrationsumfang: alle Sessions** (auch erledigte/vergangene/ausgefallene) —
  Erledigt-Vergleich, Verpasst-Sektion und Fortschrittsstatistik speisen sich damit aus
  derselben Quelle wie der Plan; keine Parallel-Quelle durch die Hintertür. ✅
- **M2 — adjustments.json: archivieren** (bleibt read-only im Repo als Historie);
  Schreibpfad wird stillgelegt, die inhaltliche Historie lebt in den §1-Spalten weiter. ✅
- **M3 — Push-Umzug im Zuge der Migration:** `data-access`-Umzug + `external_id`-Umbau
  in einem Schritt, da beides dieselben Funktionen anfasst. ✅

---

## Offene Punkte → `docs/offene-punkte.md`

- Wahoo-Weiterreichung eines `external_id`-Event-Updates live verifizieren (§5); danach
  ggf. konservative Warn-Regel auf Auto-Update hochziehen.
- `external_id`-Feldname/Push-Payload einmalig per Live-Log gegen die echte API prüfen.
- `projectLoad()`-Konfliktlogik ist eigener Fahrplan-Punkt [F5] — hier nur Schnittstelle.
- A11y-Tastatur-Verschieben: in v1 oder nachgezogen (Fallback über `.planned-move-form`
  besteht bereits)?
