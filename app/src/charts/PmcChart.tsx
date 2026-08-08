import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, pmcSkeletonAnchor } from "../core/days.js";
import { densifyPmc, segmentsFor } from "../core/pmc-series.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { addDaysISO, fmtDate, fmtDateFull } from "../core/format.js";
import { projectLoad } from "../core/projection.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface PmcChartProps {
  /** Roh, ungefiltert — die ctl/atl-Filterung übernimmt core/pmc-series.js::densifyPmc(). */
  rides: Ride[];
  projection: ReturnType<typeof projectLoad>;
  /** Brush-Fenster (Etappe 8b, docs/phase-5-konzept-explorer.md §4). Ohne
   *  Angabe (standalone-Nutzung außerhalb des Explorers, oder bestehende
   *  Tests) fällt der Chart auf den bisherigen Fixdefault zurück. */
  range?: { fromISO: string; toISO: string } | null;
  /** Cursor-Sync (Etappe 8c, §3) — kontrollierte Prop wie `range`: der
   *  Aufrufer (ExplorerPage) hält den State, dieser Chart meldet Hover nur
   *  über `onHoverChange` und liest ihn über `hoveredDate` zurück, damit
   *  eine zweite Chart-Komponente (BrushBar) mit derselben Quelle
   *  synchronisieren kann. Ohne beide Props verhält sich der Chart wie 8a/8b
   *  (kein Crosshair, keine Klick-Aktion). */
  hoveredDate?: string | null;
  onHoverChange?: (dateISO: string | null) => void;
  /** Klick auf einen Datenpunkt — Sprung zum Planungstab (ExplorerPage
   *  verdrahtet das auf `navigate("/planning", {state:{highlightDate}})`). */
  onSelectDate?: (dateISO: string) => void;
  /** What-if-Szenario (Etappe 8d, §6) — zweite CTL-Kurve aus einem
   *  synthetischen Kartensatz (`core/scenario.js::buildScenario` +
   *  `projectLoad()`, von ExplorerPage berechnet). `null`/`undefined`
   *  zeichnet keine Szenario-Linie (Toggle aus oder standalone-Nutzung). */
  scenarioProjection?: ReturnType<typeof projectLoad> | null;
}

const W_FALLBACK = 780;
const H = 260;
const PAD = { l: 54, r: 56, t: 30, b: 40 };
/* Letzte 90 Tage + Prognosehorizont als Fallback-Default, wenn keine `range`-
   Prop übergeben wird (kein Brush verdrahtet). Mit `range` (Etappe 8b,
   BrushBar) bestimmt der Aufrufer das Fenster. */
const DEFAULT_WINDOW_DAYS = 90;

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** CTL/ATL/TSB-Basis-Chart (Etappe 8a) — Port nach dem
 *  `renderFtpForecast`-Muster aus assets/js/ui/charts/pmc.js: durchgezogene
 *  Historie, gestrichelte Prognose ab `projection.asOf`, Unsicherheitsband,
 *  Punkt-Tooltip. Zeitfenster kommt seit Etappe 8b optional über die
 *  `range`-Prop (BrushBar). Seit Etappe 8c optional Cursor-Sync (`hoveredDate`/
 *  `onHoverChange`, kontrollierte Props wie `range` — ExplorerPage hält den
 *  State und reicht ihn zusätzlich an BrushBar durch) plus Klick-Sprung
 *  (`onSelectDate`). Seit Etappe 8d optional `scenarioProjection`
 *  (What-if-Szenario, §6) — zweite gestrichelte CTL-Kurve, weiterhin OHNE
 *  Vergleichsmodus, der kommt in Etappe 8e (docs/phase-5-konzept-
 *  explorer.md §7.2). */
export function PmcChart({
  rides,
  projection,
  range,
  hoveredDate,
  onHoverChange,
  onSelectDate,
  scenarioProjection,
}: PmcChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  useLayoutEffect(() => {
    const node = svgRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // "Heute" kommt aus der Projektion, nicht aus einem eigenen localISODate()-
  // Aufruf — sonst Skew ggü. den übergebenen Props möglich (vanilla pmc.js:620).
  const todayISO = projection?.days?.[0]?.date ?? null;
  const asOfISO = projection?.asOf ?? todayISO;
  const horizonEndISO = projection?.horizonEnd ?? todayISO;

  const skeleton = useMemo(() => {
    if (!todayISO || !horizonEndISO) return [];
    const anchor = pmcSkeletonAnchor(rides);
    if (range) {
      const windowStart = anchor && anchor > range.fromISO ? anchor : range.fromISO;
      const windowEnd = range.toISO < horizonEndISO ? range.toISO : horizonEndISO;
      if (windowStart > windowEnd) return [];
      return densifyDays(windowStart, windowEnd);
    }
    const ninetyAgo = addDaysISO(todayISO, -DEFAULT_WINDOW_DAYS);
    const windowStart = anchor && anchor > ninetyAgo ? anchor : ninetyAgo;
    if (windowStart > horizonEndISO) return [];
    return densifyDays(windowStart, horizonEndISO);
  }, [rides, todayISO, horizonEndISO, range]);

  const indexByDate = useMemo(() => new Map(skeleton.map((d, i) => [d.dateISO, i])), [skeleton]);
  const todayIdx = useMemo(
    () => (todayISO ? (indexByDate.get(todayISO) ?? -1) : -1),
    [todayISO, indexByDate]
  );
  const seamIdx = useMemo(
    () => (asOfISO ? (indexByDate.get(asOfISO) ?? todayIdx) : todayIdx),
    [asOfISO, indexByDate, todayIdx]
  );
  const we = Math.max(skeleton.length - 1, 0);

  const { ctlVals, atlVals, tsbVals } = useMemo(
    () => densifyPmc(skeleton, rides, projection?.days ?? [], todayIdx),
    [skeleton, rides, projection, todayIdx]
  );

  const hasData = (rides?.length ?? 0) > 0 || (projection?.days?.length ?? 0) > 0;
  if (skeleton.length < 2 || !hasData) {
    return (
      <div
        role="img"
        aria-label="Belastungsverlauf (CTL/ATL/TSB)"
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        Noch nicht genug Daten für den Belastungsverlauf.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const caVals = ([] as Array<number | null>).concat(ctlVals, atlVals).filter((v): v is number => v != null);
  // `|| 10` fängt eine reine Null-Baseline ab (z.B. beim allerersten Render,
  // solange `rides` noch lädt und projectLoad() ohne Ist-Werte hasBaseline:
  // false liefert — CTL/ATL sind dann durchgehend 0, Math.max(...)*1.1 wäre
  // ebenfalls 0 und caY() würde durch 0 teilen, NaN in y1/y2/cy).
  const caMax = caVals.length ? Math.max(...caVals) * 1.1 || 10 : 10;
  const caY = (v: number) => PAD.t + (1 - v / caMax) * plotH;

  const tsbVisible = tsbVals.filter((v): v is number => v != null);
  const tsbMin = tsbVisible.length ? Math.min(...tsbVisible) - 5 : -20;
  const tsbMax = tsbVisible.length ? Math.max(...tsbVisible) + 5 : 20;
  const tsbY = (v: number) => PAD.t + (1 - (v - tsbMin) / (tsbMax - tsbMin)) * plotH;

  const seriesDefs = [
    { key: "ctl", label: "CTL", vals: ctlVals, yOf: caY, color: "var(--role-primary)" },
    { key: "atl", label: "ATL", vals: atlVals, yOf: caY, color: "var(--role-secondary)" },
    { key: "tsb", label: "TSB", vals: tsbVals, yOf: tsbY, color: "var(--role-positive)" },
  ];

  // Unsicherheitsband: EIN Rechteck von der ersten bis zur letzten Prognose-
  // Zeile mit uncertain===true, keine Zebra-Streifen (Begründung wie vanilla
  // pmc.js:687-719).
  const uncertainIndices = (projection?.days ?? [])
    .filter((d) => d.uncertain)
    .map((d) => indexByDate.get(d.date))
    .filter((i): i is number => i != null);
  const uncertainBand = uncertainIndices.length
    ? { from: Math.min(...uncertainIndices), to: Math.max(...uncertainIndices) }
    : null;

  // What-if-Szenario (Etappe 8d, §6, Port von assets/js/ui/charts/pmc.js
  // Zeilen 772-838): zweite CTL-Kurve, startet immer bei "heute"
  // (projectLoad() rechnet stets ab today), nicht bei seamIdx/asOf — die
  // Szenario-Kurve hat keine Vergangenheit. Kein Rendering, wenn "heute"
  // außerhalb des sichtbaren Fensters liegt (z.B. ein rein historischer
  // Brush) — eine Zukunftsprognose vor dem Fensterbeginn wäre bedeutungslos.
  const scenarioFrom = todayIdx >= 0 ? todayIdx : -1;
  const scenarioCtlVals: Array<number | null> = [];
  const scenarioUncertainDates = new Set<string>();
  if (scenarioProjection && scenarioFrom >= 0 && scenarioFrom <= we) {
    const scenarioRowByDate = new Map(scenarioProjection.days.map((d) => [d.date, d]));
    for (const s of skeleton) scenarioCtlVals.push(scenarioRowByDate.get(s.dateISO)?.ctl ?? null);
    for (const d of scenarioProjection.days) if (d.uncertain) scenarioUncertainDates.add(d.date);
  }
  const scenarioSegments =
    scenarioFrom >= 0 ? segmentsFor(scenarioCtlVals, scenarioFrom, we) : [];
  const scenarioUncertainIndices = scenarioSegments.length
    ? skeleton
        .map((s, i) => ({ i, u: scenarioUncertainDates.has(s.dateISO) }))
        .filter((d) => d.i >= scenarioFrom && d.u)
        .map((d) => d.i)
    : [];
  const scenarioUncertainBand = scenarioUncertainIndices.length
    ? { from: Math.min(...scenarioUncertainIndices), to: Math.max(...scenarioUncertainIndices) }
    : null;

  // Montags-Ticks, per pickLabelIndices auf Mindestabstand ausgedünnt
  // (AGENTS.md: 55-60px bei Datums-Labels).
  const mondayIndices = skeleton
    .map((d, i) => ({ i, isMonday: new Date(`${d.dateISO}T00:00:00`).getDay() === 1 }))
    .filter((d) => d.isMonday)
    .map((d) => d.i);
  const mondayXs = mondayIndices.map((i) => scale.x(i));
  const pickedTickPositions = pickLabelIndices(mondayXs, 55);
  const pickedTicks = [...pickedTickPositions].map((pos) => mondayIndices[pos]);

  // Hover-Punkte auf der CTL-Linie, ausgedünnt wie vanilla (step ~ we/25).
  const hoverStep = Math.max(1, Math.floor(we / 25));
  const hoverIndices: number[] = [];
  for (let i = 0; i <= we; i += hoverStep) {
    if (ctlVals[i] != null) hoverIndices.push(i);
  }

  // Crosshair (Etappe 8c, §3, Port von assets/js/ui/charts/pmc.js::paintHover)
  // — `hoveredDate` ist eine kontrollierte Prop, deshalb hier nur Lesen +
  // Zeichnen, kein eigener State/keine eigene Quelle der Wahrheit.
  const hoveredIdx = hoveredDate ? (indexByDate.get(hoveredDate) ?? -1) : -1;
  const showCrosshair = hoveredIdx >= 0 && hoveredIdx <= we;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Belastungsverlauf: CTL, ATL und TSB über Zeit, Prognose ab heute gestrichelt"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = (caMax / 4) * step;
          const y = caY(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        {uncertainBand && (
          <rect
            x={scale.x(uncertainBand.from)}
            y={PAD.t}
            width={Math.max(scale.x(uncertainBand.to) - scale.x(uncertainBand.from), 0)}
            height={plotH}
            fill="var(--role-status)"
            opacity={0.12}
          />
        )}

        {seriesDefs.map((s) => {
          const historySegs = segmentsFor(s.vals, 0, seamIdx);
          const forecastSegs = segmentsFor(s.vals, seamIdx, we);
          return (
            <g key={s.key} style={{ stroke: s.color }} fill="none" strokeWidth={2}>
              {historySegs.map((seg, i) => (
                <path key={`h${i}`} d={pathD(seg.map((p) => [scale.x(p.index), s.yOf(p.value)]))} />
              ))}
              {forecastSegs.map((seg, i) => (
                <path
                  key={`f${i}`}
                  d={pathD(seg.map((p) => [scale.x(p.index), s.yOf(p.value)]))}
                  strokeDasharray="5,4"
                  opacity={0.75}
                />
              ))}
            </g>
          );
        })}

        {scenarioUncertainBand && (
          <rect
            x={scale.x(scenarioUncertainBand.from)}
            y={PAD.t}
            width={Math.max(scale.x(scenarioUncertainBand.to) - scale.x(scenarioUncertainBand.from), 0)}
            height={plotH}
            fill="var(--role-status)"
            opacity={0.06}
          />
        )}

        {scenarioSegments.map((seg, i) => (
          <path
            key={`scenario${i}`}
            d={pathD(seg.map((p) => [scale.x(p.index), caY(p.value)]))}
            fill="none"
            stroke="var(--role-primary)"
            strokeWidth={2.2}
            strokeDasharray="4,3"
            opacity={0.55}
          />
        ))}

        {todayIdx >= 0 && todayIdx <= we && (
          <g>
            <line
              x1={scale.x(todayIdx)}
              x2={scale.x(todayIdx)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--text-faint)"
              strokeDasharray="2,3"
            />
            <text x={scale.x(todayIdx)} y={PAD.t - 8} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
              Heute
            </text>
          </g>
        )}

        {pickedTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(skeleton[i].dateISO)}
          </text>
        ))}

        {showCrosshair && (
          <g>
            <line
              x1={scale.x(hoveredIdx)}
              x2={scale.x(hoveredIdx)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--role-status)"
              strokeWidth={1}
              strokeDasharray="2,3"
              pointerEvents="none"
            />
            {seriesDefs.map((s) => {
              const v = s.vals[hoveredIdx];
              if (v == null) return null;
              return (
                <circle
                  key={s.key}
                  cx={scale.x(hoveredIdx)}
                  cy={s.yOf(v)}
                  r={4}
                  fill={s.color}
                  stroke="var(--role-status)"
                  strokeWidth={1.5}
                  pointerEvents="none"
                />
              );
            })}
          </g>
        )}

        {hoverIndices.map((i) => (
          <circle
            key={i}
            cx={scale.x(i)}
            cy={caY(ctlVals[i] as number)}
            r={4}
            fill="var(--role-primary)"
            style={{ cursor: onSelectDate ? "pointer" : undefined }}
            onMouseEnter={(e) => {
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                content: `${fmtDateFull(skeleton[i].dateISO)} · CTL ${Math.round(ctlVals[i] as number)}`,
              });
              onHoverChange?.(skeleton[i].dateISO);
            }}
            onMouseLeave={() => {
              setTooltip(null);
              onHoverChange?.(null);
            }}
            onClick={() => onSelectDate?.(skeleton[i].dateISO)}
          />
        ))}
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
