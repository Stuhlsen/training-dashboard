import { useLayoutEffect, useRef, useState } from "react";
import { segmentsFor } from "../core/pmc-series.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { fmtDateFull, fmt } from "../core/format.js";
import type { buildCompare } from "../core/compare.js";
import { ChartTooltip } from "./ChartTooltip";

type CompareResult = ReturnType<typeof buildCompare>;

interface CompareChartProps {
  result: CompareResult;
}

const W_FALLBACK = 780;
const H = 260;
const PAD = { l: 54, r: 24, t: 30, b: 40 };
const MIN_DAY_TICK_PX = 40;
const COLOR_A = "var(--z2)";
const COLOR_B = "var(--ss)";

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Vergleichsmodus-Chart (Etappe 8e, docs/phase-5-konzept-explorer.md §5) —
 *  Port von assets/js/ui/charts/pmc.js::drawCompareView. Nur CTL wird
 *  verglichen (dieselbe Beschränkung wie bei der What-if-Zweitserie aus
 *  8d). Zeitachse ist RELATIV (Tag 1 = Blockstart beider Slots), ungleich
 *  lange Slots werden nicht gestreckt (X1) — der kürzere endet einfach
 *  früher.
 *
 *  Scope-Kürzung ggü. dem Vanilla-Original: kein Umschalten auf
 *  Wochen-Ticks bei sehr langen/schmalen Slots (`drawWeekTicks`,
 *  `isoWeekKey`/`weekDisplayLabels` sind im React-Port bislang nirgends
 *  portiert) und keine `fitsLabel()`-Segmentbeschriftung mitten in der
 *  Kurve — stattdessen eine feste Legende (Farbpunkt + Label) über dem
 *  Chart, wie in keinem anderen React-Chart bislang gebraucht. Tages-Ticks
 *  bleiben einheitlich (kein Wochen-Fallback), thinning wie gewohnt über
 *  `pickLabelIndices`. Cursor ist bewusst LOKAL (kein `hoveredDate`-Prop-
 *  Sync wie bei PmcChart/BrushBar) — ein `dayOffset` trägt zwei echte
 *  Daten (Slot A ≠ Slot B), die sich nicht auf ein einzelnes globales
 *  Hover-Datum abbilden lassen (gleiche Begründung wie im Original). */
export function CompareChart({ result }: CompareChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [hoveredOffset, setHoveredOffset] = useState<number | null>(null);

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

  const { a, b } = result;
  const maxLen = Math.max(a.days.length, b.days.length, 1);
  const we = Math.max(maxLen - 1, 1);

  if (!a.days.length || !b.days.length) {
    return (
      <div role="img" aria-label="Vergleich" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Beide Zeiträume A und B müssen gemerkt sein, um sie zu vergleichen.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const aCtl: Array<number | null> = a.days.map((d) => d.ctl);
  const bCtl: Array<number | null> = b.days.map((d) => d.ctl);
  const known = [...aCtl, ...bCtl].filter((v): v is number => v != null);
  const caMax = known.length ? Math.max(...known) * 1.12 || 10 : 10;
  const caY = (v: number) => PAD.t + (1 - v / caMax) * plotH;

  const aSegments = segmentsFor(aCtl, 0, aCtl.length - 1);
  const bSegments = segmentsFor(bCtl, 0, bCtl.length - 1);

  const dayIndices = Array.from({ length: maxLen }, (_, i) => i);
  const dayXs = dayIndices.map((i) => scale.x(i));
  const pickedDayTicks = [...pickLabelIndices(dayXs, MIN_DAY_TICK_PX)];

  const thinnedPoints = (vals: Array<number | null>) => {
    const step = Math.max(1, Math.floor(vals.length / 25));
    const pts: number[] = [];
    vals.forEach((v, i) => {
      if (v == null) return;
      if (i % step !== 0 && i !== vals.length - 1) return;
      pts.push(i);
    });
    return pts;
  };
  const aPoints = thinnedPoints(aCtl);
  const bPoints = thinnedPoints(bCtl);

  function showHover(e: React.MouseEvent, dayOffset: number) {
    const lines: string[] = [];
    if (aCtl[dayOffset] != null) lines.push(`Zeitraum A: ${fmtDateFull(a.days[dayOffset].dateISO)} · CTL ${fmt(aCtl[dayOffset] as number)}`);
    if (bCtl[dayOffset] != null) lines.push(`Zeitraum B: ${fmtDateFull(b.days[dayOffset].dateISO)} · CTL ${fmt(bCtl[dayOffset] as number)}`);
    setHoveredOffset(dayOffset);
    setTooltip({ x: e.clientX, y: e.clientY, content: lines.join(" · ") });
  }
  function clearHover() {
    setHoveredOffset(null);
    setTooltip(null);
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 8, fontSize: ".76rem", color: "var(--ink-3)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_A, display: "inline-block" }} />
          Zeitraum A
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLOR_B, display: "inline-block" }} />
          Zeitraum B
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Vergleich zweier Zeiträume: CTL relativ zum jeweiligen Blockstart"
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

        {aSegments.map((seg, i) => (
          <path key={`a${i}`} d={pathD(seg.map((p) => [scale.x(p.index), caY(p.value)]))} fill="none" stroke={COLOR_A} strokeWidth={2.2} />
        ))}
        {bSegments.map((seg, i) => (
          <path
            key={`b${i}`}
            d={pathD(seg.map((p) => [scale.x(p.index), caY(p.value)]))}
            fill="none"
            stroke={COLOR_B}
            strokeWidth={2.2}
            strokeDasharray="5,4"
            opacity={0.75}
          />
        ))}

        {pickedDayTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            Tag {i + 1}
          </text>
        ))}

        {hoveredOffset != null && (
          <line
            x1={scale.x(hoveredOffset)}
            x2={scale.x(hoveredOffset)}
            y1={PAD.t}
            y2={H - PAD.b}
            stroke="var(--role-status)"
            strokeWidth={1}
            strokeDasharray="2,3"
            pointerEvents="none"
          />
        )}

        {aPoints.map((i) => (
          <g key={`a${i}`}>
            {/* Unsichtbare, größere Trefferfläche zuerst im DOM (19.08.2026,
                Bugfix) — s. PmcChart.tsx für die ausführliche Begründung. */}
            <circle
              cx={scale.x(i)}
              cy={caY(aCtl[i] as number)}
              r={10}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => showHover(e, i)}
              onMouseLeave={clearHover}
            />
            <circle cx={scale.x(i)} cy={caY(aCtl[i] as number)} r={4} fill={COLOR_A} pointerEvents="none" />
          </g>
        ))}
        {bPoints.map((i) => (
          <g key={`b${i}`}>
            {/* Unsichtbare, größere Trefferfläche zuerst im DOM (19.08.2026,
                Bugfix) — s. PmcChart.tsx für die ausführliche Begründung. */}
            <circle
              cx={scale.x(i)}
              cy={caY(bCtl[i] as number)}
              r={10}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => showHover(e, i)}
              onMouseLeave={clearHover}
            />
            <circle cx={scale.x(i)} cy={caY(bCtl[i] as number)} r={4} fill={COLOR_B} pointerEvents="none" />
          </g>
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
