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
- `ConsistencyCalendar.tsx` — Trainingskonsistenz-Wochenstreifen (Etappe 12a,
  Familie 6 — eigene Layout-Logik, kein Zeitreihen-Baumuster). Eine Zelle pro
  Woche ab der ersten aktiven Woche, Farbintensität = Trainingstage (0–7) via
  `core/consistency.js::weeklyConsistency`, kein Fadenkreuz.
- `FtpForecastChart.tsx` — FTP-Retest-Prognose (Etappe 12b, Familie 1 — echte
  Kalenderdatums-x-Achse statt Tages-Skelett, kein `makeIndexScale`). Port von
  `assets/js/ui/charts/pmc.js::renderFtpForecast()`. eFTP-Verlauf +
  Ziel-Linie + Projektions-Fächer bis zum Retest-Termin (nur bei eigenem
  Plan) über `core/ftp-forecast.js` — dieselben Funktionen, die
  `analysis-view-model.ts::buildPowerDiagnostics()` für die Text-Sektion
  (FtpTriad) nutzt.
- `EfficiencyChart.tsx` — Aerobe Effizienz Watt/HF (Etappe 12c, erweitert um
  Rohlinie + Klick-Scatter in der Etappe "EF-Trendlinie + Scatter",
  20.08.2026 — ersetzt seitdem auch den früheren `TempoTrendChart`). Achse
  ist der FAHRT-Index (chronologisch), NICHT das Tagesgerüst/`joinSeries`-
  Muster von WellnessChart/SleepChart (Familie 2) — deren Lücken-Linie
  verbindet bewusst über Messlücken hinweg, hier soll eine Fahrt ohne EF
  genau umgekehrt eine sichtbare Lücke erzeugen. Die Rohlinie ist deshalb in
  Segmente zerlegt (ein `<path>` je zusammenhängendem Lauf mit EF-Wert).
  `core/efficiency.js::efficiencyTrend` liefert zusätzlich Rolling-Mean +
  Vergleichbarkeits-Set als zweite, geglättete Overlay-Linie. Klick auf
  einen Punkt öffnet `EfficiencyDetailScatter.tsx` (Watt/kg vs. km/h,
  gefärbt nach Höhenmeter/km) — kein eigener `ChartSection`-Eintrag, reine
  Unterkomponente.
- `DecouplingChart.tsx` — Aerobe Entkopplung/HF-Decoupling (Etappe 12c,
  Familie 2). Port von `assets/js/ui/charts/pmc.js::renderDecoupling()`, dabei
  auf densifyDays/joinSeries("gap")/makeIndexScale umgestellt (vanilla nutzte
  noch eine reine Ride-Index-x-Achse) — Angleichung an die Familie-2-
  Konvention der übrigen React-Charts. `core/efficiency.js::decouplingTrend`
  liefert Median/stabilen Anteil/Trend, `null` bei < 5 geeigneten Fahrten
  (Leerzustand "Datenbasis wächst noch").

Seit den späteren Etappen zusätzlich hinzugekommen (nicht mehr einzeln nach
Etappe dokumentiert, gleiche Grundsätze wie oben — reine SVG/JSX-Komponenten,
DOM-freie Mathematik bleibt in `core/`):

- `CadenceChart.tsx` — Kadenz-Verlauf + Statistik-Chips ("Kadenz-Coach").
- `CompareChart.tsx` / `ComparePanel.tsx` — Vergleichsmodus im PMC-Chart:
  zwei Zeitfenster relativ übereinandergelegt (Tag 1 = Blockstart).
- `EfficiencyDetailScatter.tsx` — Klick-Scatter aus `EfficiencyChart.tsx`
  (Watt/kg vs. km/h, gefärbt nach Höhenmeter/km), keine eigene Chart-Route.
- `EnergyWeightChart.tsx` — Gewichtstrend + Energiebilanz-Näherung
  ("Regeneration & Körper").
- `HrTrendChart.tsx` — Tempo/HF-Entwicklung (IQR-gefiltert).
- `HydrationChart.tsx` — Hydration aus der Wellness-Sektion.
- `PowerCurveTraceCard.tsx` / `TraceCard.tsx` / `TraceLane.tsx` — Spurenkarten
  des Analyse-Tab-Redesigns "Antworten & Spuren" (`features/analysis/`).
- `SleepChart.tsx` — Schlaf (Dauer + Schlaf-HF).
- `SpeedHrScatterChart.tsx` — Tempo vs. HF Scatter.
- `TrimpLoadChart.tsx` — Belastungswächter (TRIMP-Balken + CTL-Ramp-Linie).
- `WeatherWeeklyChart.tsx` — Temperatur & Wind pro Woche/Monat.
- `WhatIfPanel.tsx` — What-if-Szenario-Regler im PMC-Chart.
- `ZoneWeeklyChart.tsx` — Intensitätsverteilung (Zeit in Zonen pro Woche).
