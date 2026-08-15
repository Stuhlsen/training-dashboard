import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { linearTrend } from "../core/stats.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface TempoTrendChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 200;
const PAD = { l: 46, r: 16, t: 16, b: 34 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Entfernt Ausreißer über dem IQR-Zaun (2.5×IQR), damit einzelne sehr
 *  kurze/lange Fahrten die Skala nicht verzerren — Port der Vanilla-Logik
 *  aus assets/js/ui/charts/power.js::renderSmallMultiples(). */
function filterOutliers(rides: Ride[]): Ride[] {
  const vals = rides.map((r) => r.kmh as number).filter((v) => v != null).sort((a, b) => a - b);
  if (vals.length < 4) return rides;
  const q1 = vals[Math.floor(vals.length * 0.25)];
  const q3 = vals[Math.floor(vals.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 2.5 * iqr;
  const hi = q3 + 2.5 * iqr;
  return rides.filter((r) => (r.kmh as number) >= lo && (r.kmh as number) <= hi);
}

/** Ø-Tempo-Verlauf pro Fahrt (Fahrplan 1, V1-Nachtrag) — Port von
 *  assets/js/ui/charts/power.js::renderSmallMultiples() (Tempo-Zweig).
 *  X-Achse ist der Fahrt-Index (chronologisch), nicht ein Tagesraster —
 *  anders als die Familie-2-Charts (WellnessChart, HydrationChart) gibt es
 *  hier keine Lücken zwischen Messpunkten, jede Fahrt ist ein Punkt. */
export function TempoTrendChart({ rides }: TempoTrendChartProps) {
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
    const withTempo = (rides ?? []).filter((r) => r.kmh != null).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return filterOutliers(withTempo);
  }, [rides]);

  if (data.length < 2) {
    return (
      <div role="img" aria-label="Tempo-Trend" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Tempo-Daten für einen Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we: data.length - 1, padLeft: PAD.l, width: plotW });

  const vals = data.map((r) => r.kmh as number);
  const yLo = Math.max(0, Math.min(...vals) - 2);
  const yHi = Math.max(...vals) + 2;
  const yOf = (v: number) => PAD.t + plotH - ((v - yLo) / (yHi - yLo)) * plotH;

  const points = data.map((r, i) => ({ x: scale.x(i), y: yOf(r.kmh as number) }));
  const trend = linearTrend(data.map((r, i) => ({ x: i, y: r.kmh as number })));
  const trendPath = trend
    ? pathD([
        [scale.x(0), yOf(trend.slope * 0 + trend.intercept)],
        [scale.x(data.length - 1), yOf(trend.slope * (data.length - 1) + trend.intercept)],
      ])
    : null;

  const labelIdx = pickLabelIndices(points.map((p) => p.x), 55);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Ø Tempo je Fahrt, chronologisch mit Trendlinie"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = yLo + ((yHi - yLo) / 4) * step;
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

        <path d={pathD(points.map((p) => [p.x, p.y]))} fill="none" stroke="var(--role-primary)" strokeWidth={1.8} />
        {trendPath && <path d={trendPath} fill="none" stroke="var(--role-positive)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.7} />}

        {data.map((r, i) => (
          <circle
            key={r.dateISO + i}
            cx={points[i].x}
            cy={points[i].y}
            r={3}
            fill="var(--role-primary)"
            onMouseEnter={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                content: `${fmtDateFull(r.dateISO)} · ${Math.round((r.kmh as number) * 10) / 10} km/h${r.name ? " · " + r.name : ""}`,
              })
            }
            onMouseLeave={() => setTooltip(null)}
          />
        ))}

        {[...labelIdx].map((i) => (
          <text key={i} x={points[i].x} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(data[i].dateISO)}
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
