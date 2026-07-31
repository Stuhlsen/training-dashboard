# Chart-Grundlagen — abgeleitet aus dem Claude-Design-Entwurf „Explorer · Raum" [OP]

> **Zweck:** Verbindliche Grundlage für **alle** Charts der App, gewonnen aus dem
> Claude-Design-Entwurf. Legt Tokens, Zeichenprimitiven, Interaktionskonventionen und
> Abgrenzungen fest. Ersetzt perspektivisch `CHART_THEME` und erweitert
> `ui/charts/base.js`.
>
> **Quelle:** `Explorer_Raum.html` (Claude-Design-Export, React-Bundle). Die Zeichenlogik
> darin ist framework-frei — nur Hülle und Kacheln sind React. §1 zeigt, was portierbar
> ist und was nicht.
>
> **Abgrenzung:** Dieses Dokument beschreibt die *Grundlage*. Was davon im Rahmen von
> Phase 5 umgesetzt wird, regelt `docs/phase-5-konzept-explorer.md`; die Bestandscharts
> bleiben laut X4 unangetastet — siehe aber §7, die Entscheidung wird durch diese
> Grundlage teurer.

---

## 1. Portierbarkeit des Entwurfs

| Bestandteil | Umfang | Portierbar |
|---|---|---|
| `drawMain()` / `drawTsb()` / `drawOv()` | ~230 Zeilen | ✅ vollständig — reines DOM/SVG |
| `el()`, `txt()`, `path()`, `glowDefs()` | ~8 Zeilen | ✅ = `svgEl` + neue Helfer |
| `paintHover()`, `renderTip()`, `placeTip()` | ~50 Zeilen | ✅ reines DOM |
| Brush-Handler (`onDown`/`onMove`/`onUp`) | ~35 Zeilen | ✅ Pointer Events, wie `ui/plan-drag.js` |
| `build()` (Beispieldaten) | ~25 Zeilen | ⛔ Wegwerfcode, ersetzt durch echte Daten |
| Kennzahlen-Kacheln, Preset-Knöpfe | React/JSX | ⚠️ trivial als DOM neu zu schreiben |
| Tilt/Sheen (`onTilt`, `perspective`) | ~15 Zeilen | ⛔ bewusst nicht übernehmen, s. §6 |

Die Zeichenfunktionen lesen aus React nur `this.state.ws/we` (Fensterindizes) und
`this.props.*` (Sichtbarkeits-Schalter). Beides wird beim Port zu Argumenten bzw. zu
Lesezugriffen auf `state/chart-view.js`. **Kein einziger React-Aufruf steht in der
Zeichenschicht.**

---

## 2. Design-Tokens

### 2.1 Rollenfarben (neu)

```js
export const CHART_ROLE = {
  primary:   "#4a9eff",  // Hauptmetrik (CTL)
  secondary: "#e0736b",  // Nebenmetrik (ATL)
  positive:  "#6fc48c",  // Form/TSB im unkritischen Bereich
  status:    "#e8b73f",  // Zustand, Schwellenüberschreitung, Events
};
```

**Wichtiger Bruch gegenüber `CHART_THEME`:** Die bisherige Palette benennt
*Trainingszonen* (`z1/z2/ss/thr/vo2`), die neue benennt *Rollen*. Das sind zwei
verschiedene Systeme, und **beide werden weiterhin gebraucht** — die Zonenfarben stecken
im `border-left` der Plankarten und in der Leistungsskala. Der neue `CHART_THEME`
enthält deshalb beide Blöcke nebeneinander; die Zonenfarben werden nicht durch
Rollenfarben ersetzt.

Die Zuordnung Rolle→Serie ist pro Chart zu treffen, nicht global: `primary` ist immer die
Metrik, um die es in diesem Chart geht.

### 2.2 Flächen

```js
surface: {
  page:      "#08090c",
  card:      "linear-gradient(180deg,#1a1d23 0%,#141619 46%)",  // Hauptkarte
  cardFlat:  "linear-gradient(180deg,#16191e 0%,#131519 70%)",  // Nebenkarte
  tile:      "#181b21",
  tileHover: "#1d2027",
  plate:     "#141619",                    // Label-Plättchen im Chart, opacity .9
  tooltip:   "rgba(24,27,33,0.96)",
}
```

Karten haben **keinen Rahmen.** Abgesetzt wird über Verlauf, Innenlicht
(`0 1px 0 rgba(255,255,255,.055) inset`) und weichen Schatten. Radius 22–24 px.

### 2.3 Textleiter

`#f0f2f5` Zahlen/Überschriften → `#c2c8d0` Tooltip-Fließtext → `#9aa0a8` Fließtext →
`#8a9099` Tooltip-Labels → `#7c8794` Zustandshinweis → `#6b7178` Achsen-/Kachel-Labels →
`#565b62` Achseneinheiten und Randnotizen → `#3f444b` Trennpunkte.

Sieben Stufen sind mehr, als eine Chart-Schicht braucht. Für Charts reichen vier:
`ink` `#f0f2f5`, `soft` `#9aa0a8`, `label` `#6b7178`, `faint` `#565b62`.

### 2.4 Gitterlinien — abgestuft

```js
stroke: `rgba(255,255,255,${0.04 + k * 0.008})`   // k = 0 (oben) … 4 (unten)
```

Das Gitter wird nach unten hin heller. Wirkt subtil räumlich und hält den oberen
Chartbereich ruhig, wo die Kurven meist liegen. Übernehmen — ersetzt die feste
`CHART_THEME.grid`-Linie in `gridLines()`.

### 2.5 Typografie im Chart

- Achsenzahlen und Randnotizen 11 px, `#6b7178` bzw. `#565b62`
- Serienbeschriftung 12 px, `font-weight` 600–700, in Serienfarbe
- Abschnittslabels 11 px, `font-weight` 600, `letter-spacing:.15em`, Versalien
- Trenner zwischen Metadaten ist immer `·`, nie Komma oder Pipe
- `font-variant-numeric: tabular-nums` global auf `svg` gesetzt

---

## 3. Zeichenprimitiven für `base.js`

### 3.1 Direkt zu übernehmen

```js
// d-String aus Punktpaaren — ersetzt das points-Attribut von <polyline>
path(pts)  // [[x,y],…] → "M x y L x y …"
```
Der Gewinn gegenüber `<polyline points>`: dieselbe Funktion baut auch geschlossene
Flächen (`path(pts) + " L… L… Z"`) und Bänder (`path(oben.concat(unten)) + " Z"`).

```js
txt(parent, x, y, string, attrs)   // Text mit Default fill/font-size
glowDefs(defs, id, color, dev)     // feDropShadow-Filter, gibt "url(#id)" zurück
```

### 3.2 Die zwei wertvollsten Funde

**`halo(x, y, text, fill, weight)` — das Label-Plättchen.** Zeichnet ein abgerundetes
Rechteck in `surface.plate` mit `fill-opacity .9` hinter den Text. Das ist der Grund,
warum Serienbeschriftungen direkt im Chart lesbar bleiben, auch wenn sie über Linien oder
Flächen liegen. Ohne dieses Plättchen funktioniert Direktbeschriftung nicht — dann braucht
man wieder eine Legende.

> **Vorbehalt:** Die Breite wird als `text.length * 6.4 + 10` geschätzt. Das bricht bei
> Umlauten, bei anderen Schriftgrößen und bei Ziffern (schmaler). Beim Port entweder
> per `getComputedTextLength()` nach dem Einfügen nachmessen und das Rechteck danach
> korrigieren, oder die Schätzkonstante pro Schriftgröße tabellieren. Ersteres ist
> sauberer, kostet ein Reflow pro Label — bei 2–3 Labels pro Chart vertretbar.

**`flat(key, k0, k1)` — Labelplatzierung auf dem flachsten Kurvenstück.** Sucht im
Bereich zwischen zwei relativen Positionen die Stelle mit der geringsten lokalen Steigung
und setzt das Label dorthin. Dazu die Variante für die zweite Serie, die stattdessen die
Stelle mit dem **größten vertikalen Abstand zwischen beiden Kurven** sucht. Diese beiden
Heuristiken sind der Grund, warum sich die Labels nie überlagern — nicht Zufall, sondern
gerechnet. Beides nach `base.js`.

### 3.3 Achsenskalierung auf runde Werte

```js
lo = Math.max(0, Math.floor((lo - 5) / 10) * 10);
hi = Math.ceil((hi + 5) / 10) * 10;
```
Ergibt Achsenbeschriftungen wie 40/63/85/108/130 statt 41,3/62,7/…. Für die TSB-Achse
analog auf 5er-Schritte, mit erzwungenem Mindestbereich `−35 … +15`, damit die
Sweet-Spot-Zone immer sichtbar bleibt, auch wenn die Daten sie nicht ausschöpfen.

### 3.4 Achseneinheit über der Achse

`this.txt(svg, L - 10, T - 12, "TSS/Tag", {...})` — die Einheit steht **über** der
obersten Achsenzahl, rechtsbündig, in `faint`. Kein rotierter Achsentitel.

**Sachlich wichtig:** `TSS/Tag` ist die korrekte Einheit für CTL und ATL — beide sind
gleitende Mittelwerte der Tagesbelastung. Die bisherigen Charts beschriften das gar nicht.
**Konvention: jedes Chart nennt seine y-Einheit an dieser Stelle.**

---

## 4. Interaktionskonventionen

Das ist der Teil, den ein Screenshot nicht zeigt, und der die eigentliche Substanz
des Entwurfs ausmacht.

### 4.1 Hover-Layer statt Neuzeichnen

Jede `draw*()`-Funktion endet mit:

```js
const hov = this.el(svg, "g", {});
this._gMain = { X, Y, L, T, pw, ph, w, hov };
```

Eine leere Gruppe als oberste Ebene, plus ein Geometrie-Objekt mit den Skalen und dem
Padding. Beim Hover wird ausschließlich `hov.textContent = ""` geleert und neu befüllt —
**das Chart selbst wird nie neu gezeichnet.** Genau das Muster, das
`docs/phase-5-konzept-explorer.md` §2.2 als `crosshair()`-Primitive vorsieht; es ist hier
bereits ausformuliert und sollte so nach `base.js`.

Das Geometrie-Objekt ist zugleich der fehlende Baustein aus dem Konzept: es exportiert
`X` (Index→px) und `Y` (Wert→px) pro Chart und macht damit charts-übergreifende
Positionierung überhaupt erst möglich.

### 4.2 Verknüpfte Charts — bereits implementiert

`onChartMove` hängt an **beiden** Chart-SVGs, rechnet aus der Zeigerposition einen
gemeinsamen Tagesindex und ruft `paintHover(i)`, das in *beide* Hover-Layer zeichnet:
Fadenkreuzlinie plus, pro Serie, ein Doppelkreis (Halo `r:9` mit `fill-opacity .16`, darauf
Punkt `r:4.2` in Kartenfarbe mit 2,4 px Rand in Serienfarbe).

Damit ist **Baustein 1 (verknüpfte Charts, Variante 1A) prototypisch fertig** — nicht nur
skizziert. Der Port muss den Index nur aus dem geteilten Zustand statt aus `this._hover`
lesen.

### 4.3 Tooltip — ein geteiltes HTML-Element

Kein SVG-Tooltip, kein Element pro Chart: **ein** absolut positioniertes `<div>` über der
Karte, `pointer-events:none`, Inhalt per `innerHTML` aus einem `row(farbe,label,wert)`-
Helfer. Positionierung in `placeTip()` mit Klemmung an die Kartenränder
(`Math.min(rc.width - tw - 14, Math.max(14, x + 18))`).

Inhalt pro Tag: Wochentag + volles Datum, Badge „Gefahren"/„Plan", dann je eine Zeile
CTL, ATL, TSB, TSS (bei 0 als „Ruhetag" statt „0"), darunter bedingt ein Block
„Unsichere Prognose · CTL ±x" und am Eventtag „A-Event · GFNY".

> **Vor dem Port zu klären:** `renderTip()` baut `innerHTML` zusammen. Aktuell fließen nur
> Zahlen und feste Strings ein, also unkritisch. Sobald dort ein Kartentitel oder eine
> Notiz landet, ist es eine Lücke — im Projekt gab es in Phase 2 bereits einen
> XSS-Fund im Badge-Fallback. **Konvention: Tooltip-Inhalte über `textContent` oder eine
> Escaping-Funktion, nie roh interpoliert.**

Das bestehende `Tooltip`-Objekt aus `ui/dom.js` (das die Bestandscharts nutzen) und dieses
Muster sind zwei verschiedene Mechanismen. Sie sollten zusammengeführt werden — §7.

### 4.4 Brush

- Pointer Capture auf dem Übersichts-SVG, wie `ui/plan-drag.js`.
- Grifftoleranz wird aus 11 Pixeln in **Indexeinheiten** umgerechnet
  (`Math.max(4, round(11 / pw * N))`) — bleibt dadurch bei jeder Breite gleich anfassbar.
- Cursor wechselt schon beim Darüberfahren (`ew-resize` nahe den Griffen, sonst `grab`).
- **Klick außerhalb des Fensters zentriert das bestehende Fenster auf den Klickpunkt**,
  statt eine neue Auswahl zu beginnen. Das ist besser als das Übliche: die Fensterbreite
  bleibt erhalten, man springt nur hin. Übernehmen.
- `MIN_W = 7` Tage — deckt sich mit der Konzeptvorgabe.

### 4.5 Responsives Neuzeichnen statt skaliertem viewBox

```js
const w = svg.clientWidth;
svg.setAttribute("viewBox", "0 0 " + w + " " + h);
// … und ein ResizeObserver, der draw() auslöst
```

Die Breite wird **gemessen und als viewBox gesetzt**, nicht fest vergeben und per CSS
skaliert. Folge: 1 SVG-Einheit = 1 CSS-Pixel, Schrift und Strichstärken bleiben bei jeder
Breite exakt. Das ist ein echter Qualitätsgewinn gegenüber den Bestandscharts, bei denen
skalierte viewBoxes die Schriftgrößen mitziehen.

Der Preis: jedes Chart braucht einen `ResizeObserver`, und `draw()` muss idempotent sein
(`svg.textContent = ""` am Anfang). Beides ist erfüllt.

---

## 5. Die Skalenfrage — eine Vereinfachung, die das Konzept betrifft

Der Entwurf nutzt eine **indexbasierte** x-Skala:

```js
const X = i => L + (i - ws) / Math.max(1, we - ws) * pw;
```

Das ist genau das Muster, das in §1.2 des Phase-5-Konzepts als Kernproblem der
Bestandscharts benannt wurde — hier aber **unschädlich**, weil das Datenarray
lückenlos ist: `build()` erzeugt eine Zeile pro Kalendertag. Über einem dichten
Tagesarray *ist* der Index eine Datumsachse.

Daraus folgt eine echte Vereinfachung gegenüber X3:

> **Statt `makeDateScale()` aus Zeitstempeln zu rechnen, genügt es, die Dichte zu
> garantieren.** Eine Funktion `densifyDays(from, to)`, die das lückenlose Tagesgerüst
> erzeugt, plus die Indexskala oben, leistet dasselbe bei weniger Code — und die
> Umkehrung `invert(px) → Index → Datum` ist trivial.

**Entscheidend: densifiziert wird die *Achse*, nicht die *Serie*.** Ein Nulltag bedeutet
nicht bei jeder Metrik dasselbe:

| Metrikart | Fehlender Tag bedeutet | Auffüllung |
|---|---|---|
| **Rohe Lastmetriken** — TSS, Distanz, Höhenmeter | tatsächlich keine Belastung | `0` ist korrekt |
| **Abgeleitete/geglättete Metriken** — CTL, ATL, TSB, eFTP-Verlauf | der Input war an diesem Tag 0, der geglättete Wert selbst aber nicht | **letzten bekannten Wert fortschreiben** (`carry`), erst bei mehreren Fehltagen in Folge zur Lücke |
| **Messmetriken** — HRV, Ruhepuls, Schlaf, Gewicht, aerobe Effizienz, Decoupling | nicht gemessen bzw. nicht gefahren | `0` wäre eine **Falschaussage** |

Eine aerobe Effizienz von 0 an einem Ruhetag ist kein Datenpunkt, sondern ein erfundener
Einbruch — und würde jede Trendlinie verfälschen. Messmetriken bekommen deshalb eine
**Lücke** in der Linie, keinen Nullwert.

**Derselbe Fehler droht bei CTL/ATL/TSB, nur subtiler — und ist bereits einmal
tatsächlich aufgetreten:** Diese drei sind bereits geglättete, abgeleitete Werte. Ein
einzelner Ruhetag hat TSS 0, aber CTL fällt an diesem Tag nicht auf 0 — nur der
*Input* war 0. Werden CTL/ATL/TSB pauschal mit `absence: "zero"` behandelt (weil sie
wie Lastmetriken „wirken"), entsteht ein sichtbarer Zero-Einbruch an jedem Ruhetag, der
fachlich falsch ist. Für diese drei gilt deshalb ein dritter Modus:

```js
// jede Serie erklärt ihr Verhalten bei fehlenden Tagen
{ key: "tss",        absence: "zero"  }  // rohe Belastungseingabe
{ key: "ctl",        absence: "carry" }  // geglättet: letzten Wert fortschreiben
{ key: "decoupling", absence: "gap"   }  // Messmetrik: echte Lücke
```

Faustregel: **rohe Eingabe → zero. Geglättete/abgeleitete Reihe → carry. Messung →
gap.** Bei jedem neuen Chart zuerst prüfen, in welche der drei Spalten eine Serie
gehört — nicht automatisch „ist eine Lastmetrik" mit „nullen" gleichsetzen.

Das Achsengerüst ist für beide dasselbe — dadurch bleiben alle Zeitreihen-Charts
pixelgenau untereinander ausgerichtet, unabhängig davon, wie dicht die jeweilige Serie
ist. Der Tooltip zeigt bei `absence: "gap"` an einem Tag ohne Messung ausdrücklich
„keine Messung", nie einen interpolierten oder genullten Wert.

**Bedingung:** Die Densifizierung muss verbindlich *vor* jedem Zeichnen laufen, und
`data/*.json` sowie die Projektion müssen auf dieselbe Tagesreihe gebracht werden. Bricht
diese Zusage irgendwo, ist der Fehler still — die Achse verschiebt sich, ohne dass etwas
auffällt. Eine Zeitstempelskala wäre gegen den Fehler immun.

**Das ist eine Grundsatzentscheidung, keine Detailfrage** — sie ändert X3 und gehört
abgenommen, bevor Schritt 0 gebaut wird. Empfehlung: **Densifizierung**, weil sie zum
tatsächlichen Datenmodell passt (PMC ist ohnehin eine Tagesreihe) und den
Interpolationsfall zwischen zwei Tagen gar nicht erst entstehen lässt — vorausgesetzt,
`densifyDays()` wird als reine Funktion mit eigenen Tests eingeführt und nicht als
Nebenwirkung irgendwo im Ladepfad.

---

## 6. Was nicht übernommen wird

- **Tilt und Sheen** (`perspective:1600px`, `rotateX/rotateY` auf Zeigerbewegung,
  wanderndes Glanzlicht). Ein Diagramm ist eine Ableseebene; sie zu kippen, während man
  Werte abliest, arbeitet gegen den Zweck. Der Entwurf braucht dafür bereits einen
  Hilfsgriff — der Tooltip wird mit `translate3d(0,0,40px)` aus der gekippten Ebene
  gehoben. Für den Hero kann der Effekt bleiben, für Charts nicht.
- **Glow flächendeckend.** `feDropShadow` ist ein Filter pro Pfad. Hier trifft es
  höchstens vier Pfade und läuft nur beim Neuzeichnen — unkritisch. Auf den
  Bestandscharts (Small Multiples der Power-Curve, Wochenvolumen mit hunderten Rects)
  wäre es das nicht.
  **Regel: Glow ausschließlich auf die ein bis zwei Hauptserien-Linien eines Charts,
  nie auf Balken, Punkte oder Small Multiples.**
- **Die x-Achsenbeschriftung des Entwurfs.** `nT = Math.min(6, we - ws)` und dann
  gleichmäßig **nach Index** verteilt — das ergibt beliebige Daten wie 24.03. / 01.05. /
  09.06., die beim Ziehen wandern. Die bestehende Lösung ist besser: Kalender-Ticks
  (Monatserste bzw. Montage) durch `pickLabelIndices()` ausgedünnt. **Bestehende Logik
  behalten.**
- **Feste Filter-IDs** (`gCtl`, `gAtl`, `gTsb`). SVG-Filter-IDs sind dokumentweit; die App
  zeigt viele Charts auf einer Seite. Beim Port pro Chart-Instanz namensräumen.

---

## 7. Chart-Familien — was wovon erbt

Die Grundlage ist ein **Leitfaden, keine Schablone.** Sie zerfällt in zwei Schichten.

### 7.1 Schicht A — invariant, gilt für jedes Chart ohne Ausnahme

Tokens und Flächen (§2) · Textleiter · abgestuftes Gitter · Achseneinheit über der
obersten Achsenzahl (G4) · gemessene Breite + `ResizeObserver` (G7) · ein geteilter
HTML-Tooltip pro Ansicht mit escapten Inhalten (G6) · Hover-Ebene als separate `<g>`
statt Neuzeichnen (§4.1) · Filter-IDs pro Instanz namensräumen (G8) · kein Tilt (G9) ·
`path()`/`txt()`/`el()` als Zeichenhelfer.

### 7.2 Schicht B — pro Familie abgeleitet

| Familie | Charts | x-Achse | Beschriftung | Glow | Brush | Fadenkreuz |
|---|---|---|---|---|---|---|
| **1 · Zeitreihe dicht** | PMC (CTL/ATL/TSB), FTP-Prognose | Tagesindex, `absence: zero` | direkt an der Kurve, `halo()` + `flat()` | Hauptserie | ✅ Fläche | ✅ tagesgenau |
| **2 · Zeitreihe lückig** | HRV, Ruhepuls, Schlaf, Gewicht, aerobe Effizienz, Decoupling, eFTP-Verlauf | Tagesindex, `absence: gap` | direkt an der Kurve | nur wenn Hauptserie des Charts | ✅ Fläche | ✅ tagesgenau, „keine Messung" bei Lücke |
| **3 · Aggregatbalken** | Wochenvolumen, wochenweises Wetter | Zeit-Buckets (Woche/Monat) | Wert am Balken, kein `flat()` | ⛔ nie | Ziel, nicht Fläche | ✅ bucketweise |
| **4 · Nicht-Datumsachse** | Power-Curve (Dauer, log), Zonenverteilung, Streudiagramme | eigene Skala (kategorial oder numerisch) | Achsentitel, keine Kurvenbeschriftung | ⛔ | ⛔ | ⛔ |
| **5 · Small Multiples** | Power-Small-Multiples, Body-Charts-Raster | je Panel | Panel-Titel statt Kurvenlabel | ⛔ nie | ⛔ | optional |
| **6 · Kalender/Matrix** | Konsistenz-Kalender | Wochenraster | eigene Farbskala-Legende | ⛔ | ⛔ | ✅ tagesgenau |

**Einordnung folgt der x-Semantik, nicht der Darstellungsform.** Ob eine Familie Linien
oder Balken zeichnet, ist ein zweites, unabhängiges Merkmal. Konkret für die
Grenzfälle:

- **Wetter pro Tag** gehört zu Familie 1/2 mit `mark: "bar"` — es hat eine echte
  Tagesachse und kann tagesgenau am Fadenkreuz teilnehmen, obwohl es Balken zeichnet.
  Nur eine *wochenweise* aggregierte Wetteransicht gehört zu Familie 3.
- **Zonenverteilung** gehört **nicht** zu Familie 3, sondern zu Familie 4: ihre x-Achse
  ist kategorial (Z1…Z5), nicht zeitlich. Sie hat keinen Bucket, auf den ein Datum
  abgebildet werden könnte, und nimmt deshalb nicht am Fadenkreuz teil.

Familie 3 bleibt damit auf echte Zeit-Buckets beschränkt — im Bestand ist das im
Wesentlichen das Wochenvolumen.

### 7.3 Verknüpfungsregel

Ein Fadenkreuz verbindet nur Charts, die dieselbe x-Semantik teilen. Konkret:

- **Familie 1, 2 und 6** teilen den Tagesindex und sind direkt koppelbar.
- **Familie 3** koppelt über eine Abbildung `Tag → Bucket`: ein Hover am 14.08. hebt in
  der Wochenvolumen-Ansicht den ganzen Balken der zugehörigen Woche hervor, nicht eine
  Position darin. Die Abbildung gehört als reine Funktion nach `core/`, nicht in die
  Zeichenschicht.
- **Familie 4 und 5** nehmen nicht teil. Sie erben Schicht A vollständig und von Schicht B
  nichts, was mit Datum zu tun hat. Ihr Hover ist „nächstgelegener Punkt", nicht
  „gleicher Tag".

Balkencharts sind **Brush-Ziel, nicht Brush-Fläche**: ein Klick auf eine Woche setzt das
Zeitfenster auf diese Woche, aber man zieht nicht im Balkenchart selbst — dort gibt es
keine sinnvolle Zwischenposition.

### 7.4 Vorgehen beim Ableiten eines konkreten Charts

1. Familie bestimmen (Tabelle 7.2).
2. Schicht A vollständig übernehmen — hier gibt es nichts zu entscheiden.
3. Aus Schicht B die Zeile der Familie anwenden.
4. Für jede Serie `absence` festlegen (§5) und die y-Einheit benennen (G4).
5. Abweichungen von Schicht B im Kopfkommentar des Chart-Moduls begründen. Abweichungen
   von Schicht A gibt es nicht — wenn sich eine aufdrängt, ist stattdessen dieses
   Dokument zu ändern.

---

## 8. Konsequenz für den Bestand (korrigiert)

> **Nachtrag nach erster Umsetzungsrunde:** Der ursprüngliche §8 ging von einem
> separaten Explorer-Tab neben dem unveränderten Charts-Tab aus und wog drei Wege ab,
> wie beide später zusammengeführt würden. Diese Prämisse war falsch — Alex' Ziel war
> von Anfang an die direkte Modernisierung von `pmc.js` und den anderen Bestandscharts,
> kein zusätzlicher Tab. Es gibt deshalb keine zwei Bildsprachen, die vereinheitlicht
> werden müssten, und keinen separaten Phase-7-Schritt. Die drei Wege unten sind
> historisch stehen gelassen, gelten aber nicht mehr — s. G12 (revidiert).

Diese Grundlage ist **nicht** kompatibel mit dem heutigen Charts-Tab. Unterschiedlich sind:
Rahmen (`0.5px solid #2a3140` gegen rahmenlos), Radien, Serienfarben, Skalenverhalten
(skaliertes viewBox gegen gemessene Breite), Tooltip-Mechanismus (`Tooltip` aus
`ui/dom.js` gegen geteiltes Karten-Overlay) und Beschriftungsstrategie (Legende gegen
Direktbeschriftung mit Plättchen).

Damit verschärft sich die Warnung aus dem Phase-5-Konzept §8: Der Fahrplan-Schritt
**„Vereinheitlichung" ist unter dieser Grundlage kein [HA]-Kosmetikschritt mehr, sondern
ein Redesign des Charts-Tabs** in der Größenordnung [OP]. Drei Wege:

1. **Explorer bekommt die neue Grundlage, Charts-Tab bleibt wie er ist.** Zwei sichtbar
   verschiedene Bildsprachen in einer App, auf unbestimmte Zeit. Billig, aber inkonsistent
   an einer öffentlich sichtbaren Stelle.
2. **Explorer bekommt die neue Grundlage, Charts-Tab wird später bewusst nachgezogen**
   als eigener, neu eingeplanter Fahrplan-Schritt. Ehrlich, aber der Fahrplan bekommt
   einen Posten dazu, den er heute nicht hat.
3. **Grundlage wird auf das abgespeckt, was mit dem Bestand verträglich ist** — Primitiven
   und Interaktionskonventionen ja, Flächen/Radien/Farben nein. Konsistent, verschenkt
   aber genau die Qualität, für die der Design-Umweg gemacht wurde.

Empfehlung: **Weg 2.** Der Design-Sprung ist die Sache wert, und ihn zu machen, ohne ihn
einzuplanen, ist der einzige Weg, der sicher schiefgeht.

---

## Getroffene Entscheidungen (Vorschlag — Abnahme steht aus)

- **G1 — Zeichenlogik des Entwurfs wird portiert, nicht neu erfunden.** React ist nur
  Hülle; `drawMain`/`drawTsb`/`drawOv` sind framework-frei.
- **G2 — `CHART_THEME` bekommt einen Rollenblock** (`primary`/`secondary`/`positive`/
  `status`) **zusätzlich zu** den bestehenden Zonenfarben, die weiter gebraucht werden.
- **G3 — Neu in `base.js`:** `path()`, `halo()`, `flat()`, `glowDefs()`, abgestuftes
  Gitter, Rundung auf runde Achsenwerte, Achseneinheit über der Achse, Hover-Layer plus
  Geometrie-Objekt.
- **G4 — Jedes Chart nennt seine y-Einheit** an fester Stelle über der obersten
  Achsenzahl (CTL/ATL: `TSS/Tag`).
- **G5 — Serienbeschriftung direkt an der Kurve** mit Label-Plättchen und
  `flat()`-Platzierung; Legenden nur, wo Direktbeschriftung nachweislich nicht trägt.
- **G6 — Ein geteilter HTML-Tooltip pro Ansicht**, nicht einer pro Chart; Inhalte
  escaped, nie roh interpoliert.
- **G7 — Gemessene Breite + `ResizeObserver`** statt skaliertem viewBox.
- **G8 — Glow nur auf Hauptserien-Linien**, nie auf Balken oder Small Multiples;
  Filter-IDs pro Chart-Instanz namensräumen.
- **G9 — Tilt/Sheen nicht in Charts.**
- **G10 — X3 wird ersetzt: Densifizierung statt Zeitstempelskala.** Densifiziert wird
  das **Achsengerüst**, nicht die Serie: Lastmetriken (TSS/CTL/ATL/TSB) werden mit `0`
  aufgefüllt, Messmetriken (HRV, Ruhepuls, Gewicht, aerobe Effizienz, Decoupling)
  bekommen eine Lücke. Jede Serie erklärt `absence: "zero" | "gap"`.
- **G11 — Kalender-Ticks + `pickLabelIndices()` bleiben**, die Tick-Logik des Entwurfs
  wird verworfen.
- **G12 (revidiert) — Kein eigener Nachzug-Schritt.** Die Bestandscharts werden direkt
  modernisiert (`pmc.js` zuerst, s. `docs/phase-5-konzept-explorer.md` §2.3), nicht über
  einen separaten Tab mit späterer Vereinheitlichung. Ursprüngliche Fassung von G12 in
  §8 historisch dokumentiert, gilt nicht mehr.
- **G13 — Die Grundlage ist zweischichtig:** Schicht A (Tokens, Tooltip, Hover-Ebene,
  gemessene Breite, Achseneinheit) gilt ausnahmslos; Schicht B (Beschriftung, Glow,
  Brush, Fadenkreuz) wird pro Chart-Familie abgeleitet, s. §7.
- **G14 — Fadenkreuz verbindet nur Charts gleicher x-Semantik.** Balkencharts koppeln
  bucketweise über eine reine `Tag → Bucket`-Funktion in `core/`; Power-Curve und
  Small Multiples nehmen nicht teil.

## Offene Punkte → `docs/offene-punkte.md`

- `halo()`-Textbreitenschätzung (`length * 6.4`) durch Messung ersetzen.
- TSB-Panel platziert sein Serienlabel an fester Relativposition statt über `flat()` —
  kann auf der Linie landen. Beim Port vereinheitlichen.
- Kein Tastaturpfad für den Brush (gleiche A11y-Lücke wie beim Drag & Drop).
- `Tooltip` aus `ui/dom.js` und das neue Overlay-Muster sind zwei Mechanismen für dieselbe
  Aufgabe — zusammenführen, wenn der Charts-Tab nachgezogen wird.
