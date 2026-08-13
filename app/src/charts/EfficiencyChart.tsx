import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pickLabelIndices } from "../core/chart-scale.js";
import { efficiencyTrend } from "../core/efficiency.js";
import { fmt, fmtInt, fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface EfficiencyChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 210;
const PAD = { l: 50, r: 16, t: 16, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Aerobe Effizienz (Watt/HF) — Etappe 12c, Familie 2 (docs/chart-grundlagen.md
 *  §7.2, lückige Zeitreihe). Port von assets/js/ui/charts/power.js
 *  ::renderEfficiency() nach dem WellnessChart-Baumuster (densifyDays/
 *  joinSeries("gap"), makeIndexScale). `core/efficiency.js::efficiencyTrend`
 *  liefert Rolling-Mean + Vergleichbarkeits-Set unverändert — dieselbe
 *  Funktion, die die Analyse-Tab-Sektion "Aerob" nutzt, hier zusätzlich
 *  grafisch. Einzelpunkte bleiben bewusst UNVERBUNDEN (anders als
 *  WellnessChart) — ein Punkt ist eine einzelne Fahrt, EF-Werte
 *  unterschiedlicher Fahrten sind nicht sinnvoll linear interpolierbar
 *  (1:1-Begründung aus dem vanilla-Kopfkommentar). Nur die Rolling-Mean-
 *  Linie über den vergleichbaren Z2-Fahrten wird gezeichnet. */
export function EfficiencyChart({ rides }: EfficiencyChartProps) {
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
    () => (rides ?? []).filter((r) => r.efficiency != null).sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [rides],
  );
  const trend = useMemo(() => efficiencyTrend(rides ?? []), [rides]);
  const comparableSet = useMemo(
    () => new Set(trend.comparable.map((r) => r.dateISO + (r.name || ""))),
    [trend],
  );

  const skeleton = useMemo(() => {
    if (data.length < 2) return [];
    return densifyDays(data[0].dateISO, data[data.length - 1].dateISO);
  }, [data]);

  const byDate = useMemo(() => new Map(data.map((d) => [d.dateISO, d])), [data]);
  const we = Math.max(skeleton.length - 1, 0);

  const effVals = useMemo(
    () => joinSeries(skeleton, data, { key: "efficiency", absence: "gap" }),
    [skeleton, data],
  );

  const rollBySkeletonIndex = useMemo(() => {
    if (trend.comparable.length < 3) return new Map<number, number>();
    const indexByDate = new Map(skeleton.map((d, i) => [d.dateISO, i]));
    const out = new Map<number, number>();
    trend.comparable.forEach((r, ci) => {
      const i = indexByDate.get(r.dateISO);
      const rv = trend.rolling[ci];
      if (i != null && rv != null) out.set(i, rv);
    });
    return out;
  }, [trend, skeleton]);

  if (skeleton.length < 2) {
    return (
      <div role="img" aria-label="Aerobe Effizienz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Powermeter-Fahrten für einen EF-Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const visible = effVals.filter((v): v is number => v != null);
  const vMin = Math.max(0, (visible.length ? Math.min(...visible) : 0) - 0.1);
  const vMax = (visible.length ? Math.max(...visible) : 1) + 0.1;
  const yOf = (v: number) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  const rollPoints = [...rollBySkeletonIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([i, v]) => ({ x: scale.x(i), y: yOf(v) }));
  const rollPath = rollPoints.length >= 2 ? rollPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") : null;

  const dateIndices = skeleton
    .map((d, i) => ({ i, isMonday: new Date(`${d.dateISO}T00:00:00`).getDay() === 1 }))
    .filter((d) => d.isMonday)
    .map((d) => d.i);
  const dateXs = dateIndices.map((i) => scale.x(i));
  const pickedTickPositions = pickLabelIndices(dateXs, 60);
  const pickedTicks = [...pickedTickPositions].map((pos) => dateIndices[pos]);

  const noteText =
    trend.comparable.length >= 3
      ? `EF-Trend: ${trend.comparable.length} vergleichbare Z2-Fahrten${trend.slopePer30d != null ? ` · ${trend.slopePer30d > 0 ? "+" : ""}${trend.slopePer30d} W/bpm je 30 Tage` : ""}`
      : "Nur Powermeter-Fahrten";

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: ".75rem", color: "var(--text-soft)", marginBottom: 8 }}>{noteText}</div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Aerobe Effizienz (Watt/HF) über Zeit"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = vMin + ((vMax - vMin) / 4) * step;
          const y = yOf(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {fmt(v, 2)}
              </text>
            </g>
          );
        })}

        {rollPath && <path d={rollPath} fill="none" stroke="var(--z1)" strokeWidth={2} strokeLinejoin="round" opacity={0.9} />}

        {skeleton.map((day, i) => {
          const v = effVals[i];
          if (v == null) return null;
          const d = byDate.get(day.dateISO)!;
          const comparable = trend.comparable.length < 3 || comparableSet.has(d.dateISO + (d.name || ""));
          const x = scale.x(i);
          const y = yOf(v);
          return (
            <circle
              key={day.dateISO}
              cx={x}
              cy={y}
              r={comparable ? 4.5 : 3}
              fill={comparable ? "var(--z2)" : "var(--text-label)"}
              opacity={comparable ? 0.9 : 0.4}
              stroke="var(--surface-page)"
              strokeWidth={1}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(d.dateISO)} · Effizienz ${fmt(d.efficiency ?? null, 2)} W/bpm · ${fmtInt(d.watt ?? null)}W · ${fmtInt(d.hf ?? null)} bpm${trend.comparable.length >= 3 ? (comparable ? " · vergleichbar (Z2)" : " · Kontext") : ""}`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {pickedTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
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
