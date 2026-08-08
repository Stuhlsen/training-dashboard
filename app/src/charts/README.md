# charts/

Portierung der SVG-Chart-Logik. Grundsatzentscheidung (Etappe 8a,
festgelegt): **React-Komponenten mit echtem JSX-SVG**, kein
`document.createElementNS`-Weiterverwendung, keine Chart-Bibliothek
(kein `d3-scale`/`d3-shape` o.ä.) — react-graph-gallery.com dient nur als
optisches Vorbild, nicht als Code-Quelle.

Farben werden direkt über `style={{ stroke: "var(--role-primary)" }}` auf
den SVG-Elementen gesetzt und lesen die in `styles/tokens.css` reservierten
`--role-*`-Tokens. Das löst das vanilla-Problem, Farben zusätzlich in einem
JS-Objekt (`CHART_THEME`) spiegeln zu müssen ("SVG-Farben können keine
CSS-Variablen nutzen", AGENTS.md) — die Einschränkung gilt nur für rohe
Presentation-Attribute (`stroke="..."`), nicht für den `style`-Attribut-Weg.

Pure, DOM-freie Chart-Mathematik (Skalen, Label-Ausdünnung, Serien-Ableitung)
liegt in `core/` (`chart-scale.js`, `pmc-series.js`), NICHT hier — anders als
vanilla (`ui/charts/base.js`), wo dieselben Funktionen aus Konsistenzgründen
mit einer bestehenden Testdatei im DOM-Layer bleiben (docs/phase-5-konzept-
explorer.md §1.4, X3). In React gibt es diesen Präzedenzfall nicht, dafür
bereits andere pure Chart-Stützlogik in `core/` (`days.js`,
`chart-buckets.js`) — deshalb hier die strengere Trennung.

`charts/` selbst enthält nur die eigentlichen React/SVG-Komponenten:

- `ChartTooltip.tsx` — wiederverwendbare Punkt-Tooltip-Box.
- `PmcChart.tsx` — erster Chart (CTL/ATL/TSB), Etappe 8a. Nimmt seit Etappe
  8b optional eine `range`-Prop (das Brush-Fenster) entgegen, ohne Prop
  bleibt der bisherige 90-Tage-Fixdefault erhalten.
- `BrushBar.tsx` — Zeitraum-Brushing (Etappe 8b, docs/phase-5-konzept-
  explorer.md §4): schmale Übersichtsleiste über dem vollen Horizont
  (Anker-Fahrt bis `projection.horizonEnd`), zwei Handles + Fenster-Rect
  per Pointer Events (`setPointerCapture`, kein `document`-Listener nötig),
  Presets (30/90/365 Tage/Plan 2/alles). Zustand kommt von außen
  (`range`/`onRangeChange`) — die Persistenz übernimmt
  `api/hooks/useExplorerRange.ts` (`localStorage("explorer_<athleteId>")`).
  Weiterhin ohne Szenario/Compare/Cursor-Sync — die kommen in 8c–8e,
  `power`/`training`/`wellness` folgen nach demselben Muster in 8f.
- `PowerCurveChart.tsx` — Power-Curve (Etappe 8f, Familie 4). Index-basierte
  x-Achse über die 11 Standard-Zeitintervalle (`core/powercurve.js`),
  FTP-Referenzlinie. Ohne W/kg-Toggle, ohne Block-Overlay-Vergleich.
- `WeeklyVolumeChart.tsx` — Wochenvolumen (Etappe 8f, Familie 3). Slot-
  basierte x-Achse über `core/aggregate.js::weeklyByCalendar`, Zielzone bei
  eigenem Plan. Ohne Bucket-Hover-Kopplung/Brush-Klick.
- `WellnessChart.tsx` — HRV/Ruhepuls-Trend (Etappe 8f, Familie 2), Metrik-
  Umschalter statt zwei separater Komponenten. `core/days.js::densifyDays`/
  `joinSeries("gap")` + `core/wellness-series.js` für den Notion/intervals.icu-
  Merge des Eigenplan-Athleten.
