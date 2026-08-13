import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { weeklyConsistency } from "../core/consistency.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface ConsistencyCalendarProps {
  rides: Ride[];
  todayISO: string;
}

const W_FALLBACK = 780;
const CELL_H = 40;
const Y_TOP = 30;
const PAD_L = 6;
const PAD_R = 6;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const LEGEND_LEVELS = [1, 2, 4, 5, 7];

/** 0 (kein Trainingstag) … 7 (jeden Tag) — Index = Trainingstage der Woche. */
const LEVEL_FILL = [
  "var(--hair)",
  "color-mix(in oklch, var(--role-positive) 30%, transparent)",
  "color-mix(in oklch, var(--role-positive) 42%, transparent)",
  "color-mix(in oklch, var(--role-positive) 54%, transparent)",
  "color-mix(in oklch, var(--role-positive) 66%, transparent)",
  "color-mix(in oklch, var(--role-positive) 78%, transparent)",
  "color-mix(in oklch, var(--role-positive) 90%, transparent)",
  "var(--role-positive)",
];

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Trainingskonsistenz-Wochenstreifen (Etappe 12a, Familie 6 — eigene
 *  Layout-Logik, docs/dashboard-3.0-konzept-react-umbau.md Etappe 12).
 *  Port von assets/js/ui/charts/training.js::renderConsistency() nach dem
 *  WeeklyVolumeChart-Baumuster (ResizeObserver statt fixer Breite). Eine
 *  Zelle pro Woche ab der ersten aktiven Woche, Farbintensität = Trainingstage
 *  (0–7) statt Last — core/consistency.js::weeklyConsistency() macht die
 *  eigentliche Aggregation. */
export function ConsistencyCalendar({ rides, todayISO }: ConsistencyCalendarProps) {
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

  const wc = useMemo(() => weeklyConsistency(rides ?? [], todayISO), [rides, todayISO]);

  if (!wc || !wc.weeks.length) {
    return (
      <div role="img" aria-label="Trainingskonsistenz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Keine Trainingstage erfasst.
      </div>
    );
  }

  const n = wc.weeks.length;
  const gap = n > 30 ? 2 : 3;
  const cellW = Math.min((width - PAD_L - PAD_R - (n - 1) * gap) / n, 60);
  const stepX = cellW + gap;
  const showNum = cellW >= 20;
  const H = Y_TOP + CELL_H + 54;

  // Monatswechsel pro Woche vorab bestimmen (kein Mutieren einer Closure-
  // Variable innerhalb des JSX-`.map()` unten, s. react-hooks/immutability).
  const monthOf = wc.weeks.map((w) => new Date(`${w.monday}T00:00:00`).getMonth());
  const showMonthAt = monthOf.map((m, i) => i === 0 || m !== monthOf[i - 1]);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Trainingskonsistenz: Trainingstage je Woche"
      >
        <text x={PAD_L} y={16} fontSize={12} fontFamily="var(--font-mono)" fill="var(--text-soft)">
          serie aktuell{" "}
          <tspan fill="var(--role-positive)" fontWeight={500}>
            {wc.streakCurrent} Wochen
          </tspan>
          {"   ·   längste "}
          <tspan fill="var(--role-positive)" fontWeight={500}>
            {wc.streakLongest}
          </tspan>
          {"   ·   Ø "}
          <tspan fill="var(--text-ink)" fontWeight={500}>
            {String(wc.avgDays).replace(".", ",")}
          </tspan>
          {" Tage/Woche"}
        </text>

        {wc.weeks.map((w, i) => {
          const x = PAD_L + i * stepX;
          const days = Math.max(0, Math.min(7, w.days));
          const showMonth = showMonthAt[i];
          return (
            <g key={w.monday}>
              <rect
                x={x}
                y={Y_TOP}
                width={cellW}
                height={CELL_H}
                rx={4}
                fill={LEVEL_FILL[days]}
                style={{ cursor: w.days > 0 ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  if (!w.days) return;
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `Woche ab ${w.monday} · ${w.days} Trainingstag${w.days === 1 ? "" : "e"} · ${w.km} km`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {showNum && w.days > 0 && (
                <text
                  x={x + cellW / 2}
                  y={Y_TOP + CELL_H / 2 + 5}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={500}
                  fill={days >= 6 ? "var(--surface-page)" : "var(--text-ink)"}
                >
                  {w.days}
                </text>
              )}
              {showMonth && (
                <text x={x} y={Y_TOP + CELL_H + 18} fontSize={10.5} fontFamily="var(--font-mono)" fill="var(--text-label)">
                  {MONTHS[monthOf[i]]}
                </text>
              )}
            </g>
          );
        })}

        <text x={PAD_L} y={H - 6} fontSize={11} fontFamily="var(--font-mono)" fill="var(--text-soft)">
          {wc.activeWeeks} von {wc.totalWeeks} Wochen trainiert · {wc.activeDays} aktive Tage
        </text>
        {LEGEND_LEVELS.map((lvl, i) => (
          <rect
            key={lvl}
            x={width - PAD_R - (LEGEND_LEVELS.length - i) * 16}
            y={H - 18}
            width={13}
            height={13}
            rx={3}
            fill={LEVEL_FILL[lvl]}
          />
        ))}
        <text
          x={width - PAD_R - LEGEND_LEVELS.length * 16 - 8}
          y={H - 7}
          textAnchor="end"
          fontSize={10.5}
          fontFamily="var(--font-mono)"
          fill="var(--text-label)"
        >
          wenig → viel Tage
        </text>
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
    </div>
  );
}
