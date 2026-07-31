# Phase 3 — Konzept: Konfliktlogik & TSS/CTL-Prognose bei Verschiebung [F5]

> **Ziel:** Wenn eine Trainingskarte verschoben, angelegt, geändert oder gelöscht wird,
> zeigt der Planer sofort, was das mit der Belastungskurve macht — und warnt bei
> riskanten Konstellationen. **Warnen, nie blockieren:** der Athlet behält immer das
> letzte Wort; die Logik ist Beratung, kein Gatekeeper.
>
> **Abgrenzung zum Governor (Phase 2):** Der Governor bewertet *heute* anhand von
> Befinden (Slider) + Ist-Last. Die Konfliktlogik bewertet die *Zukunft* rein
> lastbasiert — für zukünftige Tage existieren keine Befinden-Daten, also fließen sie
> hier bewusst nicht ein. Beide teilen sich `core/`, aber keine Signale.

---

## 1. Rechenkern: PMC-Projektion

Standard-PMC-Fortschreibung (Coggan), pro Tag ab heute:

```
CTL[t] = CTL[t-1] + (TSS[t] − CTL[t-1]) / 42
ATL[t] = ATL[t-1] + (TSS[t] − ATL[t-1]) / 7
TSB[t] = CTL[t-1] − ATL[t-1]        (Form am Morgen des Tages t)
```

- **Startpunkt:** letzter Ist-Wert CTL/ATL aus den Lesedaten (intervals.icu-Pipeline,
  `data/*.json`). *Abgleichpunkt vor Umsetzung:* liegen CTL/ATL dort bereits als Felder
  vor (PMC-Chart speist sich ja irgendwoher), oder müssen sie aus der TSS-Historie
  einmal initial mitgerechnet werden? Beides ist möglich, Ersteres bevorzugt.
- **Input Zukunft:** `plan_cards` des Athleten mit `status ≠ cancelled`, aggregiert als
  TSS pro Tag (mehrere Karten am Tag summieren). Tage ohne Karte = 0 TSS.
- **Horizont:** heute bis zum letzten geplanten Tag, mindestens aber bis zum nächsten
  Event (aus der `events`-Tabelle), plus 7 Tage Nachlauf.
- **Reine Funktion, `core/projection.js`:**
  `projectLoad({ startCtl, startAtl, days: [{date, tss}] }) → [{date, ctl, atl, tsb}]`
  — kein DOM, kein Supabase, voll testbar (Muster `core/briefing.js`).

## 2. TSS-Herkunft pro Karte

Prioritätskette, erste vorhandene Quelle gewinnt:

1. `target_tss` der Karte (explizit gesetzt);
2. Schätzung aus `workout` (Dauer × Intensität aus `pct`-Bereichen, klassische
   TSS-Formel über %FTP);
3. **Typ-Default** für Karten ohne beides (z. B. Gruppenfahrt „HF frei"):
   konfigurierbare Tabelle in `core/config`, **initial aus den Ist-Fahrten kalibriert**
   (Median TSS pro Typ aus den Lesedaten; die Auswertung läuft als Nebenprodukt im
   Migrationsskript aus dem CRUD-Konzept §8.4 mit).

Karten mit geschätztem TSS werden in der Prognose als **unsicher markiert** (die UI kann
das z. B. als „~" vor dem Wert zeigen) — die Kurve soll nicht präziser aussehen, als die
Datenlage ist.

## 3. Konfliktregeln (v1)

Jede Regel liefert `{severity: "hinweis" | "warnung", date(s), message}`. Schwellen sind
**Konfig-Defaults in `core/config`**, keine Magic Numbers im Code.

| # | Regel | Default-Schwelle | Severity |
|---|---|---|---|
| K-TSB | Projizierter TSB unterschreitet Tiefwert | TSB < −30 an einem Tag | Warnung |
| K-TSB2 | Anhaltend tiefer TSB | TSB < −20 an ≥ 3 Folgetagen | Warnung |
| K-HART | Harte Einheiten an Folgetagen | 2 harte Tage direkt hintereinander | Hinweis; ab 3 Warnung |
| K-RAMPE | Wochen-TSS-Sprung | > +20 % gegenüber Vorwoche (Ist bzw. Plan) | Hinweis |
| K-EVENT | Form am Eventtag außerhalb Zielfenster | A-Event: TSB nicht in +5…+20; B-Event: nicht in −5…+15 | Warnung (A) / Hinweis (B) |
| K-LEER | Harte Einheit direkt nach Ruhetag-Block ≥ 3 Tagen | — | Hinweis |

**Intensitätsklassen** für K-HART aus `type` (deckungsgleich mit den
`border-left`-Farben aus dem CRUD-Konzept §2): *hart* = Schwelle, VO2max, Sweet Spot,
FTP-Test; *moderat* = Z3/Tempo, Gruppenfahrt; *locker* = Z2, Recovery; *Ruhe* = Ruhetag/NLS.

Die Regelliste ist bewusst kurz — v1 soll wenige, verständliche Konflikte zuverlässig
melden statt viele halbgare. Erweiterungen (z. B. Monotonie/Strain nach Foster) sind
Phase-5-Material.

## 4. UI-Verhalten — zweistufig

**Stufe 1 — live während des Drags (Folgeschritt nach v1, siehe K2):** Die Projektion
ist O(Tage) reine Arithmetik; beim `pointermove` wird für den Tag unter dem Zeiger die
Projektion mit der Karte *an diesem Tag* gerechnet. Die Drop-Zone färbt sich:

- neutral/Akzent — kein Konflikt,
- gelb — mindestens ein Hinweis,
- rot — mindestens eine Warnung.

Rot **verhindert den Drop nicht** (Grundsatz oben) — es informiert nur. Kein
Text-Tooltip während des Drags (zu hektisch), nur Farbe.

**Stufe 2 — nach dem Drop (erklärend):** Kompaktes Feedback unterhalb der betroffenen
Woche bzw. als dezenter Banner:

- Delta-Zeile: „TSB am Eventtag (GFNY, 14.09.): +12 → +6" — nur wenn ein Event im
  Horizont liegt;
- Konflikt-Badges an den betroffenen Karten/Tagen im bestehenden Badge-Stil
  (`.planned-moved-badge`-Optik, gold für Hinweis, rot für Warnung), mit Meldungstext;
- Badges verschwinden, wenn der Konflikt durch weitere Änderungen aufgelöst ist
  (Neuberechnung nach jedem CRUD-Vorgang, nicht nur nach Drops).

**Nicht in v1:** eine eingebettete Mini-PMC-Kurve im Planungstab. Die Prognosekurve als
Chart gehört in Phase 5 (explorative Ansichten, What-if) — hier reichen Zahlen + Badges.

## 5. Schnittstellen & Dateien

- `core/projection.js` — `projectLoad()` (reine PMC-Fortschreibung) +
  `estimateTss(card, config)` (Prioritätskette §2).
- `core/conflicts.js` — `detectConflicts({projection, cards, events, config})` →
  Konfliktliste. Ebenfalls rein & testbar.
- `state/plan-cards.js` ruft nach jedem CRUD/Drop beides auf und legt das Ergebnis als
  abgeleiteten State ab; `ui/` rendert nur.
- Konfig-Defaults (Schwellen, Typ-TSS-Tabelle, Event-Zielfenster) in `core/config` beim
  bestehenden Governor-Block.

## 6. Tests

- `projectLoad()`: bekannte Zahlenbeispiele (handgerechnet) für CTL/ATL/TSB-Verlauf;
  Grenzfälle leerer Plan, ein Tag, langer Horizont.
- `estimateTss()`: alle drei Prioritätsstufen + Unsicher-Flag.
- `detectConflicts()`: je Regel ein Positiv- und ein Negativ-Fall; Verschiebung, die
  einen Konflikt *auflöst*; zwei Regeln am selben Tag.
- Kein UI-Test für die Drag-Färbung in v1 (manueller Check), aber die Farbstufen-
  Ableitung (Konfliktliste → neutral/gelb/rot) als reine Funktion testen.

---

## Getroffene Entscheidungen

- Warnen statt blockieren — Drops werden nie verhindert. ✅
- Befinden fließt nicht in die Zukunftsprognose ein (Governor-Abgrenzung). ✅
- Keine Mini-PMC-Kurve im Planungstab; Chart-Ansicht ist Phase-5-Material. ✅
- **K1 — Schwellenwerte: Defaults aus §3 übernehmen.** Coggan-Richtwerte als
  konservativer Start; nach Abschluss von Plan 2 einmal gegen die Ist-Daten reviewen
  (persönliche Kalibrierung braucht mehr Historie). ✅
- **K2 — v1 nur mit Nach-Drop-Feedback (Stufe 2).** Die Drag-Live-Färbung (Stufe 1)
  folgt als eigener Polish-Schritt nach v1 — sie setzt nur noch auf die dann fertigen,
  getesteten Funktionen (`projectLoad` + Farbstufen-Ableitung) auf, hält aber
  zusätzlichen State aus der ohnehin anspruchsvollen `pointermove`-Schleife der
  Erstumsetzung heraus. ✅
- **K3 — Typ-Default-TSS aus den Ist-Fahrten kalibrieren** (Median pro Typ, als
  Nebenprodukt des Migrationsskripts, s. §2). ✅
