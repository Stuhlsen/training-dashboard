# Konzept: Event-Verwaltung (Phase 2, Punkt 2)

> **Ziel:** Rennen/Touren und sonstige Kalendereinträge mit Datum, Priorität und Countdown verwalten — verknüpft mit der "Nächste Einheit"-Karte im Header und den FTP-Zielen.

---

## 1 — Zwei Event-Typen

| Typ | Beispiele | Formziel? |
|---|---|---|
| **Rennen/Tour** | Straßenrennen, Gran Fondo, MyWhoosh-Crit | Ja — Priorität, Countdown, Verknüpfung mit FTP-Ziel |
| **Sonstiges** | Trainingslager, Urlaub, Kurzurlaub ohne Rad | Nein — reiner Kalendereintrag, keine Priorität/Formziel-Logik |

Beide Typen teilen sich Datum und Titel; nur Rennen/Touren haben Priorität, Ziel-FTP-Bezug und tauchen im Countdown/"Nächste Einheit"-Kontext auf. Sonstige Einträge dienen v1 nur der Sichtbarkeit im Kalender (z. B. um zu erklären, warum in der Zeit keine Einheiten geplant sind) — keine Belastungslogik daran gekoppelt.

---

## 2 — Priorität (nur bei Rennen/Touren)

Zwei Stufen, klassisch reduziert auf das Wesentliche:

- **Hauptziel** — das Rennen, auf das der Trainingsblock ausgerichtet ist. Nur eines gleichzeitig sinnvoll pro Zeitraum (v1 keine harte Beschränkung in der DB, aber UI hebt es visuell hervor).
- **Nebenziel** — Formtest, Vorbereitungsrennen, wichtig aber nicht der Fokus.

Keine dritte Stufe (C-Rennen) — laut Entscheidung bewusst schlank gehalten.

**Migrationshinweis:** Die bestehende Spalte `priority` in `0001_initial_schema.sql` ist heute bereits `not null check (priority in ('A','B','C'))` — dreistufig und Pflichtfeld für *jede* Zeile, nicht nur für Rennen. Das ist ein bestehender Zustand, kein Neuentwurf (siehe Abschnitt 3, Migrationsschritt).

---

## 3 — Datenmodell (`events`)

Tabelle existiert bereits aus Phase 0 (laut Fahrplan: "goals, events, wellbeing, plan_cards, proposals, feedback, profiles" wurden in `0001_initial_schema.sql` angelegt) — dieser Punkt **erweitert/nutzt** die bestehende Tabelle, statt sie neu zu erstellen.

**Ist-Stand (`0001_initial_schema.sql:81-89`), geprüft:**

```
events
  id         uuid  pk  default gen_random_uuid()
  athlete_id uuid  fk → profiles.id   not null
  title      text  not null
  event_date date  not null
  priority   text  not null  check (priority in ('A','B','C'))
  note       text  null
  created_at timestamptz default now()
```

Kein `type`, kein `ftp_goal`, kein `updated_at`. `event_date` (nicht `date`) ist der reale Spaltenname — **bleibt unverändert**, keine Umbenennung in der DB. Alle folgenden Abschnitte und die Migration verwenden `event_date`.

**Zielspalten (additiv über `0004_events.sql`):**

```
events
  id           uuid  pk  default gen_random_uuid()          -- unverändert
  athlete_id   uuid  fk → profiles.id   not null            -- unverändert
  title        text  not null                               -- unverändert
  event_date   date  not null                               -- unverändert, Name bleibt
  type         text  not null  check (type in ('race', 'other'))     -- NEU
  priority     text  null      check (priority in ('main', 'secondary'))  -- GEÄNDERT
                                -- nur bei type = 'race' gesetzt, sonst null
  ftp_goal     int2  null                                    -- NEU
  note         text  null                                    -- unverändert
  created_at   timestamptz default now()                     -- unverändert
  updated_at   timestamptz default now()                     -- NEU
```

- `priority`/`ftp_goal` bleiben `null` bei `type = 'other'` — **echter DB-Check-Constraint** (nicht nur Anwendungslogik, s. Abschnitt 4a), analog zum "Default Deny"-Grundsatz aus `0001`.
- `updated_at` + Trigger `set_updated_at()` — das Muster existiert bereits aus `0003_wellbeing.sql` ("ab hier Standardmuster für künftige Tabellen mit `updated_at`"), wird hier übernommen statt neu erfunden.
- Kein `unique`-Constraint auf Datum — an einem Tag können grundsätzlich mehrere Einträge existieren (z. B. ein Trainingslager, das eine Woche überspannt, plus ein Rennen danach), auch wenn v1 keine Mehrtages-Spannen abbildet (siehe Abschnitt 7, offene Frage).

### Migrationsschritt `priority`: NOT NULL/A-B-C → nullable/main-secondary

Die Spalte ist heute Pflichtfeld mit drei Werten für *jede* bestehende Zeile — das Umstellen auf nullable + zwei Werte ist ein **Breaking Change**, kein additiver Schritt, und braucht vor der Migration eine Bestandsaufnahme:

```sql
select priority, count(*) from public.events group by priority;
```

**Gegen `dashboard-dev` auszuführen, bevor `0004_events.sql` geschrieben wird.** Ergebnis entscheidet den weiteren Weg:

- **Keine oder nur ganz wenige Zeilen mit gesetztem `priority`-Wert:** direkte Umstellung ohne Mapping — Spalte droppen/neu anlegen (oder `check`-Constraint ersetzen + betroffene Testzeilen manuell nachziehen).
- **Relevanter Datenbestand vorhanden:** **kein automatisches Mapping** (insbesondere unklar, wie `C` auf `main`/`secondary` abzubilden wäre) — vor der Migration mit dem Athlet/Trainer kurz zurückmelden, welche Zeilen betroffen sind, dann entscheiden.

Dieser Check ist ein Gate: **Migration `0004_events.sql` wird erst geschrieben, wenn das Ergebnis vorliegt.**

---

## 4 — Sichtbarkeit & RLS

Laut Phase-0-Entscheidung **E1**: `goals`, `events`, `plan_cards` sind öffentlich lesbar. Bestätigt gegen den Ist-Stand: Policy `"events: öffentlich lesbar"` (anon+authenticated, `using (true)`) existiert bereits identisch in `0001`. Für `events` gilt also, konsistent mit dem bestehenden Muster:

- **Athlet:** voller Zugriff (read/write) auf eigene Events. *(bereits bestehend, `0001`)*
- **Trainer:** read/write auf die Events *seines* Athleten. *(bereits bestehend, `0001` — s. Abschnitt 5, keine neue Entscheidung)*
- **Admin:** read/write auf alle Events. *(erledigt: eigene additive Policy `"events: Admin schreibt alle"` in `0004_events.sql`, gegen `dashboard-dev` getestet — s. Abschnitt 10)*
- **anon/öffentlich:** lesend, wie bei `goals`/`plan_cards` bereits so gehandhabt — keine Notiz-artige private Spalte hier vorgesehen, `note` ist ein optionales Freitextfeld ähnlich öffentlicher Natur wie der Rest der Zeile (anders als bei `wellbeing.note`, das explizit privat sein musste, weil die Select-Policy dort kein Column-Splitting kennt). Falls das nicht gewünscht ist, wäre eine spaltenweise Einschränkung analog zum Wellbeing-Muster nachrüstbar — für v1 aber nicht vorgesehen, da Events grundsätzlich öffentliche Planungsdaten sind (E1).

### 4a — Nullability-Constraint als echter DB-Check

`priority`/`ftp_goal` dürfen nur bei `type = 'race'` gesetzt sein — das wird als CHECK-Constraint in der Tabelle selbst durchgesetzt, nicht der Anwendung überlassen:

```sql
alter table public.events
  add constraint events_priority_only_for_race
  check (
    (type = 'race') or (priority is null and ftp_goal is null)
  );
```

Grund: RLS und Grants verhindern nicht, dass ein Client (Bug, direkter Supabase-Zugriff) eine `type = 'other'`-Zeile mit gesetztem `priority` schreibt, wenn die Regel nur im UI-Formular steht. Konsistent mit dem "Default Deny"-Grundsatz aus `0001` (Kopfkommentar: "jede Erlaubnis explizit").

---

## 5 — Berechtigungen zum Anlegen/Bearbeiten

**Korrektur:** Athlet- und Trainer-Schreibzugriff auf `events` ist **keine neue Entscheidung dieses Konzepts**, sondern besteht unverändert seit Phase 0 (`0001_initial_schema.sql`, Policy `"events: Athlet+Trainer schreiben"`, `for all`) — identisches Muster wie bei `goals` und `plan_cards`. Das unterscheidet sich zwar bewusst vom `wellbeing`-Pattern (dort schreibt nur der Athlet selbst seine Slider, der Trainer nur lesend inkl. `note`), aber dieser Unterschied existiert bereits seit Phase 0 für alle drei öffentlich lesbaren Tabellen — er wird hier nicht neu eingeführt oder "vorgezogen".

**Tatsächlich neu in diesem Konzept:** der Admin-Schreibzugriff (s. Abschnitt 4) — das war die einzige RLS-Änderung, die `0004_events.sql` bringen musste, und ist erledigt (s. Abschnitt 10).

---

## 6 — Countdown & Verknüpfung mit "Nächste Einheit"-Karte

- **Countdown:** Tage bis zum nächsten *Rennen/Tour*-Event (nicht "sonstige" Einträge) wird berechnet aus `event_date - heute`. Bei mehreren zukünftigen Events zählt das nächste chronologisch, mit visueller Hervorhebung falls es zugleich das nächste Hauptziel ist.
  - **Verhalten am/nach dem Renntag:** Ist `event_date = heute` → Anzeige "Heute!" statt "Noch 0 Tage". Ist `event_date < heute` (Renntag vorbei, Event aber noch nicht gelöscht/aktualisiert) → Event fällt aus der Countdown-Betrachtung raus, das nächste zukünftige Rennen/Tour-Event rückt nach; vergangene Events bleiben in der Event-Liste/Timeline sichtbar (Abschnitt 7), nur der Countdown selbst ignoriert sie.
- **"Nächste Einheit"-Karte (Header, aus dem Header-Redesign):** war bisher an geplante Einheiten aus `plan_cards` gekoppelt. Diese Karte bekommt jetzt zusätzlich Zugriff auf das nächste Event, um z. B. "Noch 12 Tage bis [Hauptziel]" anzuzeigen, wenn kein näherliegendes Plankarten-Datum aussagekräftiger ist. Genaue Kombinationslogik (Einheit vs. Event zuerst anzeigen) ist ein Detail für die Umsetzung, kein architektonischer Konflikt — beide Datenquellen bleiben getrennt (`plan_cards` vs. `events`), nur die Anzeige führt sie zusammen.
- **FTP-Ziele:** `ftp_goal` auf einem Rennen-Event kann optional mit dem bestehenden FTP-Meilenstein-Konzept aus dem Header-Redesign (166/193/197/210 W) abgeglichen werden — z. B. "Ziel-FTP fürs Hauptziel: 210 W, aktuell 197 W". Rein informativ in v1, keine automatische Trainingsplan-Anpassung.

---

## 7 — UI / UX

- **Event-Verwaltung:** im Settings-Panel oder einem neuen Tab — Liste aller Events (Athlet, Trainer, Admin sehen/bearbeiten je nach Berechtigung), sortiert nach Datum, mit Badge für Typ (Rennen/Tour vs. Sonstiges) und bei Rennen zusätzlich Priorität (Hauptziel/Nebenziel) als Badge.
- **Formular:** Titel, Datum, Typ (Toggle Rennen/Tour ↔ Sonstiges) — Priorität und Ziel-FTP-Feld erscheinen nur, wenn Typ = Rennen/Tour gewählt ist.
- **Timeline/Übersicht:** kompakte horizontale oder vertikale Liste kommender Events mit Countdown, ähnlich der bereits bestehenden "Nächste Einheit"-Karten-Ästhetik (Konzept-5-Look).
- **Offene Frage für später (nicht Teil von v1):** Mehrtägige Events (z. B. ein Trainingslager über eine Woche) werden in diesem Konzept nicht abgebildet — nur Einzeldatum. Falls das gebraucht wird, bräuchte `events` zusätzlich ein `end_date`-Feld; als Punkt für `docs/offene-punkte.md` vormerken, falls gewünscht.

---

## 8 — Schichten & Dateien

| Schicht | Datei | Inhalt |
|---|---|---|
| Migration | `supabase/migrations/0004_events.sql` | Additive Spalten (`type`, `ftp_goal`, `updated_at` + Trigger), `priority`-Umstellung (nullable + `main`/`secondary`, s. Abschnitt 3 Migrationsschritt — **erst nach dem Datenbestands-Check**), CHECK-Constraint (Abschnitt 4a), neue Admin-Policy (Abschnitt 10) |
| data-access | `data-access/supabase/events.js` | `listEvents(athleteId)`, `createEvent(athleteId, event)`, `updateEvent(id, patch)`, `removeEvent(id)`, `getNextEvent(athleteId, todayIso, type = "race")` — `todayIso` vom Aufrufer übergeben (analog `wellbeing.js::getToday`), `type: null` hebt den Typ-Filter auf |
| state | `state/events.js` | Events als State, Subscribe/Notify, abgeleiteter Countdown-Wert |
| ui | `ui/event-form.js` | Formular (Modal), Typ-abhängige Feld-Sichtbarkeit |
| ui | `ui/event-timeline.js` | Kompakte Liste/Timeline kommender Events |
| ui | Header-Integration | "Nächste Einheit"-Karte um Event-Countdown erweitern |

Schichtregel bleibt: `core/` → `data-access/` → `state/` → `ui/`.

---

## 9 — Entscheidungen (getroffen)

- **Priorität:** zwei Stufen — Hauptziel / Nebenziel (kein drittes C-Level).
- **Berechtigung Athlet+Trainer:** bereits bestehende Logik seit Phase 0, keine neue Entscheidung (s. Abschnitt 5).
- **Event-Typ:** Rennen/Tour vs. Sonstiges — nur Rennen/Touren haben Priorität, Ziel-FTP und Countdown-Relevanz; Sonstiges ist reiner Kalendereintrag ohne Formziel-Logik.
- **Nullability-Regel** (`priority`/`ftp_goal` nur bei `type='race'`): echter DB-Check-Constraint, nicht Anwendungslogik.
- **Countdown-Verhalten** am/nach Renntag: "Heute!"-Anzeige bei `event_date = heute`, vergangene Events fallen aus der Countdown-Betrachtung, bleiben aber in der Timeline sichtbar.
- **Spaltenname:** `event_date` bleibt unverändert (keine Umbenennung zu `date`).

## 10 — Offene Punkte (für `docs/offene-punkte.md`, falls übernommen)

- ~~Admin-Schreibzugriff auf `events` fehlt in der RLS~~ — **erledigt**: `0004_events.sql` hat die additive Policy `"events: Admin schreibt alle"` ergänzt, gegen `dashboard-dev` getestet (Admin kann Events beliebiger Athleten anlegen/ändern).
- ~~`priority`-Datenbestand in `dashboard-dev` noch nicht geprüft~~ — **erledigt**: Abfrage aus Abschnitt 3 lief am 2026-07-15 gegen `dashboard-dev` ("Success. No rows returned"), kein Bestand vorhanden, direkte Umstellung ohne Mapping in `0004_events.sql` umgesetzt.
- Mehrtägige Events (Start-/Enddatum) sind in v1 nicht abgebildet.
- Genaue Anzeige-Priorität in der "Nächste Einheit"-Karte, wenn sowohl eine geplante Einheit als auch ein Event nah beieinanderliegen, ist ein Umsetzungsdetail, kein Konzeptpunkt — sollte aber beim Bauen kurz festgehalten werden, welche Regel gewählt wurde.
