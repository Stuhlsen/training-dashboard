import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { linearTrend } from "../core/stats.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface HrTrendChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 180;
const PAD = { l: 50, r: 16, t: 16, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** IQR-Ausreißerfilter, Port von power.js::renderSmallMultiples's
 *  `filterOutliers()` — hier nur auf `hf` spezialisiert, wie
 *  CadenceChart.tsx::filterCadenceOutliers auf `kad`. */
function filterHrOutliers(rides: Ride[]): Ride[] {
  const vals = rides.map((r) => r.hf as number).sort((a, b) => a - b);
  if (vals.length < 4) return rides;
  const q1 = vals[Math.floor(vals.length * 0.25)];
  const q3 = vals[Math.floor(vals.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 2.5 * iqr;
  const hi = q3 + 2.5 * iqr;
  return rides.filter((r) => (r.hf as number) >= lo && (r.hf as number) <= hi);
}

/** Ø-Herzfrequenz-Trend — Etappe 12i, Familie 5 (docs/chart-grundlagen.md
 *  §7.2, Small Multiples). Port des HF-Panels aus power.js
 *  ::renderSmallMultiples() nach dem CadenceChart-Baumuster (identische
 *  Ride-Index-x-Achse, IQR-Filter, linearTrend-Trendlinie) — anders als
 *  Kadenz hat HF im vanilla-Original keine Ziellinie (kein `--role-status`-
 *  Korridor), deshalb hier bewusst ohne Zielwert-Prop. Farbe `--thr`
 *  (1:1 aus vanillas #d94f4f), wie im vanilla-Original das einzige Panel
 *  der drei Small-Multiples ohne `targetLine`. */
export function HrTrendChart({ rides }: HrTrendChartProps) {
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

  const data = useMemo(() => {
    const sorted = (rides ?? []).filter((r) => r.hf != null).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return filterHrOutliers(sorted);
  }, [rides]);

  if (!data.length) {
    return (
      <div role="img" aria-label="Ø-Herzfrequenz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch keine Herzfrequenz-Daten erfasst.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const we = Math.max(data.length - 1, 0);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const hfVals = data.map((d) => d.hf as number);
  const vMin = Math.max(0, Math.min(...hfVals) - 3);
  const vMax = Math.max(...hfVals) + 3;
  const yOf = (v: number) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  const points = data.map((d, i) => ({ x: scale.x(i), y: yOf(d.hf as number), d }));

  const trend = linearTrend(data.map((d, i) => ({ x: i, y: d.hf as number })));
  const trendPath =
    trend && data.length >= 2
      ? pathD([
          [scale.x(0), yOf(trend.slope * 0 + trend.intercept)],
          [scale.x(we), yOf(trend.slope * we + trend.intercept)],
        ])
      : null;

  const pickedTicks = [...pickLabelIndices(points.map((p) => p.x), 55)];

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Ø-Herzfrequenz je Fahrt"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = vMin + ((vMax - vMin) / 4) * step;
          const y = yOf(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <text x={PAD.l - 8} y={PAD.t - 6} textAnchor="end" fontSize={9} fill="var(--text-label)">
          bpm
        </text>

        <path d={pathD(points.map((p) => [p.x, p.y]))} fill="none" stroke="var(--thr)" strokeWidth={1.8} />
        {trendPath && <path d={trendPath} fill="none" stroke="var(--z1)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.6} />}

        {points.map((p, i) => (
          <g key={`${p.d.dateISO}-${i}`}>
            {/* Unsichtbare, größere Trefferfläche zuerst im DOM (19.08.2026,
                Bugfix) — s. PmcChart.tsx für die ausführliche Begründung. */}
            <circle
              cx={p.x}
              cy={p.y}
              r={10}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(p.d.dateISO)} · ${Math.round((p.d.hf as number) * 10) / 10} bpm${p.d.name ? ` · ${p.d.name}` : ""}`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            <circle cx={p.x} cy={p.y} r={3} fill="var(--thr)" stroke="var(--surface-page)" strokeWidth={1.5} pointerEvents="none" />
          </g>
        ))}

        {pickedTicks.map((i) => (
          <text key={i} x={points[i].x} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(points[i].d.dateISO)}
          </text>
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
