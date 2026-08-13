import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtDateFull } from "../core/format.js";
import { phaseColor } from "../config";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface SpeedHrScatterChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 260;
const PAD = { l: 54, r: 20, t: 16, b: 44 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Tempo vs. Herzfrequenz (Etappe 12i, Familie 4 — "nicht-Datums-Achse",
 *  docs/chart-grundlagen.md §7.2) — Port von assets/js/ui/charts/power.js
 *  ::renderScatter() nach dem PowerCurveChart-Baumuster (gemessene Breite +
 *  ResizeObserver statt festem viewBox). Beide Achsen sind echte numerische
 *  Skalen (Tempo/HF), keine Tagesachse — nimmt laut §7.3 nicht am
 *  Fadenkreuz/Brush teil, wie im vanilla-Original. Punktfarbe nach
 *  Trainingsphase (`config.ts::phaseColor`, 1:1 aus `CONFIG.phaseColor`).
 *  Hover ist "nächstgelegener Punkt": jeder Datenpunkt ist bereits sein
 *  eigenes Hit-Target, keine zusätzliche Hover-Ebene nötig. */
export function SpeedHrScatterChart({ rides }: SpeedHrScatterChartProps) {
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

  const data = useMemo(
    () =>
      (rides ?? [])
        .filter((r) => r.kmh != null && r.hf != null)
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [rides],
  );

  if (!data.length) {
    return (
      <div role="img" aria-label="Tempo vs. Herzfrequenz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch keine Tempo-/HF-Daten erfasst.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);

  const kmhVals = data.map((d) => d.kmh as number);
  const hfVals = data.map((d) => d.hf as number);
  const minX = Math.min(...kmhVals) - 1;
  const maxX = Math.max(...kmhVals) + 1;
  const minY = Math.min(...hfVals) - 5;
  const maxY = Math.max(...hfVals) + 5;
  const xOf = (v: number) => PAD.l + ((v - minX) / (maxX - minX || 1)) * plotW;
  const yOf = (v: number) => PAD.t + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Tempo vs. Herzfrequenz je Fahrt"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = minY + ((maxY - minY) / 4) * step;
          const y = PAD.t + plotH - (plotH / 4) * step;
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

        {[0, 1, 2, 3, 4].map((step) => {
          const v = minX + ((maxX - minX) / 4) * step;
          const x = PAD.l + (plotW / 4) * step;
          return (
            <text key={step} x={x} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
              {v.toFixed(1)}
            </text>
          );
        })}
        <text x={width - PAD.r} y={H - 6} textAnchor="end" fontSize={9} fill="var(--text-label)">
          km/h
        </text>

        {data.map((d, i) => (
          <circle
            key={`${d.dateISO}-${i}`}
            cx={xOf(d.kmh as number)}
            cy={yOf(d.hf as number)}
            r={5}
            fill={phaseColor(d.phase)}
            opacity={0.75}
            stroke="var(--surface-page)"
            strokeWidth={1}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                content: `${fmtDateFull(d.dateISO)}${d.week ? " · " + d.week : ""} · ${(d.kmh as number).toFixed(1)} km/h · ${Math.round(d.hf as number)} bpm${d.name ? " · " + d.name : ""}`,
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
