import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { isoWeekKey } from "../core/aggregate.js";
import { weekDisplayLabels } from "../core/week-labels.js";
import { pickLabelIndices } from "../core/chart-scale.js";
import { weeklyWeatherAverages } from "../core/weather.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface WeatherWeeklyChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 270;
const PAD = { l: 44, r: 44, t: 20, b: 40 };
const CONDITION_COLOR = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)" } as const;

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

// "" statt null bei fehlendem dateISO, gleiches Muster wie ZoneWeeklyChart.tsx
// — weeklyWeatherAverages filtert jeden falsy Key (`if (!key) continue`).
const weekKeyFn = (r: Ride) => (r.dateISO ? isoWeekKey(r.dateISO) : "");
const weekSortFn = (a: string, b: string) => a.localeCompare(b);

const fmt = (v: number | null, unit: string) => (v == null ? "–" : `${v}${unit}`);

/** Wetter-Chart (Etappe 12f, Familie 3 — Aggregat-Balken, docs/chart-
 *  grundlagen.md §7.2) — Port von assets/js/ui/charts/training.js
 *  ::renderWeatherWeekly() nach dem WeeklyVolumeChart-Baumuster nur wochenweise
 *  (Tages-Wetter selbst wäre Familie 1/2, s. chart-grundlagen.md §7.2 —
 *  hier bewusst nur die Wochenaggregat-Ansicht). Balken = Ø-Temperatur
 *  (Ampelfarbe aus core/weather.js::weeklyWeatherAverages' `condition`,
 *  identische Grenzwerte wie logbook-view-model.ts::classifyWeather), Linie =
 *  Ø-Windgeschwindigkeit (zweite y-Achse rechts, wie vanilla), 🌧-Marker bei
 *  Wochen-Regensumme > 0.5mm. Kein core/-Reuse von classifyWeather (features/-
 *  Import in core/ wäre ein Schichtenbruch) — Grenzwerte bewusst dupliziert,
 *  s. Kommentar in core/weather.js. Bewusst außerhalb des Scopes wie bei
 *  WeeklyVolumeChart: Bucket-Hover-Kopplung ans PMC-Fadenkreuz und
 *  Brush-Klick-auf-Balken. */
export function WeatherWeeklyChart({ rides }: WeatherWeeklyChartProps) {
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

  const weeks = useMemo(() => weeklyWeatherAverages(rides ?? [], weekKeyFn, weekSortFn), [rides]);

  if (!weeks.length) {
    return (
      <div
        role="img"
        aria-label="Wetter"
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        Wetterdaten werden ab dem nächsten Sync aufgebaut.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);

  const temps = weeks.map((w) => w.temp).filter((v): v is number => v != null);
  const minTemp = temps.length ? Math.min(...temps) : 0;
  const maxTemp = temps.length ? Math.max(...temps) : 25;
  const scaleMin = Math.floor(Math.min(0, minTemp) / 5) * 5;
  const scaleMax = Math.ceil((maxTemp + 2) / 5) * 5;
  const tempRange = Math.max(scaleMax - scaleMin, 5);
  const yOf = (v: number) => PAD.t + plotH * (1 - (v - scaleMin) / tempRange);

  const winds = weeks.map((w) => w.wind).filter((v): v is number => v != null);
  const maxWind = Math.max(...winds, 10) * 1.15 || 10;
  const windYOf = (v: number) => PAD.t + plotH * (1 - v / maxWind);

  const gap = plotW / weeks.length;
  const barW = Math.min(gap * 0.6, 40);
  const labels = weekDisplayLabels(weeks.map((w) => w.week));
  const barCenterXs = weeks.map((_, i) => PAD.l + i * gap + gap / 2);
  const labelIdx = pickLabelIndices(barCenterXs, 40);
  const denseValues = gap < 24;
  const gridStep = tempRange / 4;

  const windPoints = weeks
    .map((w, i) => (w.wind == null ? null : `${barCenterXs[i]},${windYOf(w.wind)}`))
    .filter((p): p is string => p != null)
    .join(" ");

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Wetter: Temperatur, Wind und Niederschlag je Kalenderwoche"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = scaleMin + gridStep * step;
          const y = yOf(v);
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}°
              </text>
            </g>
          );
        })}

        {scaleMin < 0 && (
          <line
            x1={PAD.l}
            x2={width - PAD.r}
            y1={yOf(0)}
            y2={yOf(0)}
            stroke="var(--text-label)"
            strokeWidth={1}
            strokeDasharray="3,3"
            opacity={0.5}
          />
        )}

        {weeks.map((w, i) => {
          const x = PAD.l + i * gap + (gap - barW) / 2;
          const yBase = yOf(scaleMin);
          const yTop = w.temp == null ? yBase : yOf(w.temp);
          const barY = Math.min(yTop, yBase);
          const barH = w.temp == null ? 0 : Math.max(Math.abs(yBase - yTop), 1);
          const showValue = w.temp != null && (!denseValues || labelIdx.has(i));
          return (
            <g key={w.week}>
              {barH > 0 && (
                <rect x={x} y={barY} width={barW} height={barH} rx={2} fill={CONDITION_COLOR[w.condition]} opacity={0.78} />
              )}
              {w.precip != null && w.precip > 0.5 && (
                <text x={x + barW / 2} y={yTop - 14} textAnchor="middle" fontSize={11}>
                  🌧
                </text>
              )}
              {showValue && (
                <text x={x + barW / 2} y={yTop - 4} textAnchor="middle" fontSize={9} fill="var(--text-label)">
                  {w.temp}°
                </text>
              )}
              <rect
                x={x}
                y={PAD.t}
                width={barW}
                height={plotH}
                fill="transparent"
                style={{ cursor: "default" }}
                onMouseEnter={(e) => {
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${w.week} · Ø${fmt(w.temp, "°C")} · Ø${fmt(w.wind, " km/h")} Wind · ${fmt(w.precip, "mm")} Regen · ${w.rides} Fahrten`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {labelIdx.has(i) && (
                <text x={x + barW / 2} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}

        {windPoints && (
          <polyline points={windPoints} fill="none" stroke="var(--z2)" strokeWidth={1.5} opacity={0.85} />
        )}
        {weeks.map((w, i) =>
          w.wind == null ? null : (
            <circle key={`wind-${w.week}`} cx={barCenterXs[i]} cy={windYOf(w.wind)} r={2.5} fill="var(--z2)" />
          ),
        )}

        {[0, 1, 2].map((step) => {
          const v = Math.round((maxWind / 2) * step);
          const y = windYOf(v);
          return (
            <text key={step} x={width - PAD.r + 6} y={y + 3} fontSize={10} fill="var(--z2)" opacity={0.85}>
              {v}
            </text>
          );
        })}
        <text
          x={width - PAD.r + 6}
          y={PAD.t - 6}
          fontSize={9}
          fill="var(--z2)"
          opacity={0.85}
        >
          km/h
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
