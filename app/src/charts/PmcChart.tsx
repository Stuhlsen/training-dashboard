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
}

const W_FALLBACK = 780;
const H = 260;
const PAD = { l: 54, r: 56, t: 30, b: 40 };
/* Letzte 90 Tage + Prognosehorizont als fester Default — kein Brush in 8a
   (docs/phase-5-konzept-explorer.md §7.2 Schritt 1, hier bewusst noch
   ausgeklammert). Kein persistierter chart-view-Zustand nötig, solange
   sich das Fenster nicht verschieben lässt. */
const DEFAULT_WINDOW_DAYS = 90;

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** CTL/ATL/TSB-Basis-Chart (Etappe 8a) — Port nach dem
 *  `renderFtpForecast`-Muster aus assets/js/ui/charts/pmc.js: durchgezogene
 *  Historie, gestrichelte Prognose ab `projection.asOf`, Unsicherheitsband,
 *  Punkt-Tooltip. Bewusst OHNE Brush/Szenario/Compare/Cursor-Sync — die
 *  kommen in Etappe 8b–8e (docs/phase-5-konzept-explorer.md §7.2). */
export function PmcChart({ rides, projection }: PmcChartProps) {
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
    const ninetyAgo = addDaysISO(todayISO, -DEFAULT_WINDOW_DAYS);
    const windowStart = anchor && anchor > ninetyAgo ? anchor : ninetyAgo;
    if (windowStart > horizonEndISO) return [];
    return densifyDays(windowStart, horizonEndISO);
  }, [rides, todayISO, horizonEndISO]);

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
  const caMax = caVals.length ? Math.max(...caVals) * 1.1 : 10;
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

        {hoverIndices.map((i) => (
          <circle
            key={i}
            cx={scale.x(i)}
            cy={caY(ctlVals[i] as number)}
            r={4}
            fill="var(--role-primary)"
            onMouseEnter={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                content: `${fmtDateFull(skeleton[i].dateISO)} · CTL ${Math.round(ctlVals[i] as number)}`,
              })
            }
            onMouseLeave={() => setTooltip(null)}
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
