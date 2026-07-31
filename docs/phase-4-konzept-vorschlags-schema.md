# Phase 4 — Konzept: Vorschlags-Schema (JSON) — einheitlich für Mensch & Claude [F5]

> **Ziel:** Ein Datenvertrag für Plan-Vorschläge, den beide Trainer-Arten identisch
> bedienen: der menschliche Trainer über die App (UI erzeugt das JSON), Claude über
> den Export/Import-Workflow (Claude erzeugt das JSON, der Athlet importiert es).
> Ein Schema, ein Validator, ein Review-Flow.
>
> **Abhängigkeit:** setzt die `plan_cards`-Migration voraus (Phase-3-Konzept §8) —
> Vorschläge referenzieren Karten über deren `id`.

---

## 1. `proposals`-Tabelle

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | |
| `athlete_id` | uuid FK → profiles | wessen Plan |
| `created_by` | uuid FK → profiles | menschlicher Trainer **oder** der Athlet selbst (bei Claude-Import) |
| `source` | text | `trainer` \| `claude` |
| `group_id` | uuid null | fasst zusammengehörige Vorschläge (z. B. Wochenumbau) optisch zusammen |
| `op` | text | `add` \| `replace` \| `move` \| `cancel` (s. §2) |
| `target_card_id` | uuid null | betroffene Karte (null bei `add`) |
| `target_updated_at` | timestamptz null | Stand der Zielkarte bei Erstellung — Veraltet-Erkennung (§4) |
| `payload` | jsonb | vorgeschlagene Kartendaten / neues Datum |
| `reason` | text null | Begründung des Trainers/Claude |
| `status` | text | `open` \| `accepted` \| `rejected` \| `stale` \| `withdrawn` |
| `created_at` / `decided_at` | timestamptz | |

RLS gemäß Trainer-Sicht-Konzept §6: INSERT durch Trainer des Athleten oder den
Athleten selbst; Status-UPDATE nur durch den Athleten; DELETE nur durch den Ersteller
bei Status `open`. GRANTs mitführen.

## 2. Operationen

Eine bewusst kleine Menge — jede Op bildet 1:1 auf eine `plan_cards`-Änderung ab:

- **`add`** — neue Karte. `payload` = vollständige Kartendaten
  (`plan_date`, `title`, `type`, `target_tss`, `km`, `workout`, `note`).
- **`replace`** — bestehende Karte inhaltlich ersetzen. `target_card_id` gesetzt,
  `payload` = die neuen Kartendaten. **Das ist der Vergleichs-Fall (§5).**
- **`move`** — nur Datumswechsel. `payload` = `{ "plan_date": "…" }`.
  Bei Annahme werden `moved_from_date`/`move_reason` gesetzt (Badge wie bei manueller
  Verschiebung).
- **`cancel`** — Karte als ausgefallen markieren. `payload` = `{ "reason": "…" }`.

Kein `delete` als Vorschlag in v1 — Streichen läuft über `cancel` (nachvollziehbar,
umkehrbar); hartes Löschen bleibt eine Athleten-Aktion im CRUD.

## 3. JSON-Format (Import-Datei = Zeileninhalt von `payload` + Metadaten)

```json
{
  "schema_version": 1,
  "athlete": "<athlete_id>",
  "source": "claude",
  "proposals": [
    {
      "op": "replace",
      "target_card_id": "…",
      "target_updated_at": "…",
      "reason": "TSB vor GFNY zu tief — Einheit entschärfen",
      "payload": {
        "title": "Sweet-Spot 2×15",
        "type": "sweetspot",
        "plan_date": "2026-07-21",
        "target_tss": 65,
        "km": null,
        "workout": { "warmup": 15, "intervals": 2, "duration": 15, "rest": 6, "pct": [84, 90], "cooldown": 10, "label": "…" },
        "note": null
      }
    }
  ]
}
```

Der menschliche Trainer erzeugt exakt dieselbe Struktur — nur unsichtbar, durch das
UI. Der Import-Parser und der App-Pfad münden in **denselben** Validator und dieselbe
INSERT-Logik in `data-access/supabase/proposals.js`.

## 4. Validierung (Import-Parser, `core/proposal-validator.js` — rein, testbar)

Reihenfolge: erst Struktur, dann Semantik. Jede Regel liefert einen benannten Fehler;
der Import zeigt alle Fehler gesammelt, nicht nur den ersten.

**Struktur:** `schema_version` bekannt; `op` aus Whitelist; Pflichtfelder je Op;
unbekannte Felder ⇒ **Ablehnung** (kein stilles Ignorieren — Tippfehler in Feldnamen
sollen auffallen, nicht Daten verlieren); reines JSON, Größenlimit, keinerlei
Code-Ausführung.

**Semantik:** `target_card_id` existiert und gehört dem Athleten; `plan_date` nicht in
der Vergangenheit; `type` aus der bekannten Typenliste; `target_tss` in
Plausibilitätsgrenzen (0–400, konfigurierbar); `workout`-Struktur wie im
Push-Generator erwartet (`pct` nötig, sonst später kein Wahoo-Push möglich — als
*Hinweis*, nicht Fehler).

**Veraltet-Erkennung:** Weicht `target_updated_at` vom aktuellen `updated_at` der
Zielkarte ab (Karte wurde seit Erstellung des Vorschlags geändert), wird der Vorschlag
beim Öffnen als **`stale`** markiert — er kann nicht mehr angenommen, nur verworfen
oder vom Ersteller neu gestellt werden. Verhindert, dass ein alter Vorschlag
unbemerkt eine inzwischen andere Karte überschreibt. Dasselbe passiert automatisch mit
konkurrierenden offenen Vorschlägen, sobald einer auf dieselbe Karte angenommen wird.

## 5. Review-Flow im Planungstab

Offene Vorschläge erscheinen als Zähler in der Trainer-Leiste bzw. beim Athleten als
dezenter Banner („3 Vorschläge offen") über dem Plan.

**Vergleichsansicht (Kern des Reviews):** Für `replace` (und `move`/`cancel` in
reduzierter Form) öffnet sich eine Nebeneinander-Darstellung im bestehenden
`.planned-card`-Look:

- links die **aktuelle Karte**, rechts die **vorgeschlagene** — beide vollständig
  gerendert (gleiche Bausteine wie im Plan, inkl. Workout-Badges), Unterschiede
  hervorgehoben (geänderte Felder dezent markiert);
- darunter `reason` des Erstellers und die **Prognose-Auswirkung** aus dem
  Phase-3-Konfliktmodul: „TSB am Eventtag: +6 → +11" plus etwaige Konflikt-Badges —
  der Athlet entscheidet mit denselben Informationen, die der Planer sonst zeigt;
- Aktionen: **„Vorschlag übernehmen"** (Karte wird ersetzt/verschoben, Status
  `accepted`) oder **„Aktuelle behalten"** (Status `rejected`). Bei `add` entfällt die
  linke Seite (nur Vorschau der neuen Karte).

**Direkt ohne Vergleich:** Zwei Abkürzungen für den schnellen Weg —

1. In der Vorschlagsliste hat jeder Eintrag neben „Vergleichen…" einen direkten
   **„Übernehmen"**-Knopf (ohne die Vergleichsansicht zu öffnen);
2. Bei Gruppen (`group_id`) bzw. beim Import gibt es **„Alle übernehmen"** für den
   Fall „ich vertraue dem Umbau, ich will nicht sieben Dialoge klicken".

Annehmen führt die Op transaktional aus (Karte ändern + Status setzen + ggf.
konkurrierende Vorschläge `stale` setzen) — in `data-access/`, nicht im UI.

## 6. Export-Inhalt für den Claude-Trainer (Datenumfang; Workflow-Mechanik = [OP]-Konzept)

Der Export („Briefing") enthält, was auch der menschliche Trainer sieht — gleiche
Sichtbarkeitsregeln, insbesondere T1 (Check-in-Notizen nur bei aktivem Toggle):

Athleten-Profil (FTP, Zonen, Ziele), Events mit Priorität und Countdown, Plan-Fenster
aus `plan_cards` (inkl. `id` + `updated_at` jeder Karte — **Pflicht**, sonst kann
Claude keine gültigen `target_card_id`/`target_updated_at` liefern), Ist-Fahrten der
letzten Wochen (TSS, RPE/Feel), Wellbeing-Slider-Verlauf, aktueller CTL/ATL/TSB samt
Projektion und offener Konfliktliste. Format: Markdown-Briefing für den Menschen im
Loop + maschinenlesbarer JSON-Anhang mit den Karten-IDs.

---

## Getroffene Entscheidungen

- Ein Schema, ein Validator, ein Review-Flow für Mensch und Claude. ✅
- Kein `delete` als Vorschlags-Op — Streichen = `cancel`. ✅
- Unbekannte JSON-Felder führen zur Ablehnung, nicht zum stillen Ignorieren. ✅
- Veraltet-Erkennung über `target_updated_at`; `stale` ist nicht annehmbar. ✅
- Vergleichsansicht alte/neue Karte nebeneinander als Review-Kern; Direkt-Übernahme
  pro Eintrag und „Alle übernehmen" als Abkürzung. ✅ *(Anforderung Athlet)*
- Prognose-Auswirkung (Phase-3-Konfliktmodul) wird im Review angezeigt. ✅
- **V1 — Claude-Importe landen immer als offene Vorschläge im Review-Flow**, mit
  „Alle übernehmen" als Ein-Klick-Abkürzung; keine Review-Umgehung beim Import. ✅
- **V2 — Entschiedene Vorschläge werden unbegrenzt aufbewahrt** — die Historie
  dokumentiert den Trainer-Workflow (Portfolio-Wert), Volumen vernachlässigbar. ✅
