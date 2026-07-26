# Phase 5 — Konzept: Explorative Datenansichten [OP]

> **Ziel:** Eine eigene Explorer-Ansicht, in der Trainingsdaten *befragt* statt nur
> *angezeigt* werden: verknüpfte Charts, Zeitraum-Brushing, Vergleich zweier Zeiträume
> und What-if-Szenarien auf der bestehenden Prognose. Vanilla JS, handgeschriebenes SVG,
> kein Framework, keine Chart-Bibliothek.
>
> **Vorentscheidungen (bestätigt):**
> - **Vergleichsachse: Zeitraum vs. Zeitraum, selber Athlet**, überlagert auf einer
>   *relativen* x-Achse (Tag 1 = Blockstart), nicht auf absoluten Daten (§5).
> - **Sichtbarkeit: öffentlich**, abgeleitet aus der Phase-6-Sichtbarkeitsmatrix, die den
>   Explorer bereits namentlich adressiert (§9).
> - **Separate Ansicht**, nicht Umbau des Charts-Tabs. Die „Vereinheitlichung" bleibt
>   eigener, späterer Fahrplan-Schritt **[HA]** (§8).
> - **Skalen-Migration der Bestandscharts ist expliziter Nicht-Zielpunkt** dieser Phase
>   (§8, X4).
>
> **Ist-Stand-Befund (aus `ui/charts/{base,pmc,power,training,wellness}.js`):** Es gibt
> keine Chart-Bibliothek und **kein gemeinsames Koordinatensystem**. `base.js` ist eine
> Zeichenhelfer-Sammlung, keine Chart-Schicht. Jede Render-Funktion rechnet ihr x inline
> und **indexbasiert** aus. Die eine Ausnahme — `renderFtpForecast` mit echter Zeitachse
> — ist die Vorlage für Phase 5. Details und Konsequenzen in §1.

---

## 1. Ausgangsbefund: die Zeichenschicht

### 1.1 Was existiert

`ui/charts/base.js` liefert reine Helfer, die alle vier Chart-Module importieren
(`index.js` bündelt sie nur als `Charts`-Fassade — die Kopplung ist lose):

| Helfer | Art | Für Phase 5 |
|---|---|---|
| `CHART_THEME` | Farbpalette (gespiegelt in `main.css`) | unverändert übernehmen |
| `gridLines()` | horizontale Grid-Linien + Y-Labels | unverändert übernehmen |
| `pickLabelIndices()` | Label-Ausdünnung, pure, getestet | **direkt wiederverwendbar**, s. §1.4 |
| `weekDisplayLabels()` | Wochen-/Monats-**Key**-Formatter, pure, getestet | nur bei Wochen-Aggregation, s. §1.4 |
| `fitsLabel()` | Platzprüfung für Segment-Labels, pure, getestet | für Segment-Labels des Vergleichsmodus (§5) |
| `xLabel()` / `axisTitles()` | Achsentexte | unverändert übernehmen |
| `autoScrollRight()` / `cardContentWidth()` | breite, scrollbare Charts | **im Explorer nicht genutzt**, s. §1.3 |

### 1.2 Das Kernproblem: indexbasierte x-Achsen

Das dominante Muster in `pmc.js`, `power.js`, `wellness.js`:

```js
x: pad.l + (i / Math.max(data.length - 1, 1)) * cw     // ordinal über Datenzeilen
```

und in den Balken-Charts (`training.js`, `wellness.js`):

```js
const x = pad.l + i * gap + (gap - bw) / 2;            // Slot-basiert
```

Das ist eine Achse **über die vorhandenen Datenzeilen**, keine Zeitachse. Daraus folgt:

- **Zwei Charts teilen kein Koordinatensystem.** `renderPMC` filtert
  `rides.filter(r => r.ctl != null && r.atl != null)`, die Wellness-Charts filtern
  anders — dasselbe Datum liegt in jedem Chart bei einem anderen x.
- **Tage ohne Daten fallen ersatzlos weg** statt eine Lücke zu hinterlassen. Die Achse
  schiebt zusammen; bei Athlet 2 (dünne Datenlage) ist der Effekt erheblich.
- **`px → Datum` existiert nirgends.** Ohne diese Umkehrung ist Brushing nicht
  darstellbar und ein Crosshair nicht positionierbar.
- Y-Skalen existieren dagegen längst als Closures (`tsbY`, `caY`, `yOf`) — das Muster ist
  da, nur nicht exportiert.

### 1.3 Die Vorlage: `renderFtpForecast` (pmc.js:417)

Das einzige Chart mit einer **kontinuierlichen Zeitachse**:

```js
const xOf = (iso) => pad.l + ((new Date(iso).getTime() - t0) / (tEnd - t0)) * cw;
```

Es zeichnet bereits Historie **plus** Projektion **plus** Unsicherheitsband **plus** eine
gestrichelte Zukunftsmarke mit eigenem Label — strukturell rund 80 % dessen, was das
Explorer-Hauptchart braucht. Zusätzlich: **feste Breite (W = 780), kein
`autoScrollRight`**, also kein Scroll-Container, dessen Offset beim Brushing
mitgerechnet werden müsste, und keine je nach Datenmenge abweichende Breite zwischen
untereinanderliegenden Charts.

*Implementierungsdetail:* Die Charts mit fester Breite setzen **kein** `viewBox` im JS —
das liegt statisch am `<svg>` in `index.html`. Nur die datengetrieben breiten Charts
(`renderPMC`, `renderSleep`, `renderSmallMultiples`, `renderWeatherWeekly`) setzen es zur
Laufzeit. Die Explorer-SVGs brauchen ihr `viewBox` also im Markup.

### 1.4 Bestehende Label-Helfer an der Datumsachse

**`pickLabelIndices(xs, minPx)` — direkt wiederverwendbar, ohne Änderung.** Sie nimmt
fertige x-Positionen entgegen und ist agnostisch dagegen, wie diese entstanden sind; sie
braucht nur aufsteigende Pixelwerte. Statt Datenindizes bekommt sie künftig
Tick-Positionen aus `scale.x()` — eine Änderung am *Input*, nicht an der Funktion.
AGENTS.md schreibt ihren Einsatz ohnehin verbindlich vor (55–60 px bei Datums-Labels).

Zwei Fallstricke:

1. **Der Algorithmus garantiert den *letzten* Punkt** und verwirft alles, was mit ihm
   kollidiert. Auf einer Vergangenheit-plus-Prognose-Achse ist der semantisch wichtigste
   Tick aber **heute** — und der hat keinen Sonderstatus, kann also wegfallen.
   → **X5:** kein `mustKeep`-Parameter, stattdessen dem Hausmuster folgen und die
   Heute-Marke **separat** zeichnen (wie `renderFtpForecast` seine Retest-Marke und wie
   die Plan-Divider gezeichnet werden), außerhalb der Ausdünnung.
2. **Tick-Kandidaten sind Kalenderpositionen**, nicht Datenpunkte: jeder Montag bzw.
   jeder Monatserste, danach durch `pickLabelIndices` ausgedünnt.

**`weekDisplayLabels(weeks)` — an der Tagesachse nicht einzusetzen.** Sie ist ein
*Key-Formatter* („2026-KW27" → „KW27"), gebunden an Aggregationsschlüssel, keine
Achsenfunktion. Für Tagesauflösung gilt die AGENTS.md-Konvention: `fmtDate(iso)` → DD.MM
über `xLabel()`, `fmtDateFull(iso)` im Tooltip.

Relevant wird sie, sobald der Explorer eine **Wochen-Aggregationsstufe** anbietet (§5,
lange Vergleichszeiträume). Dann unverändert nutzbar — mit einer Reihenfolge-Vorbedingung:

> **Implementierungshinweis (Reihenfolge):** `weekDisplayLabels()` ist über das Array
> hinweg **zustandsbehaftet** — `prevYear` erzeugt den Jahreswechsel-Marker („KW01 '27").
> Sie muss auf der **vollständigen, geordneten** Wochenliste laufen, **bevor** ausgedünnt
> wird. Auf einer gefilterten Teilmenge landet die Jahresmarke am falschen Label oder
> verschwindet ganz. Die Bestandscharts machen das korrekt (`training.js:45` → `:46`),
> aber die Abhängigkeit steht bislang nirgends geschrieben.

**`fitsLabel()`** wird für die Segmentbeschriftung des Vergleichsmodus („Zeitraum A" /
„Zeitraum B") gebraucht. AGENTS.md hält fest, dass nur `wellness.js` das
Segment-Label-Muster nutzt, während `pmc/power/training` noch am alten Rand-Muster
hängen, das bei schmalen Segmenten kollidiert. **Der Explorer nutzt von Anfang an das
`fitsLabel`-Muster.**

---

## 2. Architektur-Skizze

### 2.1 Neue und erweiterte Module

```
core/
  scenario.js        NEU  – What-if-Parameter → synthetischer Kartensatz (pure)
  compare.js         NEU  – zwei Zeiträume → relativ ausgerichtete Serien (pure)
  projection.js      unverändert – liefert die Prognose (§6)

state/
  explorer.js        NEU  – Ansichtszustand: range, hovered, selected,
                            compareSlots, scenario; localStorage-Persistenz (§10.3)

ui/
  explorer.js        NEU  – Mount, Layout, Verdrahtung Zustand ↔ Charts
  charts/
    base.js          ERWEITERT – makeDateScale(), crosshair(), brushOverlay(),
                                 SERIES_STYLE
    explorer.js      NEU  – die Explorer-Charts auf der Datumsskala
```

Die vier Bestandsmodule `pmc/power/training/wellness.js` werden **nicht angefasst**,
mit einer Ausnahme: dem Publizieren des Hover-Datums aus den vorhandenen Handlern (§3).

### 2.2 Die tragende Ergänzung: ein dichtes Tagesgerüst statt einer Zeitstempelskala

*Geändert gegenüber der ersten Fassung — Begründung in `docs/chart-grundlagen.md` §5.*
Eine Zeitstempelskala ist nicht nötig: über einer **lückenlosen Tagesreihe** ist der
Index bereits eine Datumsachse. Statt aus Millisekunden zu rechnen, wird die Dichte
garantiert.

```js
// core/days.js — neu, pure
export function densifyDays(fromISO, toISO);   // → lückenloses Tagesgerüst

// ui/charts/base.js — neu, pure, testbar in tests/chart-layout.test.js
export function makeIndexScale({ ws, we, pad, width }) {
  return {
    x(i),          // Tagesindex → px
    invert(px),    // px → Tagesindex   ← existiert bislang nirgends
  };
}
```

**Densifiziert wird das Achsengerüst, nicht die Serie.** Lastmetriken (TSS, CTL, ATL,
TSB) werden mit `0` aufgefüllt, Messmetriken (HRV, Ruhepuls, Gewicht, aerobe Effizienz,
Decoupling, eFTP) bekommen eine Lücke — eine genullte Effizienz an einem Ruhetag wäre
eine Falschaussage. Jede Serie erklärt dazu `absence: "zero" | "gap"`.

Der Preis gegenüber einer Zeitstempelskala: bricht die Dichtezusage irgendwo, verschiebt
sich die Achse still. `densifyDays()` ist deshalb eine reine Funktion mit eigenen Tests
und wird verbindlich vor jedem Zeichnen aufgerufen, nie als Nebenwirkung im Ladepfad.

**Warum in `ui/charts/base.js` und nicht in `core/`:** Die Funktion ist reine Arithmetik
und wäre in `core/` formal sauberer. Dagegen steht, dass `base.js` mit
`pickLabelIndices`, `weekDisplayLabels` und `fitsLabel` bereits drei pure, in
`tests/chart-layout.test.js` getestete Funktionen beherbergt. Die Schichtentabelle in
AGENTS.md verbietet pure Logik in `ui/` nicht — sie verbietet `ui/ → data-access/`.
Konsistenz mit dem etablierten Ort und der bestehenden Testdatei wiegt hier schwerer als
die formale Reinheit. (X3)

Darauf die Interaktions-Primitiven, ebenfalls in `base.js`:

- `crosshair(svg, { x, H, pad })` — vertikale Linie zeichnen/verschieben
- `brushOverlay(svg, { scale, pad, H, onChange })` — zwei Handles + Auswahl-Rect,
  Pointer Events nach dem Muster aus `ui/plan-drag.js` (Phase 3)
- `SERIES_STYLE` — Konvention für die Zweitserie (gestrichelt, reduzierte Deckkraft),
  von Baustein 3 **und** 4 gebraucht

### 2.3 Datenfluss

```
data/*.json ──► data-access/pipeline.js ──► state/data.js (Data.rides, .wellness)
                                                    │  Ist, bis exklusive asOf
                                                    ▼
plan_cards ──► state/plan-cards.js ──► core/projection.js ──► getState().projection
                                                    │  Plan, ab asOf
                                                    ▼
                                          state/explorer.js  ◄── core/scenario.js
                                                    │           core/compare.js
                                                    ▼
                                          ui/explorer.js ──► ui/charts/explorer.js
```

`ui/` liest ausschließlich aus `state/`, `core/` bleibt rein, `data-access/` wird vom
Explorer nie direkt berührt — die Schichtenregel bleibt unverletzt.

---

## 3. Baustein 1 — Verknüpfte Charts

**Umfang v1: Selektion & Hervorhebung (1B) plus Cursor-Sync (1A) innerhalb des
Explorers.** Facetten-/Kategorienfilter (1C) ist kein Interaktions-Link, sondern eine
Datenfilterung, und bleibt draußen (§8).

**Warum 1B zuerst und warum es billig ist:** Jeder Datenpunkt trägt bereits einen
Handler, der sein Datum kennt — das Muster steht rund 20× identisch in allen vier
Modulen:

```js
c.addEventListener("mouseenter", (e) => Tooltip.show(e, `…${fmtDateFull(d.dateISO)}…`));
c.addEventListener("mouseleave", () => Tooltip.hide());
```

Dort zusätzlich `Explorer.setHovered(d.dateISO)` zu publizieren ist eine Zeile pro
Handler. Die Richtung *Element → Datum* gibt es geschenkt; nur die Gegenrichtung
*px → Datum* fehlt, und die liefert `makeDateScale().invert()` ab Schritt 0.

**Reichweite über den Explorer hinaus:** Hervorhebung-nach-Datum über Komponentengrenzen
ist im Dashboard schon etabliert — `renderWeeklyVolume(svgId, weeklyData, onBarClick,
period)` hat einen Klick-Callback, und `ui/table.js` ↔ `ui/planned.js` rufen sich über
`Table.highlightByDate` / `Planned.scrollToDate` gegenseitig auf (AGENTS.md „Bekannte
Eigenheiten"). Der Explorer nutzt denselben Pfad, um Fahrtenbuch und Planungstab zu
erreichen.

**Cursor-Sync bleibt auf den Explorer beschränkt.** Ein Crosshair über die
Bestandscharts hinweg setzt voraus, dass diese dieselbe Skala benutzen — das wäre die in
§8/X4 ausgeschlossene Skalen-Migration.

---

## 4. Baustein 2 — Zeitraum-Brushing

**Umfang v1: Variante 2B — Brush in einer dedizierten Übersichtsleiste.**

- Ein schmaler CTL-/TSS-Streifen über den Explorer-Charts zeigt **immer den vollen
  Horizont** (Vergangenheit + Prognose) und trägt das ziehbare Fenster.
- Alle Charts darunter folgen dem Fenster. Die Brush-Logik existiert genau **einmal**.
- Zusätzlich Presets (30 / 90 / 365 Tage / Plan 2 / alles) als Knopfzeile — das ist
  gleichzeitig der Mobil-Pfad (§10.5).

**Warum nicht 2C (Brush in jedem Chart):** Indexbasierte Skalen über je eigene gefilterte
Datenarrays, unterschiedliche Breiten, unabhängige Scroll-Container — und die
Power-Curve hat mit „Dauer" ohnehin eine ganz andere x-Achse. Der Aufwand ist groß, der
Zugewinn gegenüber 2B gering.

**Warum 2B günstiger ist als zunächst geschätzt:** Es arbeitet keine Bibliothek dagegen.
Ein Brush ist zwei Handles, ein Rect und `pointermove`; das Pointer-Events-plus-rAF-Muster
inklusive Kanten-Autoscroll und Ghost steht seit Phase 3 in `ui/plan-drag.js` und ist
direkt übertragbar. Neu ist allein `invert(px)`.

---

## 5. Baustein 3 — Vergleichsmodus (3A)

**Zwei Zeiträume desselben Athleten, überlagert auf relativer x-Achse.** (X1)

- Zwei Vergleichsslots **A** und **B**, je ein Datumsbereich. Slot A wird aus dem
  aktuellen Brush-Fenster übernommen („als A merken"), Slot B ebenso — der Vergleich ist
  damit die natürliche Fortsetzung von Baustein 2 statt eines eigenen Bedienkonzepts.
- **x-Achse: Tag 1 = Blockstart**, nicht absolutes Datum. Nur so sind ein 6-Wochen-Block
  aus Plan 1 und einer aus Plan 2 überhaupt übereinanderlegbar.
- Ungleich lange Zeiträume: die kürzere Serie endet früher, es wird **nicht** gestreckt.
  Strecken würde eine Vergleichbarkeit suggerieren, die es nicht gibt.
- `core/compare.js` (pure) übernimmt die Ausrichtung: zwei Datumsbereiche → zwei Serien
  mit `dayOffset` statt `date`, plus Kennzahlen je Slot (Σ TSS, ⌀ CTL, Rampe, harte Tage).
- Serie A in `CHART_THEME.z2` (Plan-1-Blau), Serie B in `CHART_THEME.ss` (Plan-2-Orange)
  — dieselbe Zuordnung, die die Bestandscharts für ihre Plan-Divider verwenden.
- Segment-Labels („Zeitraum A", „Zeitraum B") über das `fitsLabel`-Muster (§1.4).

**Wochen-Aggregationsstufe:** Ab einer Slot-Länge, bei der Tages-Ticks nicht mehr lesbar
sind, schaltet die Achse auf Wochen um. Dann greift `weekDisplayLabels()` — unter der
Reihenfolge-Vorbedingung aus §1.4.

**Athletenvergleich (3B) und Plan-vs-Ist (3C)** sind bewusst nicht v1 (§8). 3A löst
nebenbei die Trainer-Frage auf: da nur ein Athlet beteiligt ist, entsteht für einen
Trainer mit genau einem Athleten gar keine leere Ansicht (§10.4).

---

## 6. Baustein 4 — What-if-Szenarien

**Umfang v1: Variante 4A — parametrische Szenarien.** (X8)

Regler bzw. Felder:

| Parameter | Wirkung |
|---|---|
| Wochen-TSS ± % | skaliert `target_tss` aller Karten im Horizont |
| N zusätzliche Ruhetage | nullt die belastendsten Tage der gewählten Woche(n) |
| Rampenrate | erzwingt einen Wochen-Zuwachs, verteilt auf die vorhandenen Karten |

Ablauf: Parameter → `core/scenario.js` erzeugt einen **synthetischen Kartensatz** →
`core/projection.js::projectLoad()` → zweite Kurve über der Basisprognose.

### 6.1 `core/projection.js` reicht — kein eigener Prognose-Layer

Das Modul ist rein und parametrisiert (`configureProjection` in `app.js`); es nimmt einen
Kartensatz plus Start-CTL/ATL entgegen. Was fehlt, ist lediglich ein **zweiter,
nicht-persistierender Aufrufpfad**: heute läuft die Berechnung über `recomputeProjection()`
im `notify()` von `state/plan-cards.js` und ist damit an den echten Kartenzustand
gekoppelt. Ein Szenario ruft `projectLoad()` mit beliebigem Kartensatz auf, und das
Ergebnis landet **nicht** in `getState()`, sondern in `state/explorer.js`. Das ist eine
kleine Ergänzung in `state/`, kein neues Modul in `core/`.

### 6.2 Der bestehende Hero-What-if-Slider bleibt unangetastet

Der Slider im Hero-Bereich (bis 430 W) ist ein **FTP-Anzeige-What-if** — er skaliert
Zonen und FTP-Ring. Ein Trainings-What-if fragt nach Belastungsverläufen über die Zeit.
Andere Domäne, keine gemeinsame Logik. Wiederverwendet wird allenfalls der visuelle Stil
des Bedienelements.

### 6.3 Unsicherheit sichtbar machen — Pflicht, nicht Kür

Szenario-Kurven erben die **K3-Typ-Default-TSS mit dünner Datenbasis** (n < 5 bei NLS,
Gruppenfahrt, Außerplanmäßig, Etappe, Tempo; s. `docs/offene-punkte.md`).
`projectLoad()` liefert pro Tag bereits ein `uncertain`-Flag — der Explorer **muss** es
darstellen (gestricheltes Segment bzw. Band), sonst suggeriert ein „+12 CTL" eine
Präzision, die aus n=1-Medianen stammt. Dies ist eine inhaltliche Anforderung, keine
Politur.

### 6.4 Szenarien sind flüchtig

Ein Szenario wird nie nach `plan_cards` geschrieben und erzeugt keinen Vorschlag. Es
lebt in `state/explorer.js` und in der localStorage-Persistenz (§10.3). Die Brücke
„Szenario → Trainer-Vorschlag" wäre eine Phase-4-Kreuzung und ist als möglicher späterer
Schritt in `docs/offene-punkte.md` vermerkt.

---

## 7. Abhängigkeiten & Umsetzungsreihenfolge

### 7.1 Abhängigkeiten

- **§4 → §5:** „Zwei Zeiträume vergleichen" *ist* „zwei Brush-Auswahlen". Der
  Zeitraumzustand wird deshalb ab Schritt 0 als **Liste von Slots** modelliert, nicht als
  Einzelwert — der nachträgliche Umbau von 1 auf n wäre der teure.
- **§3 ↔ §4** teilen sich denselben Zustandsspeicher (`state/explorer.js`). Einmal bauen,
  zuerst.
- **§5 ↔ §6** teilen sich dieselbe Rendering-Fähigkeit („zweite Serie über der ersten",
  inkl. Legende und Farbsemantik) — `SERIES_STYLE` wird vor dem ersten von beiden
  festgelegt.
- **§3 × §5 kollidieren semantisch:** Bei zwei überlagerten Zeiträumen bedeutet ein Hover
  zwei Daten gleichzeitig. Der geteilte Cursor ist deshalb von Anfang an **ein Cursor pro
  Vergleichsslot**, nicht ein globaler.
- **§4 × §6 kollidieren auf der Achse:** Brushing wählt historische Fenster, What-if
  erzeugt Zukunft. Gelöst durch den festen Achsenhorizont (§10.2).

### 7.2 Reihenfolge (strikt schrittweise, je ein Commit)

| Schritt | Inhalt | Modell |
|---|---|---|
| **0** | `densifyDays()` in `core/` + `makeIndexScale()` in `base.js` + `state/explorer.js` + Explorer-Hauptchart nach dem `renderFtpForecast`-Muster | Entwurf **[OP]**, Umsetzung **[SO]** |
| **1** | Zeitraum-Brushing (§4) — etabliert den Zeitraum als zentrale Zustandsachse | **[SO]** |
| **2** | Verknüpfte Charts (§3) — Selektion, dann Cursor-Sync | **[SO]** |
| **3** | What-if (§6) — erste Mehrserien-Überlagerung, Zweitserie **erzeugt** | **[OP]** |
| **4** | Vergleichsmodus (§5) — Zweitserie aus **echten** Daten, relative Ausrichtung | **[OP]** |
| **5** | Charts-Tab auf die neue Grundlage nachziehen — eigener Fahrplan-Schritt, s. §8 | **[OP]** |

**Warum What-if vor Vergleichsmodus** (abweichend von der Fahrplan-Nennreihenfolge):
Beide brauchen dieselbe Mehrserien-Fähigkeit, aber die Zweitserie des Szenarios stammt aus
einem Modul, das wir kontrollieren (`projection.js`) — kein zweiter Datenladepfad, keine
Datumsangleichung, keine Slot-Verwaltung. Gleiche Fähigkeit, geringeres Risiko zuerst.
Das entspricht dem Phase-3-Prinzip (reine Rechenlogik vor UI-Komplexität), das sich dort
bewährt hat.

---

## 8. Abgrenzung — was Phase 5 nicht tut

- **Keine Skalen-Migration der Bestandscharts** (`pmc/power/training/wellness.js`). (X4)
  Sie bleiben auf ihren indexbasierten Achsen. Begründung: Eine Umstellung auf die
  kontinuierliche Skala ändert das Bild sichtbar — Tage ohne Daten erschienen dann als
  Lücken, wo die Achse sie heute stillschweigend zusammenschiebt. Bei **Athlet 2** mit
  dünner Datenlage wäre das eine echte optische Regression an öffentlich sichtbarer
  Stelle. Als eigener Punkt in `docs/offene-punkte.md` vermerkt, für eine mögliche
  spätere, bewusste Entscheidung.
- **Der Fahrplan-Schritt „Vereinheitlichung" wird von [HA] auf [OP] hochgestuft und neu
  geschnitten.** Mit der Chart-Grundlage aus `docs/chart-grundlagen.md` ist er kein
  Kosmetikschritt mehr: rahmenlose Karten statt `0.5px solid #2a3140`, andere
  Serienfarben, gemessene Breite statt skaliertem viewBox, geteiltes Tooltip-Overlay
  statt `Tooltip` aus `ui/dom.js`, Direktbeschriftung statt Legende. Der Schritt bleibt
  **nach** Phase 5 und wird ausdrücklich als eigener Posten eingeplant, statt still
  anzuwachsen. → `docs/chart-grundlagen.md` §8, G12.
- **Kein Facetten-/Kategorienfilter (1C)** in v1.
- **Kein Athletenvergleich (3B)** — die beiden Athleten hängen an verschiedenen Quellen
  (intervals.icu vs. Amazfit/Zepp); HRV und Schlaf sind zwischen den Geräten nicht sauber
  vergleichbar. Ein Vergleich wäre optisch überzeugend und inhaltlich unsauber.
- **Kein Plan-vs-Ist-Vergleich (3C)** in v1 — inhaltlich attraktiv, aber ein eigenes
  Chart, kein Modus.
- **Keine lückigen Messreihen im Explorer v1.** Die `absence: "gap"`-Semantik wird in
  Schritt 0 mitgebaut und getestet (sonst müsste sie später nachgerüstet werden, und bis
  dahin würde still genullt), aber es wird v1 keine Messmetrik im Explorer dargestellt.
  Aerobe Effizienz und Decoupling bleiben vorerst im Charts-Tab.
- **Keine bucketweise Kopplung in v1.** Balkencharts nehmen erst am Fadenkreuz teil, wenn
  der Charts-Tab nachgezogen wird (G12/G14).
- **Kein neuer Rechenkern.** Weder eine zweite PMC-Implementierung noch eine
  Konfliktregel-Erweiterung. Monotonie/Strain nach Foster (im
  Konfliktlogik-Konzept §3 als „Phase-5-Material" erwähnt) bleibt draußen — Phase 5 ist
  eine Ansichts-, keine Regelphase.
- **Kein URL-Router** (Phase-1-Entscheidung F2 bleibt).

---

## 9. Sichtbarkeit

Abgeleitet aus `docs/phase-6-konzept-sichtbarkeit.md`, das den Explorer bereits
namentlich adressiert („Regel für alles Künftige (auch Phase-5-Explorer): Was aus privaten
Daten rechnet, ist privat, egal wie aggregiert es wirkt"). Der Explorer ist damit
**öffentlich**, ohne eigene Policy: (X6)

| Im Explorer dargestellt | Quelle | Sichtbarkeit |
|---|---|---|
| Fahrten, CTL/ATL/TSB-Ist, HRV, Ruhepuls, Schlaf, Wetter | `data/*.json` (Lesedaten) | ✅ öffentlich |
| Plan-Karten, Events | `plan_cards`, `events` | ✅ öffentlich (E1) |
| Prognose, Konflikte, What-if-Szenarien | Ableitung aus den obigen | ✅ öffentlich |
| **Subjektive Befinden-Slider** | `wellbeing` (Supabase) | **⛔ Toggle je Athlet, Default aus (E2/S2)** |
| **Check-in-Notiz** | `wellbeing.note` | **⛔ nie öffentlich (E2)** |
| **Governor-Empfehlung** | Ableitung aus Befinden | **⛔ nur Athlet/Trainer** |

### 9.1 Eigene Regel: die Quelle entscheidet, nicht die Metrik

> **X6-Regel — Schlaf und HRV sind zweimal da, und die beiden Vorkommen sind nicht
> gleich sichtbar.**
>
> - **HRV, Ruhepuls und Schlafscore aus `data/*.json`** stammen aus der
>   intervals.icu-/Amazfit-Pipeline. Sie sind **Lesedaten** und laut Matrix-Zeile 1
>   öffentlich. Die bestehenden Wellness-Charts zeigen sie heute schon öffentlich.
> - **Die subjektiven Slider (Energie / Muskelgefühl / Stimmung) aus der
>   `wellbeing`-Tabelle** sind es nicht — sie hängen am `wellbeing_public`-Toggle mit
>   Default *aus*.
>
> Beide betreffen „Befinden" und liegen im Explorer potenziell in derselben Ansicht.
> Ein Explorer, der sie in eine gemeinsame „Wellness"-Serie zusammenzieht, verwischt
> genau diese Grenze und macht aus einer öffentlichen Pipeline-Metrik unbemerkt einen
> Kanal für private Daten.
>
> **Regel:** Serien werden im Explorer **nach Quelle** geführt und beschriftet, nie nach
> Thema zusammengefasst. Jede Serie trägt in ihrer Definition ihre Herkunft
> (`source: "pipeline" | "wellbeing"`); die `wellbeing`-Serien werden bei fehlender
> Freigabe **nicht gefiltert, sondern gar nicht erst geladen**. Eine Sammelregel
> („Wellness ist privat") wäre falsch und würde öffentliche Pipeline-Daten unnötig
> verstecken; eine Sammelregel in die andere Richtung wäre ein Leck.

Schreiben findet im Explorer nirgends statt — What-if-Szenarien sind flüchtig (§6.4),
Brush- und Vergleichszustand liegen in localStorage. Es entsteht kein neuer Schreibpfad
und damit kein neuer RLS-Prüfpunkt. Die Matrix aus Phase 6 bleibt vollständig; der
Explorer fügt ihr keine Zeile hinzu.

---

## 10. Beantwortete offene Fragen

### 10.1 Datenherkunft-Naht: `asOf` ist die einzige Grenze (X7)

Der Explorer bezieht Vergangenheit und Zukunft aus zwei verschiedenen Quellen mit
unterschiedlicher Aktualität (6-Stunden-Cron vs. Live-State). **Vorschlag: genau ein
Schnittdatum, keine Überlappung, kein Merge.**

- Alles **strikt vor `projection.asOf`** kommt aus `data/*.json`.
- Alles **ab `asOf`** kommt aus `getState().projection`.
- **Der Explorer rechnet CTL/ATL für die Vergangenheit niemals selbst nach**, sondern
  liest `r.ctl` / `r.atl` aus den Rides — exakt wie `renderPMC` es heute tut.

*Begründung:* Eine zweite PMC-Implementierung für die Historie würde unweigerlich von der
Pipeline abweichen (Rundung, Startwerte, Lückenbehandlung) und zwei Wahrheiten im selben
Chart erzeugen. `projection.startCtl/startAtl` leiten sich ohnehin vom letzten Ist-Wert
ab — Vergangenheit und Prognose hängen damit an derselben Verankerung und verschieben
sich bei veralteter Pipeline gemeinsam, statt auseinanderzulaufen. Visuell: durchgezogen
vor `asOf`, gestrichelt danach, senkrechte Heute-Marke bei `asOf` (separat gezeichnet,
s. X5). Die Datenaktualität wird wie beim Governor als Hinweis angezeigt.

### 10.2 Achsenhorizont: Zukunft ist immer da (X8)

**Vorschlag: Die Achse reicht immer bis `projection.horizonEnd`**, unabhängig davon, ob
ein What-if aktiv ist. Das Standard-Brush-Fenster liegt auf den letzten 90 Tagen plus
Horizont.

*Begründung:* Erschiene die Zukunft erst beim Aktivieren des What-if, änderte sich mit
dem Einschalten die Achse — und genau der Vorher-Nachher-Vergleich, den das Werkzeug
zeigen soll, wäre optisch nicht mehr vergleichbar. Feste Achse, wechselnde Serien ist
lesbar; wechselnde Achse ist es nicht. `projection.horizonEnd` ist bereits definiert als
„letzter geplanter Tag, mindestens bis zum nächsten Event + 7 Tage" — der Zukunftsteil
ist damit nie leer, solange ein Plan oder ein Event existiert.

### 10.3 Zustandspersistenz: localStorage, ein Schlüssel (X9)

**Vorschlag:** `localStorage("explorer_<athleteId>")` mit einem einzigen JSON-Objekt
`{ range, compareSlots, scenario, linked }`.

*Begründung:* Das Muster existiert bereits — die Wochen-/Monats-Toggles persistieren als
`localStorage("period_<athleteId>_<chartId>")`. Ein Schlüssel statt einem pro Bedienelement,
weil der Explorer-Zustand ein zusammenhängendes Objekt ist und eine teilweise
Wiederherstellung (Brush wiederhergestellt, Szenario nicht) verwirrender wäre als gar
keine. Kein Backend, keine neue Tabelle, kein Router — die Phase-1-Entscheidung F2
(„Modal, kein Router") bleibt unberührt.

*Genannter Preis:* kein teilbarer Link. Für den Portfolio-Charakter ist das ein echter
Verlust. Ein URL-Hash ließe sich später ergänzen, ohne den localStorage-Pfad zu brechen
(Hash gewinnt, wenn vorhanden) — als möglicher späterer Schritt in
`docs/offene-punkte.md` vermerkt.

### 10.4 Trainer-Sicht: keine Sonderbehandlung (X10)

**Vorschlag:** Der Explorer ist öffentlich (§9); der Trainer sieht ihn für seinen
Athleten wie jeder Besucher, plus die `wellbeing`-Serien, die ihm ohnehin zustehen
(Slider immer, Notiz per T1-Toggle). Kein eigener Trainer-Modus in v1.

*Begründung:* Die Vergleichsachse 3A (ein Athlet, zwei Zeiträume) lässt die ursprüngliche
Sorge — „ein Trainer mit genau einem Athleten sieht beim Athletenvergleich eine leere
Ansicht" — gar nicht erst entstehen. What-if schreibt nichts (§6.4), also gibt es auch
keinen Rechte-Sonderfall. Die bestehende Regel „der Athleten-Toggle wechselt die Ansicht,
nie die Rechte" gilt unverändert.

### 10.5 Mobil: Presets statt Brush unterhalb einer Breitenschwelle (X11)

**Vorschlag:** Die Brush-Leiste wird unterhalb einer Viewport-Schwelle ausgeblendet; die
Preset-Knopfzeile (§4) ist dort das primäre Bedienelement. Der Brush selbst nutzt
Pointer Events und funktioniert damit prinzipiell auch per Finger.

*Begründung:* Die Explorer-Charts haben feste logische Breite (`renderFtpForecast`-Muster,
§1.3) und scrollen deshalb nicht horizontal — anders als die vier breiten Bestandscharts.
Damit entfällt der Hauptkonflikt (Brush-Geste vs. Scroll-Geste im selben Container) von
vornherein. Was bleibt, ist schlicht zu wenig Platz für zwei Handles mit sinnvollen
Trefferflächen; dagegen hilft kein Feinschliff, sondern der Verzicht. Presets liefern auf
dem Telefon ohnehin den größeren Teil des Nutzens.

---

## 11. Tests

Nach dem Phase-3-Muster: reine Funktionen vollständig, UI-Interaktion manuell bzw. per
Playwright gegen `dashboard-dev`.

- **`densifyDays()`** (`core/`): lückenloses Gerüst über einen Bereich; Randfälle
  `from === to`, Monats- und Jahreswechsel, Sommerzeit-Übergang (Zeitzonen-Falle —
  `localISODate()`-Konvention aus Phase 3 beachten, nicht UTC); Nachweis, dass eine
  Eingabe mit Lücken dieselbe Achsenlänge erzeugt wie eine ohne.
- **`absence`-Auflösung:** Lastmetrik wird zu `0`, Messmetrik zu einer Lücke; eine
  Serie mit ausschließlich Lücken bricht nichts.
- **`makeIndexScale()`** (`tests/chart-layout.test.js`): `x()`/`invert()` als Rundreise;
  Ein-Tages-Fenster; Index außerhalb des Fensters.
- **Kalender-Ticks**: Monats- und Wochenkandidaten, Monatsanfang am Bereichsrand.
- **`pickLabelIndices()`** mit Skalen-Ticks statt Datenindizes — belegt, dass die
  Funktion unverändert trägt (§1.4).
- **`core/scenario.js`**: jeder Parameter einzeln, Kombination zweier Parameter,
  Szenario ohne Karten im Horizont, `uncertain`-Weitergabe aus `estimateTss()`.
- **`core/compare.js`**: gleich lange Slots, ungleich lange Slots (kürzere endet früher,
  keine Streckung), leerer Slot, überlappende Slots.
- **`state/explorer.js`**: localStorage-Rundreise, Athletenwechsel lädt den fremden
  Zustand nicht (Muster `loadedForAthleteId` aus `state/plan-cards.js`), defektes
  JSON in localStorage führt zu Default statt Absturz.
- **Sichtbarkeit:** Test, dass `wellbeing`-Serien bei fehlender Freigabe **nicht geladen**
  werden (nicht nur nicht gezeichnet) — Ergänzung in `tests/supabase-rls.test.js`.
- Kein Unit-Test für die Brush-Geste; Verifikation per Playwright mit echter
  mehrstufiger Pointer-Geste (down → move×n → up), wie bei der
  Nach-Drop-Feedback-Verifikation in Phase 3.

---

## Getroffene Entscheidungen

- **X1 — Vergleichsachse: Zeitraum vs. Zeitraum, selber Athlet**, relative x-Achse
  (Tag 1 = Blockstart), ungleiche Längen werden nicht gestreckt. ✅
- **X2 — Separate Explorer-Ansicht** statt Umbau des Charts-Tabs; „Vereinheitlichung"
  bleibt eigener späterer Fahrplan-Schritt. ✅
- **X3 (überarbeitet) — Dichtes Tagesgerüst (`densifyDays()` in `core/`) plus
  Indexskala (`makeIndexScale()` in `ui/charts/base.js`)** als eigentliche Vorbedingung
  von Schritt 0, statt einer Zeitstempelskala. Densifiziert wird die Achse, nicht die
  Serie (`absence: "zero" | "gap"`). `renderFtpForecast` bleibt die Vorlage des
  Explorer-Hauptcharts, nicht `renderPMC`. → `docs/chart-grundlagen.md` §5, G10. ✅
- **X4 — Skalen-Migration der Bestandscharts ist expliziter Nicht-Zielpunkt** von
  Phase 5; Athlet-2-Regressionsrisiko bei dünner Datenlage. In `docs/offene-punkte.md`
  vorgemerkt. ✅
- **X5 — Heute-/Zukunftsmarke separat zeichnen** statt `pickLabelIndices()` um einen
  `mustKeep`-Parameter zu erweitern: dem `renderFtpForecast`-Hausmuster folgen, getestete
  pure Funktion nicht anfassen. ✅
- **X6 — Explorer öffentlich**, abgeleitet aus der Phase-6-Matrix; dazu die eigene Regel
  „Serien werden nach **Quelle** geführt, nie nach Thema zusammengefasst" — HRV/Schlaf
  aus `data/*.json` öffentlich, `wellbeing`-Slider nicht, und bei fehlender Freigabe
  **gar nicht erst geladen**. ✅
- **X7 — `projection.asOf` ist die einzige Naht** zwischen Ist und Prognose; der Explorer
  rechnet die Historie nie selbst nach. ✅
- **X8 — Achse reicht immer bis `horizonEnd`**, unabhängig vom What-if-Zustand; What-if
  als parametrisches Szenario (4A) auf `core/projection.js`, kein eigener Prognose-Layer,
  Szenarien flüchtig, `uncertain`-Flag sichtbar. ✅
- **X9 — Zustandspersistenz über `localStorage("explorer_<athleteId>")`**, ein Schlüssel,
  kein Router. ✅
- **X10 — Kein eigener Trainer-Modus** in v1. ✅
- **X11 — Mobil: Presets statt Brush** unterhalb einer Viewport-Schwelle. ✅
- Umsetzungsreihenfolge Schritt 0 → 5 (§7.2), strikt schrittweise, je ein Commit;
  What-if **vor** Vergleichsmodus. ✅
- Verknüpfte Charts v1 = Selektion (1B) + Cursor-Sync (1A) **innerhalb des Explorers**;
  Kategorienfilter (1C) nicht in v1. ✅
- Brushing v1 = Übersichtsleiste (2B) + Presets; kein Brush in jedem Chart (2C). ✅

---

## Offene Punkte → `docs/offene-punkte.md`

- **Skalen-Migration der Bestandscharts** (`pmc/power/training/wellness.js`) von
  indexbasierten auf kontinuierliche Datumsachsen — bewusst zurückgestellt (X4), Risiko:
  sichtbare Lücken bei dünner Datenlage (Athlet 2). Kandidat für eine spätere, bewusste
  Entscheidung; Voraussetzung für Cursor-Sync über den Explorer hinaus.
- **URL-Hash für teilbare Explorer-Zustände** — in v1 verworfen zugunsten localStorage
  (X9); nachrüstbar, ohne den bestehenden Pfad zu brechen.
- **Athletenvergleich (3B) und Plan-vs-Ist (3C)** als mögliche spätere Vergleichsachsen;
  3B braucht vorher eine Aussage zur Gerätevergleichbarkeit (intervals.icu vs. Amazfit).
- **Szenario → Trainer-Vorschlag** als Brücke zwischen Phase 5 und Phase 4 — in v1
  bewusst nicht gebaut (§6.4).
- **K1-Schwellen-Review nach Plan 2** betrifft auch die What-if-Kurven (K3-Typ-Default-TSS
  mit n < 5); bestehender Punkt, hier nur als betroffene Stelle vermerkt.
- **Segment-Label-Muster (`fitsLabel`) in `pmc/power/training.js`** weiterhin offen
  (bestehender AGENTS.md-Hinweis); der Explorer nutzt es von Anfang an, die Bestandscharts
  nicht.
