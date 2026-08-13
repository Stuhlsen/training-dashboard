import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { cadenceCoach } from "../core/cadence.js";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { linearTrend } from "../core/stats.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { CADENCE_TARGET_RPM } from "../sports/cycling/metrics.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface CadenceChartProps {
  rides: Ride[];
  /** Zielinie nur bei eigenem Plan sinnvoll (wie im Vanilla-Original,
   *  assets/js/ui/charts/power.js::renderSmallMultiples). */
  ownPlan: boolean;
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
 *  `filterOutliers()` — hier nur auf `kad` spezialisiert, statt generisch
 *  über ein Feld (der einzige Aufrufer hier ist immer die Kadenzserie). */
function filterCadenceOutliers(rides: Ride[]): Ride[] {
  const vals = rides.map((r) => r.kad as number).sort((a, b) => a - b);
  if (vals.length < 4) return rides;
  const q1 = vals[Math.floor(vals.length * 0.25)];
  const q3 = vals[Math.floor(vals.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 2.5 * iqr;
  const hi = q3 + 2.5 * iqr;
  return rides.filter((r) => (r.kad as number) >= lo && (r.kad as number) <= hi);
}

const chipStyle: React.CSSProperties = {
  background: "var(--glass-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius-sm, 10px)",
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};
const chipLabelStyle: React.CSSProperties = {
  fontSize: ".63rem",
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--text-label)",
};
const chipValueStyle: React.CSSProperties = {
  fontFamily: "var(--font-disp)",
  fontWeight: 700,
  fontSize: "1.05rem",
  fontVariantNumeric: "tabular-nums",
};
const chipSubStyle: React.CSSProperties = { fontSize: ".7rem", color: "var(--text-soft)" };

/** Kadenz-Coach-Chipreihe — Port von power.js::renderCadenceCoach(). */
function CadenceCoachChips({ coach, target }: { coach: ReturnType<typeof cadenceCoach>; target: number }) {
  if (!coach) return null;
  const goalReached = coach.recentAvg >= target;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
      <div style={chipStyle}>
        <span style={chipLabelStyle}>Ø zuletzt</span>
        <span style={{ ...chipValueStyle, color: goalReached ? "var(--z1)" : "var(--role-status)" }}>
          {coach.recentAvg} RPM
        </span>
        {coach.delta != null && (
          <span style={{ ...chipSubStyle, color: coach.delta >= 0 ? "var(--z1)" : "var(--thr)" }}>
            {coach.delta > 0 ? "+" : ""}
            {coach.delta} seit Start
          </span>
        )}
      </div>
      <div style={chipStyle}>
        <span style={chipLabelStyle}>Ziel ≥{target}</span>
        <span style={chipValueStyle}>{coach.shareAbove}%</span>
        <span style={chipSubStyle}>
          {coach.nAbove}/{coach.nTotal} Fahrten
        </span>
      </div>
      <div style={{ ...chipStyle, flex: "1 1 220px" }}>
        <span style={chipLabelStyle}>Nach Typ</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 4 }}>
          {coach.perType.map((t) => (
            <span key={t.typ} style={{ fontSize: ".72rem", color: "var(--text-soft)" }}>
              {t.typ} <b style={{ color: t.avg >= target ? "var(--z1)" : "var(--text-label)" }}>{t.avg}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Kadenz-Coach — Etappe 12d, Familie 5 (docs/chart-grundlagen.md §7.2,
 *  Small Multiples). Port von assets/js/ui/charts/power.js
 *  ::renderSmallMultiples()'s Kadenz-Panel + renderCadenceCoach()
 *  (Chipreihe). Bewusst mit Ride-Index-x-Achse (nicht Kalenderdatum wie
 *  Familie 1/2) — anders als DecouplingChart (Etappe 12c) keine
 *  Angleichung an densifyDays/joinSeries, weil Familie 5 laut §7.3 ohnehin
 *  nicht am Fadenkreuz teilnimmt und die x-Semantik "je Panel" bleibt, wie
 *  im vanilla-Original. `core/cadence.js::cadenceCoach` liefert dieselbe
 *  Statistik, die auch die Analyse-Tab-Karte "Kadenz-Ökonomie" nutzt
 *  (analysis-view-model.ts). */
export function CadenceChart({ rides, ownPlan }: CadenceChartProps) {
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

  const coach = useMemo(() => cadenceCoach(rides ?? [], CADENCE_TARGET_RPM), [rides]);

  const data = useMemo(() => {
    const sorted = (rides ?? []).filter((r) => r.kad != null).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    return filterCadenceOutliers(sorted);
  }, [rides]);

  if (!data.length) {
    return (
      <div role="img" aria-label="Kadenz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch keine Kadenz-Daten erfasst.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const we = Math.max(data.length - 1, 0);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const kadVals = data.map((d) => d.kad as number);
  const vMin = Math.max(0, Math.min(...kadVals) - 2);
  const vMax = Math.max(...kadVals) + 2;
  const yOf = (v: number) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  const points = data.map((d, i) => ({ x: scale.x(i), y: yOf(d.kad as number), d }));

  const trend = linearTrend(data.map((d, i) => ({ x: i, y: d.kad as number })));
  const trendPath =
    trend && data.length >= 2
      ? pathD([
          [scale.x(0), yOf(trend.slope * 0 + trend.intercept)],
          [scale.x(we), yOf(trend.slope * we + trend.intercept)],
        ])
      : null;

  const targetY = ownPlan ? yOf(CADENCE_TARGET_RPM) : null;

  const pickedTickPositions = pickLabelIndices(
    points.map((p) => p.x),
    55,
  );
  const pickedTicks = [...pickedTickPositions];

  return (
    <div style={{ position: "relative" }}>
      <CadenceCoachChips coach={coach} target={CADENCE_TARGET_RPM} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Kadenz je Fahrt"
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

        {targetY != null && (
          <g>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={targetY}
              y2={targetY}
              stroke="var(--role-status)"
              strokeWidth={1}
              strokeDasharray="4,3"
              opacity={0.5}
            />
            <text x={width - PAD.r - 4} y={targetY - 5} textAnchor="end" fontSize={9} fill="var(--role-status)" opacity={0.85}>
              Ziel {CADENCE_TARGET_RPM}
            </text>
          </g>
        )}

        <path d={pathD(points.map((p) => [p.x, p.y]))} fill="none" stroke="var(--role-status)" strokeWidth={1.8} />
        {trendPath && <path d={trendPath} fill="none" stroke="var(--z1)" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.6} />}

        {points.map((p, i) => (
          <circle
            key={`${p.d.dateISO}-${i}`}
            cx={p.x}
            cy={p.y}
            r={3}
            fill="var(--role-status)"
            stroke="var(--surface-page)"
            strokeWidth={1.5}
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) =>
              setTooltip({
                x: e.clientX,
                y: e.clientY,
                content: `${fmtDateFull(p.d.dateISO)} · ${Math.round((p.d.kad as number) * 10) / 10} RPM${p.d.name ? ` · ${p.d.name}` : ""}`,
              })
            }
            onMouseLeave={() => setTooltip(null)}
          />
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
