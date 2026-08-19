import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { linearTrend } from "../core/stats.js";
import { mergedOwnPlanSeries } from "../core/wellness-series.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;
type WellnessDay = import("../types.js").WellnessDay;

export type WellnessMetric = "hrv" | "ruhepuls";

interface WellnessChartProps {
  rides: Ride[];
  wellness: WellnessDay[];
  metric: WellnessMetric;
  onMetricChange?: (metric: WellnessMetric) => void;
}

const METRIC_CONFIG: Record<WellnessMetric, { label: string; rideField: string; wellnessField: string; unit: string }> = {
  hrv: { label: "HRV", rideField: "hrv", wellnessField: "hrv", unit: "ms" },
  ruhepuls: { label: "Ruhepuls", rideField: "ruhepuls", wellnessField: "restingHR", unit: "bpm" },
};

const W_FALLBACK = 780;
const H = 220;
const PAD = { l: 46, r: 16, t: 30, b: 30 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** HRV/Ruhepuls-Trend-Chart (Etappe 8f, Familie 2 — lückige Zeitreihe,
 *  docs/chart-grundlagen.md §7.2) — Port von assets/js/ui/charts/wellness.js
 *  ::renderHrvTrend()/renderRhfTrend() (gemeinsame Engine
 *  `renderHrvRhfChart`) nach dem PmcChart-Baumuster. Statt zwei separater
 *  vanilla-Funktionen EINE Komponente mit `metric`-Prop-Umschalter (React-
 *  Idiomatik, kein Duplicate-Komponenten-Paar). Zeigt bewusst die GANZE
 *  Historie, kein Brush-Fenster (wie vanilla, s. dortiger Kopfkommentar) —
 *  ein 90-Tage-Default würde den HRV-Methodenwechsel (RMSSD→SDNN) oft aus
 *  dem Blick verdrängen. Reduzierte Fassung ggü. vanilla: zwei getrennte
 *  Trendlinien vor/nach dem Methodenwechsel, aber ohne die zusätzlichen
 *  Mittelwert-Referenzlinien (Scope-Kürzung, Etappe-8f-Plan). */
export function WellnessChart({ rides, wellness, metric, onMetricChange }: WellnessChartProps) {
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

  const { rideField, wellnessField, unit, label } = METRIC_CONFIG[metric];

  const series = useMemo(() => {
    const ownPlan = (rides ?? []).some((r) => r.week);
    if (ownPlan) return mergedOwnPlanSeries(rides, wellness, rideField, wellnessField);
    return (wellness ?? [])
      .filter((w) => (w as Record<string, unknown>)[wellnessField] != null)
      .map((w) => ({
        dateISO: (w.dateISO ?? w.date) as string,
        value: (w as Record<string, unknown>)[wellnessField] as number,
        hrvMethod: "sdnn" as const,
      }))
      .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }, [rides, wellness, rideField, wellnessField]);

  const skeleton = useMemo(() => {
    if (series.length < 2) return [];
    return densifyDays(series[0].dateISO, series[series.length - 1].dateISO);
  }, [series]);

  const indexByDate = useMemo(() => new Map(skeleton.map((d, i) => [d.dateISO, i])), [skeleton]);
  const we = Math.max(skeleton.length - 1, 0);

  const vals = useMemo(
    () => joinSeries(skeleton, series, { key: "value", absence: "gap" }),
    [skeleton, series],
  );

  if (skeleton.length < 2) {
    return (
      <div
        role="img"
        aria-label={`${label}-Trend`}
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        Noch nicht genug {label}-Daten für einen Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const visible = vals.filter((v): v is number => v != null);
  const vMin = visible.length ? Math.min(...visible) : 0;
  const vMax = visible.length ? Math.max(...visible) : 1;
  const headroom = Math.max((vMax - vMin) * 0.15, 1);
  const yLo = vMin - headroom;
  const yHi = vMax + headroom;
  const yOf = (v: number) => PAD.t + (1 - (v - yLo) / (yHi - yLo)) * plotH;

  // Linie verbindet bewusst über Messlücken hinweg (Alex' Design-Entscheidung,
  // 1:1 aus assets/js/ui/charts/wellness.js::renderHrvRhfChart übernommen) —
  // anders als PMC/CTL (segmentsFor(), lückenlos-täglich) ist HRV/Ruhepuls
  // eine ECHTE Messreihe mit Lücken; nur die tatsächlich gemessenen Punkte
  // werden gesammelt und direkt verbunden, statt bei jeder Lücke ein neues
  // Segment zu beginnen.
  const connectedPoints: { index: number; value: number }[] = [];
  for (let i = 0; i <= we; i++) {
    if (vals[i] != null) connectedPoints.push({ index: i, value: vals[i] as number });
  }

  // Methodenwechsel-Marker: erster "sdnn"-Punkt, nur relevant, wenn ihm
  // tatsächlich mindestens ein "rmssd"-Punkt vorausgeht (sonst gibt es
  // keinen Wechsel zu markieren, z.B. Athlet 2 oder rein neue Historie).
  const firstRmssdIdx = series.findIndex((s) => s.hrvMethod === "rmssd");
  const firstSdnnIdx = series.findIndex((s) => s.hrvMethod === "sdnn");
  const hasMethodChange = firstRmssdIdx >= 0 && firstSdnnIdx > firstRmssdIdx;
  const dividerDateISO = hasMethodChange ? series[firstSdnnIdx].dateISO : null;
  const dividerIdx = dividerDateISO ? (indexByDate.get(dividerDateISO) ?? -1) : -1;

  const trendPath = (fromIdx: number, toIdx: number) => {
    const points = [];
    for (let i = fromIdx; i <= toIdx; i++) {
      if (vals[i] != null) points.push({ x: i, y: vals[i] as number });
    }
    const trend = linearTrend(points);
    if (!trend) return null;
    const y1 = trend.slope * fromIdx + trend.intercept;
    const y2 = trend.slope * toIdx + trend.intercept;
    return pathD([
      [scale.x(fromIdx), yOf(y1)],
      [scale.x(toIdx), yOf(y2)],
    ]);
  };
  const trendBefore = dividerIdx > 0 ? trendPath(0, dividerIdx) : null;
  const trendAfter = dividerIdx >= 0 ? trendPath(dividerIdx, we) : !hasMethodChange ? trendPath(0, we) : null;

  const dateIndices = skeleton
    .map((d, i) => ({ i, isMonday: new Date(`${d.dateISO}T00:00:00`).getDay() === 1 }))
    .filter((d) => d.isMonday)
    .map((d) => d.i);
  const dateXs = dateIndices.map((i) => scale.x(i));
  const pickedTickPositions = pickLabelIndices(dateXs, 55);
  const pickedTicks = [...pickedTickPositions].map((pos) => dateIndices[pos]);

  // Hover-Punkte, ausgedünnt wie PmcChart (step ~ we/25) statt eines
  // unsichtbaren Kreises pro Tag — sonst bei langer Historie (200+ Tage)
  // unnötig viele Hover-Targets/DOM-Knoten.
  const hoverStep = Math.max(1, Math.floor(we / 25));
  const hoverIndices: number[] = [];
  for (let i = 0; i <= we; i += hoverStep) {
    if (vals[i] != null) hoverIndices.push(i);
  }

  return (
    <div style={{ position: "relative" }}>
      {onMetricChange && (
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(Object.keys(METRIC_CONFIG) as WellnessMetric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMetricChange(m)}
              aria-pressed={m === metric}
              style={{
                padding: "4px 10px",
                borderRadius: "var(--pill)",
                border: "1px solid var(--hair)",
                background: m === metric ? "rgba(255,255,255,0.14)" : "transparent",
                color: m === metric ? "var(--ink)" : "var(--text-label)",
                fontSize: ".75rem",
                cursor: "pointer",
              }}
            >
              {METRIC_CONFIG[m].label}
            </button>
          ))}
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label={`${label}-Trend über Zeit`}
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

        {dividerIdx >= 0 && (
          <g>
            <line
              x1={scale.x(dividerIdx)}
              x2={scale.x(dividerIdx)}
              y1={PAD.t}
              y2={H - PAD.b}
              stroke="var(--text-faint)"
              strokeDasharray="2,3"
            />
            <text x={scale.x(dividerIdx)} y={PAD.t - 10} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
              Methodenwechsel
            </text>
          </g>
        )}

        {trendBefore && <path d={trendBefore} fill="none" stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3,3" />}
        {trendAfter && <path d={trendAfter} fill="none" stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="3,3" />}

        {connectedPoints.length > 1 && (
          <path
            d={pathD(connectedPoints.map((p) => [scale.x(p.index), yOf(p.value)]))}
            fill="none"
            stroke="var(--role-primary)"
            strokeWidth={2}
          />
        )}
        {connectedPoints.length === 1 && (
          <circle cx={scale.x(connectedPoints[0].index)} cy={yOf(connectedPoints[0].value)} r={3.5} fill="var(--role-primary)" />
        )}

        {pickedTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(skeleton[i].dateISO)}
          </text>
        ))}

        {hoverIndices.map((i) => (
          <g key={i}>
            {/* Unsichtbare, größere Trefferfläche zuerst im DOM (19.08.2026,
                Bugfix) — s. PmcChart.tsx für die ausführliche Begründung. */}
            <circle
              cx={scale.x(i)}
              cy={yOf(vals[i] as number)}
              r={10}
              fill="transparent"
              pointerEvents="all"
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(skeleton[i].dateISO)} · ${vals[i]} ${unit}`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            <circle cx={scale.x(i)} cy={yOf(vals[i] as number)} r={4} fill="var(--role-primary)" pointerEvents="none" />
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
