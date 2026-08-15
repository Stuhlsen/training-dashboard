import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { isoWeekKey, weeklyByCalendar } from "../core/aggregate.js";
import { weekDisplayLabels } from "../core/week-labels.js";
import { pickLabelIndices } from "../core/chart-scale.js";
import { buildLoadGuard, describeWeek, RAMP_OK_MIN, RAMP_OK_MAX, RAMP_HIGH, MONOTONY_WARN } from "../core/loadguard.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;
type LoadGuardRow = ReturnType<typeof buildLoadGuard>[number];

interface TrimpLoadChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 240;
const PAD = { l: 46, r: 46, t: 16, b: 40 };

/** 3-stufige Magnitude-Farbe für die TRIMP-Balken — reduziert von Vanillas
 *  4 Stufen (grün/gelb/orange/rot) auf 3, weil das Zonen-Farbsystem
 *  (AGENTS.md) nur 3 passende Risiko-Töne kennt (dieselben wie
 *  features/analysis/LoadTable.tsx::RISK_COLOR). */
function trimpColor(v: number): string {
  if (v < 400) return "var(--z1, #4a9a6e)";
  if (v < 900) return "var(--ss, #e08a3c)";
  return "var(--thr, #d94f4f)";
}

/** Dieselbe 3-stufige Skala für die Ramp-Linien-Punkte, nach Risiko statt
 *  Magnitude. */
function rampColor(v: number): string {
  if (v > RAMP_HIGH) return "var(--thr, #d94f4f)";
  if (v > RAMP_OK_MAX) return "var(--ss, #e08a3c)";
  return "var(--ink-3, #97a1b3)";
}

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Belastungswächter: TRIMP-Wochenlast + CTL-Ramp-Rate + Monotonie-Warnung
 *  (Fahrplan 1, V1-Nachtrag) — Port von assets/js/ui/charts/training.js
 *  ::renderTrimp(). Die zugrundeliegenden Zahlen (buildLoadGuard/
 *  describeWeek) sind bereits als Tabelle im Analyse-Tab sichtbar
 *  (LoadTable.tsx) — dieses Chart ist die im Explorer fehlende
 *  Visualisierung derselben Daten, keine neue Berechnung.
 *  Bewusst kein Wochen/Monat-Toggle (kein bestehendes React-Chart hat den
 *  heute, s. Plan-Notiz) — nur Kalenderwochen. */
export function TrimpLoadChart({ rides }: TrimpLoadChartProps) {
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
  const guard = useMemo(
    () => buildLoadGuard(rides ?? [], (r: Ride) => isoWeekKey(r.dateISO), (a: string, b: string) => a.localeCompare(b)),
    [rides],
  );
  const guardByWeek = useMemo(() => new Map(guard.map((g) => [g.week, g])), [guard]);

  if (!weeklyData.length) {
    return (
      <div role="img" aria-label="Belastungswächter" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Keine Wochendaten verfügbar.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const maxV = (Math.max(...weeklyData.map((d) => d.trimp || 0)) * 1.15) || 1;
  const gap = plotW / weeklyData.length;
  const barW = Math.min(gap * 0.62, 52);
  const labels = weekDisplayLabels(weeklyData.map((d) => d.week));
  const barCenterXs = weeklyData.map((_, i) => PAD.l + i * gap + gap / 2);
  const labelIdx = pickLabelIndices(barCenterXs, 40);
  const yOf = (v: number) => PAD.t + plotH - (v / maxV) * plotH;

  const ramps = weeklyData.map((d) => guardByWeek.get(d.week)?.ramp ?? null);
  const rampVals = ramps.filter((v): v is number => v != null);
  const hasRamp = rampVals.length >= 2;
  const rMax = hasRamp ? Math.max(...rampVals, RAMP_OK_MAX + 2, 8) : 0;
  const rMin = hasRamp ? Math.min(...rampVals, 0) - 1 : 0;
  const rY = (v: number) => PAD.t + plotH - ((v - rMin) / (rMax - rMin)) * plotH;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Belastungswächter: TRIMP-Wochenlast mit CTL-Ramp-Rate und Monotonie-Warnung"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = (maxV / 4) * step;
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

        {hasRamp && (
          <rect
            x={PAD.l}
            y={rY(RAMP_OK_MAX)}
            width={plotW}
            height={Math.max(1, rY(RAMP_OK_MIN) - rY(RAMP_OK_MAX))}
            fill="var(--z1, #4a9a6e)"
            opacity={0.08}
          />
        )}

        {weeklyData.map((d, i) => {
          const x = PAD.l + i * gap + (gap - barW) / 2;
          const bh = Math.max(((d.trimp || 0) / maxV) * plotH, 1);
          const y = PAD.t + plotH - bh;
          const g = guardByWeek.get(d.week) as LoadGuardRow | undefined;
          const showWarn = g?.monotony != null && g.monotony >= MONOTONY_WARN;
          const desc = g ? describeWeek(g) : null;
          return (
            <g key={d.week}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                rx={3}
                fill={trimpColor(d.trimp || 0)}
                opacity={0.82}
                style={{ cursor: "default" }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${d.week} · TRIMP ${d.trimp} · ${d.rides} Fahrten · ${Math.round(d.min / 6) / 10}h${
                      g ? ` · Ramp ${g.ramp != null ? (g.ramp > 0 ? "+" : "") + g.ramp : "–"} CTL · Monotonie ${g.monotony ?? "–"}` : ""
                    }${desc ? ` · ${desc.label}` : ""}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
              {showWarn && (
                <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize={11}>
                  ⚠
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

        {hasRamp && (
          <>
            <path
              d={ramps
                .map((v, i) => (v == null ? null : `${barCenterXs[i]},${rY(v)}`))
                .filter((p): p is string => p != null)
                .map((p, i) => `${i === 0 ? "M" : "L"}${p}`)
                .join(" ")}
              fill="none"
              stroke="var(--ink-3, #e2e7ef)"
              strokeWidth={1.6}
              strokeDasharray="5,3"
              opacity={0.85}
            />
            {weeklyData.map((d, i) => {
              const v = ramps[i];
              if (v == null) return null;
              return (
                <circle
                  key={d.week}
                  cx={barCenterXs[i]}
                  cy={rY(v)}
                  r={3}
                  fill={rampColor(v)}
                  onMouseEnter={(e) =>
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      content: `${d.week} · Ramp ${v > 0 ? "+" : ""}${v} CTL/Woche · Korridor +${RAMP_OK_MIN} bis +${RAMP_OK_MAX}`,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
            {[rMin, 0, RAMP_OK_MAX, rMax].map((v) => (
              <text key={v} x={width - PAD.r + 6} y={rY(v) + 3} fontSize={9} fill="var(--text-label)">
                {(v > 0 ? "+" : "") + Math.round(v)}
              </text>
            ))}
          </>
        )}
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
