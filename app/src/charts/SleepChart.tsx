import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { densifyDays, joinSeries } from "../core/days.js";
import { makeIndexScale, pickLabelIndices } from "../core/chart-scale.js";
import { fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type WellnessDay = import("../types.js").WellnessDay;

interface SleepChartProps {
  wellness: WellnessDay[];
  ownPlan: boolean;
}

const W_FALLBACK = 780;
const H = 200;
const PAD = { l: 44, r: 44, t: 16, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

interface Row {
  dateISO: string;
  sleepHours: number | null;
  avgSleepingHR: number | null;
}

function barColor(hours: number) {
  if (hours >= 7) return "var(--z2)";
  if (hours >= 6) return "var(--warn)";
  return "var(--danger)";
}

/** Schlaf — Dauer & Schlaf-HF (Etappe 12g, Familie 2, docs/chart-grundlagen.md
 *  §7.2, lückige Zeitreihe) — Port von assets/js/ui/charts/wellness.js
 *  ::renderSleep() nach dem WellnessChart/EfficiencyChart-Baumuster
 *  (densifyDays/joinSeries("gap"), makeIndexScale statt vanillas eigener
 *  gap/xOf-Rechnung — Angleichung an die übrigen Familie-2-React-Charts).
 *  Kein core/-Modul: beide Felder kommen direkt aus WellnessDay
 *  (`sleepHours`/`avgSleepingHR`), keine Ableitung nötig. Balken = Schlaf-
 *  dauer (Ampelfarbe wie im Original: ≥7h `--z2`, ≥6h `--warn`, sonst
 *  `--danger` — bewusst blau statt grün für "gut", damit die Farbe nicht
 *  mit `--z1`/Recovery kollidiert, 1:1 aus dem vanilla-Kopfkommentar),
 *  Linie = Ø-Schlaf-HF (zweite y-Achse rechts, verbindet über Messlücken
 *  hinweg wie WellnessChart). 7h-Ziellinie nur bei eigenem Plan. */
export function SleepChart({ wellness, ownPlan }: SleepChartProps) {
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

  const rows = useMemo<Row[]>(
    () =>
      (wellness ?? [])
        .filter((w) => w.sleepHours != null || w.avgSleepingHR != null)
        .map((w) => ({
          dateISO: (w.dateISO ?? w.date) as string,
          sleepHours: w.sleepHours ?? null,
          avgSleepingHR: w.avgSleepingHR ?? null,
        }))
        .sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [wellness],
  );

  const skeleton = useMemo(() => {
    if (!rows.length) return [];
    return densifyDays(rows[0].dateISO, rows[rows.length - 1].dateISO);
  }, [rows]);

  const we = Math.max(skeleton.length - 1, 0);

  const sleepVals = useMemo(
    () => joinSeries(skeleton, rows, { key: "sleepHours", absence: "gap" }),
    [skeleton, rows],
  );
  const hrVals = useMemo(
    () => joinSeries(skeleton, rows, { key: "avgSleepingHR", absence: "gap" }),
    [skeleton, rows],
  );

  if (!rows.length) {
    return (
      <div role="img" aria-label="Schlaf" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        {ownPlan ? "Schlafdaten ab intervals.icu-Ära verfügbar" : "Keine Schlafdaten verfügbar"}
      </div>
    );
  }
  if (skeleton.length < 2) {
    return (
      <div role="img" aria-label="Schlaf" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Schlafdaten für einen Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });
  const step = we > 0 ? plotW / we : plotW;
  const barW = Math.min(step * 0.6, 20);

  const definedSleep = sleepVals.filter((v): v is number => v != null);
  const definedHR = hrVals.filter((v): v is number => v != null);
  const maxSleep = definedSleep.length ? Math.max(Math.ceil(Math.max(...definedSleep) * 1.15), 1) : 10;
  const minHR = definedHR.length ? Math.floor(Math.min(...definedHR) - 3) : 40;
  const maxHR = definedHR.length ? Math.ceil(Math.max(...definedHR) + 3) : 80;
  const yOf = (v: number) => PAD.t + plotH * (1 - v / maxSleep);
  const hrY = (v: number) => PAD.t + plotH * (1 - (v - minHR) / (maxHR - minHR));
  const yBase = PAD.t + plotH;

  const connectedHrPoints: { index: number; value: number }[] = [];
  for (let i = 0; i <= we; i++) {
    if (hrVals[i] != null) connectedHrPoints.push({ index: i, value: hrVals[i] as number });
  }
  const hrPath =
    connectedHrPoints.length > 1
      ? connectedHrPoints.map((p, i) => `${i === 0 ? "M" : "L"}${scale.x(p.index)},${hrY(p.value)}`).join(" ")
      : null;

  const dateXs = skeleton.map((_, i) => scale.x(i));
  const pickedTicks = [...pickLabelIndices(dateXs, 55)];

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Schlafdauer und Schlaf-Herzfrequenz über Zeit"
      >
        {[0, 1, 2, 3, 4].map((step2) => {
          const v = (maxSleep / 4) * step2;
          const y = yOf(v);
          return (
            <g key={step2}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}h
              </text>
            </g>
          );
        })}

        {ownPlan && (
          <>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={yOf(7)}
              y2={yOf(7)}
              stroke="var(--warn)"
              strokeWidth={1}
              strokeDasharray="5,3"
              opacity={0.6}
            />
            <text x={PAD.l + 4} y={yOf(7) - 4} fontSize={9} fill="var(--warn)" opacity={0.9}>
              7h Ziel
            </text>
          </>
        )}

        {skeleton.map((day, i) => {
          const v = sleepVals[i];
          if (v == null) return null;
          const yTop = yOf(v);
          const barH = Math.max(yBase - yTop, 1);
          const x = scale.x(i) - barW / 2;
          return (
            <rect
              key={day.dateISO}
              x={x}
              y={yBase - barH}
              width={barW}
              height={barH}
              rx={2}
              fill={barColor(v)}
              opacity={0.75}
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(day.dateISO)} · ${v}h Schlaf${hrVals[i] != null ? ` · ${hrVals[i]} bpm` : ""}`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}

        {hrPath && <path d={hrPath} fill="none" stroke="var(--thr)" strokeWidth={1.8} />}
        {skeleton.map((day, i) => {
          const v = hrVals[i];
          if (v == null) return null;
          return (
            <g key={`hr-${day.dateISO}`}>
              {/* Unsichtbare, größere Trefferfläche zuerst im DOM
                  (19.08.2026, Bugfix) — s. PmcChart.tsx für die
                  ausführliche Begründung. */}
              <circle
                cx={scale.x(i)}
                cy={hrY(v)}
                r={10}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${fmtDateFull(day.dateISO)} · ${v} bpm Schlaf-HF`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
              <circle cx={scale.x(i)} cy={hrY(v)} r={3} fill="var(--thr)" stroke="var(--surface-page)" strokeWidth={1.5} pointerEvents="none" />
            </g>
          );
        })}

        {definedHR.length > 0 && (
          <>
            {[minHR, (minHR + maxHR) / 2, maxHR].map((v, i) => (
              <text key={i} x={width - PAD.r + 6} y={hrY(v) + 3} fontSize={10} fill="var(--thr)" opacity={0.85}>
                {Math.round(v)}
              </text>
            ))}
            <text x={width - PAD.r + 6} y={PAD.t - 6} fontSize={9} fill="var(--thr)" opacity={0.85}>
              bpm
            </text>
          </>
        )}

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
