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
liegt in `core/` (`chart-scale.js`, `pmc-series.js`), NICHT hier.

**Stand 11.09.2026:** Die frühere Familie einzelner Pro-Metrik-Charts
(PmcChart, WeeklyVolumeChart, WellnessChart, FtpForecastChart,
EfficiencyChart, DecouplingChart, PowerCurveChart, CadenceChart,
CompareChart/ComparePanel, EnergyWeightChart, HrTrendChart, HydrationChart,
SleepChart, SpeedHrScatterChart, TrimpLoadChart, WeatherWeeklyChart,
WhatIfPanel, ZoneWeeklyChart) ist mit dem Analyse-Tab-Redesign "Antworten &
Spuren" (`features/analysis/`) verwaist — keine dieser Dateien wird mehr von
einer Seite importiert, nur noch Tests hielten sie am Leben. Per
`fallow dead-code --production` bestätigt und entfernt. Das meiste davon
deckt das `TraceCard`/`TraceLane`-Spurensystem heute ab (eFTP, Effizienz,
Fitness/Form, TSS, Zonen-Zeitanteile, HRV, Ruhepuls, Schlaf, Entkopplung,
Trinkrate, Wetter, Gewicht). **Nicht** abgedeckt (falls später gebraucht,
sonst als Idee in `planning/ideen-backlog.md` parken statt aus der
Git-Historie zu reanimieren): Kadenz-Verlauf, Tempo-vs-Puls-Scatter,
Ø-Puls-je-Fahrt, PMC-Vergleichsmodus, What-if-Regler.

`charts/` enthält aktuell nur noch die wirklich lebenden Komponenten:

- `ChartTooltip.tsx` — wiederverwendbare Punkt-Tooltip-Box, portal-gerendert
  unter `document.body` (nötig wegen `backdrop-filter` auf den umgebenden
  Glas-Kacheln, s. Kommentar in der Datei).
- `BrushBar.tsx` — Zeitraum-Brushing über dem vollen Belastungshorizont:
  zwei Handles + Fenster-Rect per Pointer Events, Presets (30/90/365 Tage/
  Plan 2/alles), optionaler Cursor-/Event-Marker. Genutzt im Analyse-Tab.
- `ConsistencyCalendar.tsx` — Trainingskonsistenz-Wochenstreifen (Hero-Seite).
  Eine Zelle pro Woche, Farbintensität = Trainingstage (0–7) via
  `core/consistency.js::weeklyConsistency`.
- `TraceCard.tsx` / `TraceLane.tsx` / `trace-card-axis.ts` — Spurenkarten des
  Analyse-Tab-Redesigns "Antworten & Spuren": mehrere Spuren + gemeinsame
  x-Achse + eigenes Fadenkreuz (Cursor-Sync), Spur-Arten (`kind`) über
  `core/trace-lanes.js::buildLaneGeometry`.
- `PowerCurveTraceCard.tsx` — Power-Curve als eigene Spurenkarte (nicht über
  das generische `TraceLane`-Baumuster, eigene Geometrie).
- `PaceZoneScale.tsx` / `HrZoneScale.tsx` — Pace-/HF-Zonen als horizontaler
  Bänder-Streifen (Lauf-Bereich, Fahrplan 12 E7). Zwei Zustände: normal
  (Zonen breitenproportional zur Schwelle) und degradiert (kein
  Schwellenwert schätzbar → ausgegraute Platzhalter-Bänder).
- `PaceCurveCard.tsx` — Pace-Curve (Lauf-Bereich, analog zur Power-Curve).
