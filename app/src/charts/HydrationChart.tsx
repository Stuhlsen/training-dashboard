import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { hydrationSeries } from "../core/body.js";
import { fmtDate, fmtDateFull, fmt } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type WellnessDay = import("../types.js").WellnessDay;

interface HydrationChartProps {
  wellness: WellnessDay[];
}

const W_FALLBACK = 780;
const H = 200;
const PAD = { l: 46, r: 16, t: 16, b: 34 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Hydration-Tagesverlauf (Fahrplan 1, V1-Nachtrag) — Port von
 *  assets/js/ui/charts/wellness.js::renderHydration(). Familie-2-Chart
 *  (lückige Tagesreihe) wie WellnessChart.tsx, aber nur eine Metrik ohne
 *  Umschalter: gestrichelte Ø-Linie statt Trendlinie, leichte Flächenfüllung
 *  unter der Linie wie im Vanilla-Original. */
export function HydrationChart({ wellness }: HydrationChartProps) {
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

  const hy = useMemo(() => hydrationSeries(wellness ?? []), [wellness]);

  const skeleton = useMemo(() => {
    if (!hy || hy.points.length < 2) return [];
    return densifyDays(hy.points[0].date, hy.points[hy.points.length - 1].date);
  }, [hy]);

  const vals = useMemo(() => {
    if (!hy || !skeleton.length) return [];
    const rows = hy.points.map((p) => ({ dateISO: p.date, value: p.value }));
    return joinSeries(skeleton, rows, { key: "value", absence: "gap" });
  }, [hy, skeleton]);

  if (!hy || skeleton.length < 2) {
    return (
      <div role="img" aria-label="Hydration-Verlauf" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Hydration-Daten für einen Verlauf.
      </div>
    );
  }

  const unit = hy.field === "hydrationVolume" ? "L" : "";
  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we: skeleton.length - 1, padLeft: PAD.l, width: plotW });

  const defined = vals.filter((v): v is number => v != null);
  const maxV = Math.max(1, ...defined) * 1.1;
  const yOf = (v: number) => PAD.t + plotH - (v / maxV) * plotH;

  const points: { x: number; y: number }[] = [];
  vals.forEach((v, i) => {
    if (v != null) points.push({ x: scale.x(i), y: yOf(v) });
  });
  const areaPath =
    points.length > 1
      ? `M${points[0].x},${PAD.t + plotH} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${PAD.t + plotH} Z`
      : null;

  const dateXs = skeleton.map((_, i) => scale.x(i));
  const labelIdx = pickLabelIndices(dateXs, 44);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Hydration-Verlauf: tägliche Flüssigkeitsaufnahme"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = (maxV / 4) * step;
          const y = yOf(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {fmt(v, 1)}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill="var(--role-primary)" opacity={0.08} />}
        {points.length > 1 && (
          <path d={pathD(points.map((p) => [p.x, p.y]))} fill="none" stroke="var(--role-primary)" strokeWidth={2} />
        )}

        <line
          x1={PAD.l}
          x2={width - PAD.r}
          y1={yOf(hy.avg)}
          y2={yOf(hy.avg)}
          stroke="var(--text-faint)"
          strokeWidth={1}
          strokeDasharray="4,4"
        />

        {skeleton.map((day, i) => {
          const v = vals[i];
          if (v == null) return null;
          return (
            <circle
              key={day.dateISO}
              cx={scale.x(i)}
              cy={yOf(v)}
              r={2.4}
              fill="var(--role-primary)"
              onMouseEnter={(e) =>
                setTooltip({ x: e.clientX, y: e.clientY, content: `${fmtDateFull(day.dateISO)} · ${fmt(v)} ${unit}`.trim() })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {[...labelIdx].map((i) => (
          <text key={i} x={dateXs[i]} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(skeleton[i].dateISO)}
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
