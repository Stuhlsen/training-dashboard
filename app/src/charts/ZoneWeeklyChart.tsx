import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { isoWeekKey } from "../core/aggregate.js";
import { weekDisplayLabels } from "../core/week-labels.js";
import { pickLabelIndices } from "../core/chart-scale.js";
import { LOW_INTENSITY_TARGET, weeklyZoneShares } from "../core/zones.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;

interface ZoneWeeklyChartProps {
  rides: Ride[];
}

const W_FALLBACK = 780;
const H = 270;
const PAD = { l: 50, r: 16, t: 20, b: 40 };
const COLORS = { low: "var(--z2)", mid: "var(--ss)", high: "var(--vo2)" } as const;
const BANDS = ["low", "mid", "high"] as const;

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

// "" statt null bei fehlendem dateISO: weeklyZoneShares' weekKeyFn ist als
// `=> string` typisiert (core/zones.js), die Funktion filtert jeden falsy
// Key gleichermaßen (`if (!key) continue`) — dasselbe Muster wie
// hero-view-model.ts::buildLoadGuard-Aufruf.
const weekKeyFn = (r: Ride) => (r.dateISO ? isoWeekKey(r.dateISO) : "");
const weekSortFn = (a: string, b: string) => a.localeCompare(b);

/** Zeit-in-Zonen-Chart (Etappe 12e, Familie 3 — Aggregat-Balken, docs/chart-
 *  grundlagen.md §7.2) — Port von assets/js/ui/charts/training.js
 *  ::renderZoneWeekly() nach dem WeeklyVolumeChart-Baumuster (gleicher
 *  isoWeekKey-Bucket, kein makeIndexScale). Gestapelte Balken statt
 *  Einzelserie: low/mid/high je Woche aus core/zones.js::weeklyZoneShares.
 *  Farben wie IntensityBand.tsx (--z2/--ss/--vo2) statt der Vanilla-Palette
 *  (dort noch --thr für "hoch") — dieselbe Bänderung ist im Analyse-Tab
 *  bereits mit dieser Zuordnung geportet, hier für Konsistenz übernommen
 *  statt einer zweiten Farbwahrheit für dieselben drei Bänder. Bewusst
 *  außerhalb des Scopes wie bei WeeklyVolumeChart: Bucket-Hover-Kopplung
 *  ans PMC-Fadenkreuz und Brush-Klick auf Balken. */
export function ZoneWeeklyChart({ rides }: ZoneWeeklyChartProps) {
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

  const weeks = useMemo(() => weeklyZoneShares(rides ?? [], weekKeyFn, weekSortFn), [rides]);

  if (!weeks.length) {
    return (
      <div
        role="img"
        aria-label="Zeit in Zonen"
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        Zonendaten werden ab dem nächsten Sync aufgebaut.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const gap = plotW / weeks.length;
  const barW = Math.min(gap * 0.6, 48);
  const labels = weekDisplayLabels(weeks.map((w) => w.week));
  const barCenterXs = weeks.map((_, i) => PAD.l + i * gap + gap / 2);
  const labelIdx = pickLabelIndices(barCenterXs, 40);
  const denseValues = gap < 24;
  const yOf = (share: number) => PAD.t + plotH * (1 - share);
  const targetY = yOf(LOW_INTENSITY_TARGET);

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Zeit in Zonen: Intensitätsverteilung je Kalenderwoche"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const y = PAD.t + (plotH / 4) * step;
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {100 - step * 25}%
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.l}
          x2={width - PAD.r}
          y1={targetY}
          y2={targetY}
          stroke="var(--ok)"
          strokeWidth={1}
          strokeDasharray="5,3"
          opacity={0.7}
        />
        <text x={width - PAD.r - 4} y={targetY - 4} textAnchor="end" fontSize={9} fill="var(--ok)">
          Ziel ≥{Math.round(LOW_INTENSITY_TARGET * 100)}% Grundlage
        </text>

        {weeks.map((wk, i) => {
          const total = wk.low + wk.mid + wk.high;
          const x = PAD.l + i * gap + (gap - barW) / 2;
          let yCursor = PAD.t + plotH;
          const segments = BANDS.map((band) => {
            const h = total ? (wk[band] / total) * plotH : 0;
            const y = yCursor - h;
            yCursor = y;
            return { band, y, h };
          });
          const showValue = !denseValues || labelIdx.has(i);
          return (
            <g key={wk.week}>
              {segments.map(({ band, y, h }) =>
                h > 0 ? (
                  <rect key={band} x={x} y={y} width={barW} height={h} fill={COLORS[band]} opacity={0.85} />
                ) : null,
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
                    content: `${wk.week} · ${wk.hours}h · ${Math.round(wk.lowShare * 100)}% Grundlage (Z1–Z2) · ${wk.onTarget ? "im Soll" : "zu viel Intensität"}`,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {showValue && (
                <text
                  x={x + barW / 2}
                  y={yOf(wk.lowShare) - 5}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={600}
                  fill={wk.onTarget ? "var(--ok)" : "var(--warn)"}
                >
                  {Math.round(wk.lowShare * 100)}%
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
