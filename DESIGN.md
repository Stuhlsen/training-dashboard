---
name: Training Dashboard
description: Dunkles, glasiges Radsport-Trainingsdashboard mit Trainingszonen als durchgängigem Farbsystem
colors:
  bg: "#0b0e13"
  bg-2: "#0e1219"
  card: "rgba(255, 255, 255, 0.045)"
  card-alt: "rgba(255, 255, 255, 0.07)"
  card-hover: "rgba(255, 255, 255, 0.09)"
  card-solid: "#141924"
  border: "rgba(255, 255, 255, 0.10)"
  border-light: "rgba(255, 255, 255, 0.18)"
  text: "#e2e7ef"
  dim: "#97a1b3"
  dim-2: "#5f6878"
  zone-recovery: "#4a9a6e"
  zone-endurance: "#4a7fa8"
  zone-tempo: "color-mix(in oklch, #e08a3c 75%, black 25%)"
  zone-sweetspot: "#e08a3c"
  zone-threshold: "#d94f4f"
  zone-vo2max: "#a24ad0"
  records-gold: "#c9a84c"
  accent-ink: "#17110a"
  overlay-shadow: "rgba(0, 0, 0, 0.55)"
  phase-1: "#6b7280"
  phase-3: "#7c5cbf"
  chart-primary: "#4a9eff"
  chart-secondary: "#e0736b"
  chart-positive: "#6fc48c"
  chart-status: "#e8b73f"
typography:
  display:
    fontFamily: "Sora, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.35rem, 3vw, 1.9rem)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, Segoe UI, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "0.72rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.14em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "22px"
  xl: "28px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "30px"
components:
  button-primary:
    backgroundColor: "{colors.zone-sweetspot}"
    textColor: "#17110a"
    rounded: "{rounded.pill}"
    padding: "9px 22px"
  tab-btn:
    backgroundColor: "{colors.card}"
    textColor: "{colors.dim}"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  tab-btn-active:
    backgroundColor: "{colors.zone-sweetspot}"
    textColor: "#17110a"
    rounded: "{rounded.pill}"
    padding: "11px 22px"
  metric-card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.lg}"
    padding: "14px 16px 14px 19px"
---

# Design System: Training Dashboard

## Overview

**Creative North Star: "Der Glas-Belastungsmesser" (The Glass Strain Gauge)**

Das System ist ein Instrument, kein Ornament. Weiche, transluzente Glaskacheln liegen auf einem
tiefen Anthrazit-Blau-Grund; alles ist standardmäßig ruhig und zurückhaltend, damit Farbe genau
dort auffällt, wo sie tatsächlich Bedeutung trägt — die Trainingszonen-Skala (Recovery-Grün bis
VO2max-Violett), die durchgängig als Farbsystem funktioniert, nicht als Dekoration. Der Bildschirm
liest sich wie ein präzises Cockpit-Readout: IBM Plex Mono für nüchterne, tabellarische Meta-Daten
und Labels, Sora für die großen, selbstbewussten Zahlen und Überschriften, Inter für alles, was
tatsächlich gelesen werden soll statt nur abgelesen.

Dichte ist mittel-hoch (Dashboard-Charakter, viele Kacheln pro Screen), aber jede Kachel bleibt
großzügig gerundet und atmet durch großen Innenabstand statt durch harte Linien. Interaktive
Steuerelemente (Tabs, Toggles, Chips) sind fast durchgängig Pill-förmig; Ränder sind Haarlinien
(1px, 10–18% Weiß-Deckkraft), nie schwere Umrandungen.

**Key Characteristics:**
- Dunkler, ruhiger Grund; Farbe ist Bedeutung, nicht Deko
- Fünfstufiges Zonen-Farbsystem als durchgängige Klammer (Band, Charts, Kartenkanten)
- Glas-Kacheln: transluzent, großer Radius, Haarlinien-Rand, kaum Schatten
- Pill-Form für alles Interaktive; kleine `radius-sm`-Tags für statische Status-Labels
- Dreiklang-Typografie: Sora (Zahlen/Headlines) · IBM Plex Mono (Labels/Meta) · Inter (Fließtext)

## Colors

Die Palette ist bewusst zurückhaltend: ein einziger warmer Akzent (Sweet-Spot-Orange) gegen einen
kühlen, fast farblosen Anthrazit-Grund — Farbe außerhalb des Zonensystems ist die Ausnahme, nicht
die Regel.

### Primary
- **Sweet Spot Ember** (#e08a3c): Der einzige durchgängige Marken-/Aktionsakzent — primäre Buttons,
  aktiver Tab, Fokusringe, Slider-Thumbs. Steht zugleich für die Sweet-Spot-Trainingszone und für
  Plan 2 — bewusste Doppelbedeutung, kein Zufall.

### Secondary
- **Endurance Steel Blue** (#4a7fa8): Zweithäufigster interaktiver Akzent — aktiver
  Athleten-Toggle (mit Glow-Schatten), Session-Pill, Plan-1-Kennzeichnung. Steht für die
  Grundlagen-/Endurance-Zone.

### Tertiary
- **Records Gold** (#c9a84c): Eigenständiger, sparsam eingesetzter Auszeichnungs-Akzent für
  Bestwerte (Records-Wand) und die "Vor-Plan"-Phase — bewusst getrennt vom Zonensystem, kein
  Zonen-Farbwert.

### Neutral
- **Void Anthracite** (#0b0e13 → #0e1219): Seitenhintergrund, als fixierter vertikaler Verlauf mit
  zwei sehr subtilen radialen Zonen-Schimmern (Blau oben rechts, Orange unten links).
- **Glass Whisper** (rgba(255,255,255,0.045) / 0.07 / 0.09 für Ruhe/Alt/Hover): die Kachel-Füllung
  selbst — nie deckend, außer bei Tooltip/Dropdown (**Card Solid**, #141924).
- **Frost White** (#e2e7ef): Haupttextfarbe.
- **Fog Grey** (#97a1b3) / **Slate Ash** (#5f6878): gedämpfter Text bzw. Meta-/Tertiärtext.
- **Hairline** (rgba(255,255,255,0.10) / 0.18 hell): Kartenränder, Divider — nie eine dickere
  Kontur.
- **Accent Ink** (#17110a): fester dunkler Text auf jeder voll gefüllten Akzentfläche (aktiver
  Tab, Primary-Button, aktives Pill-Segment) — Kontrastpartner von Sweet Spot Ember, kein
  eigenständiger Text-Ton sonst.
- **Overlay Shadow** (rgba(0,0,0,0.55)): die Schattenfarbe hinter Tooltip/Dropdown (s. Elevation).

### Phase Colors (Plan 1, unabhängige Nebenskala)
Vier zusätzliche, ausschließlich für Plan-1-Phasen-Tags reservierte Farben — bewusst getrennt vom
Zonensystem, da Plan-1-Phasen keine Trainingszone sind: **Vor-Plan** (#c9a84c, identisch mit
Records Gold — geteilte Bedeutung "Vorbereitung/Achievement"), **Phase 1** (#6b7280, neutral-grau),
**Phase 2** (#4a7fa8, identisch mit Endurance Steel Blue), **Phase 3** (#7c5cbf, eigenständiges
Violett, unterscheidbar von VO2 Violet #a24ad0).

### Named Rules
**The Zone-Coded Rule.** Die fünf Zonenfarben (Recovery-Grün #4a9a6e, Endurance-Blau #4a7fa8,
Tempo — ein abgedunkelter Sweet-Spot-Ton statt einer neuen Basisfarbe, Sweet-Spot-Orange #e08a3c,
Schwelle-Rot #d94f4f, VO2max-Violett #a24ad0) sind ein einziges, überall wiederverwendetes
Bedeutungssystem — Leistungsskala im Hero, Kartenakzentkante, Chart-Serien, Tag-Farben. Dieselbe
Zone bekommt überall dieselbe Farbe; die Zuordnung wird nie für ein unverwandtes Konzept
zweckentfremdet.

**The Separate-Namespace Rule.** Die vier Chart-Rollenfarben (chart-primary/-secondary/-positive/
-status) benennen die FUNKTION einer Datenserie innerhalb eines einzelnen Charts (z.B. "Ist" vs.
"Soll"), nicht die physiologische Zone. Beide Systeme koexistieren, dürfen aber nicht verwechselt
oder ineinander aufgelöst werden.

## Typography

**Display Font:** Sora (mit system-ui, -apple-system Fallback)
**Body Font:** Inter (mit Segoe UI, system-ui Fallback)
**Label/Mono Font:** IBM Plex Mono (mit ui-monospace, Cascadia Mono Fallback)

**Character:** Sora trägt die großen Zahlen und Headlines mit ruhigem, geometrischem
Selbstbewusstsein; IBM Plex Mono gibt Labels und Meta-Zeilen die Präzision eines
Instrumenten-Readouts (oft großgeschrieben, breit getrackt); Inter bleibt für Fließtext im
Hintergrund und stört die beiden anderen nie.

### Hierarchy
Die Skala ist bewusst engstufig statt sprunghaft (Dashboard mit vielen dichten Datenkacheln
braucht feine Abstufung, keine plakative Handvoll Größen). Reale Stufen zwischen 0.6rem und
1.5rem, Ratio nur ~1.7:1 über die gesamte Spanne:
- **Display** (700, `clamp(1.35rem, 3vw, 1.9rem)`, 1.18; auch feste 1.5rem/700 bei
  Metric-Card-Value): Hero-Headline (`<h1>`), größte Zahlenwerte.
- **Title** (700, 0.88rem–1.1rem, normal): Panel-Titel, hervorgehobene Section-Labels
  (`.section-label-prominent`), Kartenüberschriften (`h3`).
- **Body** (400, 0.79rem–0.9rem/≈11–13px, 1.5–1.7): Fließtext, Beschreibungen, Analyse-Absätze,
  Zusammenfassungen.
- **Label** (500–600, 0.68rem–0.78rem, letter-spacing 0.02–0.14em, oft Großbuchstaben): Meta-Zeilen,
  Section-Labels, Tab-/Chip-Beschriftungen, tabellarische Werte (`font-variant-numeric:
  tabular-nums`). Die kleine Mono-Uppercase-Label-Familie (Tages-/Wochen-Label, Tabellenkopf,
  Tile-Titel) läuft einheitlich über `--fs-label` (0.72rem) bzw. `--fs-section-label` (0.78rem,
  echte Abschnittsüberschriften) in `app/src/styles/tokens.css` — vor der Typeset-Etappe
  2026-08-19 lag dieselbe Rolle bei 0.6–0.68rem (≈8.4–9.5px bei `body{font-size:14px}`) und war
  laut Live-Browser-Audit die kleinste im System, obwohl sie an vielen Stellen (Tabellenkopf,
  Tages-Label) die alleinige Informationsquelle war statt echter Sekundär-Meta; die Erhöhung
  behebt genau diesen Widerspruch. Echte Sekundär-Meta (Einheit neben Zahl, Datum neben Titel)
  darf weiterhin am unteren Rand der Spanne bleiben.

### Named Rules
**The Mono-for-Meta Rule.** Jede Meta-, Label- oder Readout-Zeile (Datum, Einheit, Sub-Wert,
Section-Label) läuft in IBM Plex Mono, oft in Versalien mit breitem Letter-Spacing — das ist das
visuelle Signal "das hier ist eine Messung", nie ein Stilzufall.

**The Fine-Grained Scale Rule.** Die Typo-Skala springt bewusst nicht in großen Stufen (kein
1.25er/1.333er-Modularsystem) — bei einem dichten Datendashboard mit vielen nebeneinander
stehenden Kachel-Werten braucht jede Content-Klasse (Label vs. Sub-Label vs. Meta vs. Wert) eine
eigene, nur leicht abgesetzte Stufe. Eine neue Stufe innerhalb 0.6–1.5rem ist erwartbar und kein
Skalenbruch; ein Sprung außerhalb dieser Spanne (deutlich kleiner oder zwischen Body und Display)
wäre es.

## Layout

Container: `max-width: 1280px`, zentriert, seitliches Padding 20px (12px auf ≤640px). Utility-Grids
(`grid-auto`/`grid-2col`/`grid-3col`) arbeiten mit `repeat(auto-fit, minmax(...))` — 150–300px
Mindestspaltenbreite je nach Kontext, kein festes Spaltenraster. Der Hero ist ein 2-Spalten-Grid
(Inhalt + 232px feste Ring-Spalte), das unter 840px auf eine Spalte kollabiert und die Ring-Spalte
nach oben zieht (`order: -1`). Die Tab-Leiste ist `position: sticky; top: 0` mit
Backdrop-Blur-Hintergrund. Spacing-Rhythmus bewegt sich meist zwischen 8px (Grid-Gap) und 30px
(Hero-Padding); Kachel-Innenabstand typischerweise 14–19px.

## Elevation & Depth

Flach als Standard: Glas-Kacheln tragen keinen `box-shadow`, ihre Tiefe kommt ausschließlich aus
Transluzenz + Backdrop-Blur + Haarlinien-Rand. Ein echter Schatten erscheint gezielt nur dort, wo
etwas tatsächlich über der Seite schwebt oder aktiv hervorgehoben ist: Tooltip/Dropdown (`0 8px
28px rgba(0,0,0,0.55)`), Zonen-Tooltip (`0 8px 24px rgba(0,0,0,0.45)`), und der aktive
Athleten-Toggle (`0 4px 14px rgba(74,127,168,0.35)`, farbig passend zum Blau-Akzent).

### Shadow Vocabulary
- **Overlay** (`box-shadow: 0 8px 28px rgba(0,0,0,0.55)`): Tooltip, Dropdown — deckende Elemente
  über Chart-Inhalt.
- **Active Glow** (`box-shadow: 0 4px 14px rgba(74,127,168,0.35)`): aktiver Athleten-Toggle — Farbe
  des Schattens spiegelt die Akzentfarbe des aktiven Zustands.

### Named Rules
**The Flat-by-Default Rule.** Kacheln sind im Ruhezustand immer schattenlos. Ein `box-shadow`
erscheint ausschließlich als Reaktion auf echtes Überlagern (Tooltip/Dropdown) oder einen aktiven,
farblich bedeutungstragenden Zustand — nie als generisches "Card lifted"-Dekor.

## Shapes

Große, weiche Radien tragen das System: `--radius` 12px als Basis, `--radius-sm` 8px für kleine
Elemente (Tags, statische Labels), `--radius-lg` 22px für die meisten Glas-Kacheln (Metric-Card,
Panel-Card, Chart-Group-Header), `--radius-xl` 28px für den Hero. Alles Interaktive — Tabs, Toggles,
Buttons, Chips, Pill-Toggle — ist vollständig pillenförmig (`--pill` 999px). Ränder sind
grundsätzlich 1px-Haarlinien in Weiß-Transparenz, nie dicker oder in Vollfarbe außer bei den
zonenfarbigen Akzentkanten (`::before`-Leiste links an Metric-Cards).

## Components

### Buttons
- **Shape:** vollständig pillenförmig (`border-radius: 999px`)
- **Primary:** `background: var(--accent)` (Sweet-Spot-Orange) auf dunklem Text (`#17110a`) —
  bewusst hoher Kontrast, da der Akzent selten und gezielt eingesetzt wird; Padding `9px 22px`,
  Schrift Sora 600
- **Ghost/Tab:** transparent bzw. `var(--card)`-Füllung, Rand `var(--border)`, Text `var(--dim)`;
  Hover hellt Text/Rand auf, aktiver Zustand füllt komplett mit dem Akzent

### Chips / Pills / Tags
- **Interaktive Pills** (Tab-Btn, Athleten-Toggle, Pill-Toggle, Ghost-Toggle): `999px`-Radius,
  transparent/`var(--card)` im Ruhezustand, voll gefüllt im aktiven Zustand
- **Statische Tags** (`.tag-*`, Phasen-/Status-Kennzeichnung): kleiner `radius-sm` (8px),
  getönter Hintergrund (`rgba(farbe, 0.12)`) mit passendem, gleichfarbigem 1px-Rand und Textfarbe
  — Farbe und Bedeutung sind eins zu eins gekoppelt (z.B. `.tag-p2` = Blau = Plan 2)

### Cards / Containers
- **Corner Style:** `--radius` (12px) für einfache `.card`, `--radius-lg` (22px) für die meisten
  Signature-Kacheln (Metric-Card, Panel-Card)
- **Background:** `var(--card)`, transluzentes Weiß auf dunklem Grund
- **Shadow Strategy:** keine (siehe Elevation & Depth) — Tiefe kommt aus Transluzenz, nicht Schatten
- **Border:** 1px `var(--border)`, hellt bei Hover zu `var(--border-light)` auf
- **Signature-Detail:** Metric-Card trägt statt vollflächiger Farbe eine 3px breite, weich
  abgesetzte Akzentkante links (`::before`), gefärbt nach Zonen-/Kontextfarbe (`--mc-color`)

### Inputs / Fields
- **Range-Slider** (What-if-FTP, Chart-Szenario): `accent-color: var(--ss)` — folgt dem
  Primärakzent unabhängig vom umgebenden Kontext

### Navigation
- **Tabs:** sticky oben, transluzenter/Backdrop-Blur-Hintergrund, Pill-Buttons; aktiver Tab füllt
  komplett mit dem Akzent (dunkler Text `#17110a` für Kontrast); Athleten-Toggle steht optisch
  getrennt (Divider-Linie) rechtsbündig in derselben Leiste

### Zonenband (Signature Component)
Die horizontale Fünf-Segment-Leistungsskala im Hero ist das visuelle Herzstück des Systems: eine
durchgehende Pill-Leiste, in den fünf Zonenfarben segmentiert, mit Pins für FTP/eFTP/Ziel und einem
schmalen Sweet-Spot-Overlay-Balken über der Z3/Z4-Naht. Sie ist der Ort, an dem das
Zonen-Farbsystem buchstäblich zu einer Skala wird — jede andere zonenfarbige Fläche im System
(Kartenkante, Chart-Serie, Tag) verweist implizit auf dieses Band zurück.

## Do's and Don'ts

### Do:
- **Do** den Akzent (`--accent` / Sweet-Spot-Orange) auf höchstens ein aktives/primäres Element
  pro Ansicht konzentrieren — seine Seltenheit ist der Punkt.
- **Do** Zonenfarben (z1–vo2) überall identisch zuordnen (Band, Chart, Kartenkante, Tag) — nie
  fürs selbe Konzept eine andere Farbe, nie dieselbe Farbe für ein anderes Konzept.
- **Do** Meta-/Label-Text in IBM Plex Mono setzen, oft groß/breit getrackt; Sora für Headlines und
  große Zahlen; Inter für Fließtext.
- **Do** Kacheln im Ruhezustand flach und transluzent halten; Schatten nur für echte Overlays oder
  einen aktiv-hervorgehobenen Zustand.

### Don't:
- **Don't** einen `box-shadow` auf eine ruhende Kachel legen — bricht die Flat-by-Default-Regel.
- **Don't** Chart-Rollenfarben (`--chart-primary` etc.) und Zonenfarben austauschbar verwenden —
  getrennte Bedeutungssysteme, auch wenn beide "Farbe mit Funktion" sind.
- **Don't** dicke/deckende Ränder statt Haarlinien einsetzen — der Glas-Charakter lebt von der
  1px-Transparenz.
