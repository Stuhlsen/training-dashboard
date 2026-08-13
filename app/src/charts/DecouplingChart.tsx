import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { decouplingTrend, DECOUPLING_STABLE } from "../core/efficiency.js";
import { fmt, fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface DecouplingChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 200;
const PAD = { l: 50, r: 16, t: 16, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

function dotColor(absValue: number) {
  if (absValue <= DECOUPLING_STABLE) return "var(--z1)";
  if (absValue <= 10) return "var(--role-status)";
  return "var(--thr)";
}

/** Aerobe Entkopplung (HF-Decoupling, Pw:HR) — Etappe 12c, Familie 2
 *  (docs/chart-grundlagen.md §7.2, lückige Zeitreihe). Port von
 *  assets/js/ui/charts/pmc.js::renderDecoupling() nach dem WellnessChart-
 *  Baumuster (densifyDays/joinSeries("gap"), makeIndexScale) statt der
 *  alten ride-index-basierten x-Achse des vanilla-Originals — Angleichung
 *  an die Familie-2-Konvention, die WellnessChart/EfficiencyChart bereits
 *  nutzen. `core/efficiency.js::decouplingTrend` liefert Median/stabilen
 *  Anteil/Trend unverändert — dieselbe Funktion, die die Analyse-Tab-
 *  Sektion "Aerob" nutzt, hier zusätzlich grafisch. Punkte werden wie beim
 *  vanilla-Original direkt verbunden (eine Fahrt = ein Messpunkt, keine
 *  Interpolation über echte Kalenderlücken hinweg nötig, da nur Fahrten mit
 *  Decoupling-Wert überhaupt einen Skelett-Index besetzen). */
export function DecouplingChart({ rides }: DecouplingChartProps) {
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

  const trend = useMemo(() => decouplingTrend(rides ?? []), [rides]);

  const byDate = useMemo(() => {
    const m = new Map<string, Ride>();
    for (const r of rides ?? []) {
      if (r.decoupling != null) m.set(r.dateISO, r);
    }
    return m;
  }, [rides]);

  const skeleton = useMemo(() => {
    if (!trend || trend.points.length < 2) return [];
    return densifyDays(trend.points[0].date, trend.points[trend.points.length - 1].date);
  }, [trend]);

  const we = Math.max(skeleton.length - 1, 0);

  const vals = useMemo(() => {
    if (!trend) return [];
    return joinSeries(
      skeleton,
      trend.points.map((p) => ({ dateISO: p.date, value: Math.abs(p.value) })),
      { key: "value", absence: "gap" },
    );
  }, [skeleton, trend]);

  if (!trend) {
    return (
      <div role="img" aria-label="Aerobe Entkopplung" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Datenbasis wächst noch — noch nicht genug vergleichbare Z2-Fahrten für einen Decoupling-Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const visible = vals.filter((v): v is number => v != null);
  const vMax = Math.max(...visible, 10) + 3;
  const vMin = 0;
  const yOf = (v: number) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  const connectedPoints: { index: number; value: number }[] = [];
  for (let i = 0; i <= we; i++) {
    if (vals[i] != null) connectedPoints.push({ index: i, value: vals[i] as number });
  }

  const dateIndices = skeleton
    .map((d, i) => ({ i, isMonday: new Date(`${d.dateISO}T00:00:00`).getDay() === 1 }))
    .filter((d) => d.isMonday)
    .map((d) => d.i);
  const dateXs = dateIndices.map((i) => scale.x(i));
  const pickedTickPositions = pickLabelIndices(dateXs, 60);
  const pickedTicks = [...pickedTickPositions].map((pos) => dateIndices[pos]);

  const targetY = yOf(DECOUPLING_STABLE);
  const noteText = `Median ${fmt(trend.median, 1)}% · ${trend.stableShare}% stabil (< ${DECOUPLING_STABLE}%) · ${trend.n} Fahrten${trend.slopePer30d != null ? ` · ${trend.slopePer30d > 0 ? "+" : ""}${trend.slopePer30d} pp je 30 Tage` : ""}`;

  return (
    <div style={{ position: "relative" }}>
      <div style={{ fontSize: ".75rem", color: "var(--text-soft)", marginBottom: 8 }}>{noteText}</div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Aerobe Entkopplung (Pw:HR) über Zeit"
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

        <line x1={PAD.l} x2={width - PAD.r} y1={targetY} y2={targetY} stroke="var(--z1)" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />
        <text x={width - PAD.r + 4} y={targetY + 3} fontSize={9} fill="var(--z1)">
          {DECOUPLING_STABLE}%
        </text>

        {connectedPoints.length > 1 && (
          <path
            d={pathD(connectedPoints.map((p) => [scale.x(p.index), yOf(p.value)]))}
            fill="none"
            stroke="var(--ss)"
            strokeWidth={1.8}
          />
        )}

        {skeleton.map((day, i) => {
          const v = vals[i];
          if (v == null) return null;
          const d = byDate.get(day.dateISO)!;
          const x = scale.x(i);
          const y = yOf(v);
          return (
            <circle
              key={day.dateISO}
              cx={x}
              cy={y}
              r={4}
              fill={dotColor(v)}
              stroke="var(--surface-page)"
              strokeWidth={1.5}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(d.dateISO)} · ${fmt(v, 1)}%${d.name ? ` · ${d.name}` : ""}`,
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
