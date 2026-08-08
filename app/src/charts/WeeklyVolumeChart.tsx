import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { weeklyByCalendar } from "../core/aggregate.js";
import { weekDisplayLabels } from "../core/week-labels.js";
import { pickLabelIndices } from "../core/chart-scale.js";
import { phaseColor } from "../config";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface WeeklyVolumeChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 270;
const PAD = { l: 50, r: 16, t: 16, b: 40 };
const TARGET_KM = 200;

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Wochenvolumen-Chart (Etappe 8f, Familie 3 — Aggregat-Balken, docs/chart-
 *  grundlagen.md §7.2) — Port von assets/js/ui/charts/training.js
 *  ::renderWeeklyVolume() nach dem PmcChart-Baumuster. Slot-basierte x-Achse
 *  (ein Balken pro ISO-Kalenderwoche aus core/aggregate.js::weeklyByCalendar,
 *  bereits portiert), kein `makeIndexScale` (keine Datumsachse). Zielzone
 *  180-220km + Ziel-Linie nur bei eigenem Plan (mind. eine Woche mit
 *  `phase`). Bewusst außerhalb des Scopes: Bucket-Hover-Kopplung ans PMC-
 *  Fadenkreuz und Brush-Klick-auf-Balken (core/chart-buckets.js liegt dafür
 *  bereits bereit, aber laut Etappe-8f-Plan noch nicht verdrahtet — Familie
 *  3 ist "Brush-Ziel, nicht Brush-Fläche", §7.3). */
export function WeeklyVolumeChart({ rides }: WeeklyVolumeChartProps) {
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

  const weeklyData = useMemo(() => weeklyByCalendar(rides ?? []), [rides]);

  if (!weeklyData.length) {
    return (
      <div
        role="img"
        aria-label="Wochenvolumen"
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        Keine Wochendaten verfügbar.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const ownPlan = weeklyData.some((d) => d.phase != null);
  const maxKm = (Math.max(...weeklyData.map((d) => d.km || 0), ownPlan ? TARGET_KM * 1.1 : 0) * 1.15) || 1;
  const gap = plotW / weeklyData.length;
  const barW = Math.min(gap * 0.62, 52);
  const labels = weekDisplayLabels(weeklyData.map((d) => d.week));
  const barCenterXs = weeklyData.map((_, i) => PAD.l + i * gap + gap / 2);
  const labelIdx = pickLabelIndices(barCenterXs, 40);
  const denseValues = gap < 22;
  const yOf = (v: number) => PAD.t + plotH - (v / maxKm) * plotH;

  const gridStep = Math.max(1, Math.round(maxKm / 4 / 10) * 10);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Wochenvolumen: gefahrene Kilometer je Kalenderwoche"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = gridStep * step;
          const y = yOf(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {v}
              </text>
            </g>
          );
        })}

        {ownPlan && (
          <g>
            <rect
              x={PAD.l}
              y={yOf(220)}
              width={plotW}
              height={Math.max(yOf(180) - yOf(220), 0)}
              fill="var(--role-positive)"
              opacity={0.08}
            />
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={yOf(TARGET_KM)}
              y2={yOf(TARGET_KM)}
              stroke="var(--role-positive)"
              strokeWidth={1}
              strokeDasharray="5,3"
              opacity={0.5}
            />
            <text
              x={width - PAD.r - 4}
              y={yOf(TARGET_KM) - 4}
              textAnchor="end"
              fontSize={9}
              fill="var(--role-positive)"
              opacity={0.8}
            >
              Ziel {TARGET_KM} km
            </text>
          </g>
        )}

        {weeklyData.map((d, i) => {
          const x = PAD.l + i * gap + (gap - barW) / 2;
          const bh = Math.max(((d.km || 0) / maxKm) * plotH, 1);
          const y = PAD.t + plotH - bh;
          const color = ownPlan ? phaseColor(d.phase) : "var(--role-secondary)";
          const showValue = bh > 16 && (!denseValues || labelIdx.has(i));
          return (
            <g key={d.week}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                rx={3}
                fill={color}
                opacity={0.75}
                style={{ cursor: "default" }}
                onMouseEnter={(e) => {
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${d.week} · ${d.km} km · ${d.rides} Fahrten · ${Math.round(d.min / 60)}h`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {showValue && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={9} fill="var(--text-label)">
                  {Math.round(d.km)}
                </text>
              )}
              {labelIdx.has(i) && (
                <text x={x + barW / 2} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
