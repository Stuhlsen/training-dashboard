import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { nearestWeightKg, wattsPerKg } from "../core/body.js";
import { fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";

type Ride = import("../types.js").Ride;
type WellnessDay = import("../types.js").WellnessDay;

interface EfficiencyDetailScatterProps {
  rides: Ride[];
  wellness: WellnessDay[];
  selectedRide: Ride;
  onClose: () => void;
}

const W_FALLBACK = 780;
const H = 240;
const PAD = { l: 54, r: 20, t: 16, b: 44 };

interface Point {
  ride: Ride;
  wattKg: number;
  kmh: number;
  hmProKm: number;
}

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** "Warum"-Kontext zur EF-Trendlinie (Klick-Detail, EfficiencyChart.tsx):
 *  Watt/kg vs. km/h, gefärbt nach Höhenmeter/km (core/map-activity.js::
 *  hmProKm) — zeigt, ob eine EF-Auffälligkeit an Steigung statt Form liegt.
 *  Rides tragen kein Gewicht (nur WellnessDay), deshalb Join über
 *  core/body.js::nearestWeightKg() je Fahrtdatum; Fahrten ohne Treffer
 *  (v.a. alte Notion-Fahrten vor dem Wellness-Sync) fallen aus dem
 *  Datensatz, kein Sonderfall/Fallback-Gewicht. */
export function EfficiencyDetailScatter({ rides, wellness, selectedRide, onClose }: EfficiencyDetailScatterProps) {
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

  const data = useMemo<Point[]>(() => {
    const out: Point[] = [];
    for (const r of rides) {
      if (r.kmh == null || r.hmProKm == null) continue;
      const weightKg = nearestWeightKg(wellness, r.dateISO);
      // Bewusst nur NP, kein Ø-Watt-Fallback — core/normalize.js::efficiency
      // trifft dieselbe Entscheidung (Verzerrung bis ~25-30% bei Intervall-/
      // Bergfahrten, s. Kommentar dort). Fahrten ohne NP fallen hier raus,
      // statt denselben Bug für den Scatter unter anderem Namen einzuführen.
      const wattKg = wattsPerKg(r.np ?? null, weightKg);
      if (wattKg == null) continue;
      out.push({ ride: r, wattKg, kmh: r.kmh, hmProKm: r.hmProKm });
    }
    return out;
  }, [rides, wellness]);

  const selectedPoint = data.find((p) => p.ride === selectedRide) ?? null;

  const panelStyle: React.CSSProperties = {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    border: "1px solid var(--hair)",
    background: "var(--glass-2)",
    position: "relative",
  };

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Detailansicht schließen"
      style={{
        position: "absolute",
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: "50%",
        border: "1px solid var(--hair)",
        background: "transparent",
        color: "var(--text-label)",
        fontSize: ".85rem",
        lineHeight: 1,
        cursor: "pointer",
      }}
    >
      ×
    </button>
  );

  if (!data.length) {
    return (
      <div style={panelStyle}>
        {closeButton}
        <div style={{ fontSize: ".85rem", color: "var(--text-soft)" }}>
          Für diesen Zeitraum kein Watt/kg berechenbar (kein Gewicht in der Nähe erfasst).
        </div>
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);

  const wattKgVals = data.map((p) => p.wattKg);
  const kmhVals = data.map((p) => p.kmh);
  const hmVals = data.map((p) => p.hmProKm);
  const minX = Math.min(...wattKgVals) - 0.1;
  const maxX = Math.max(...wattKgVals) + 0.1;
  const minY = Math.min(...kmhVals) - 1;
  const maxY = Math.max(...kmhVals) + 1;
  const minHm = Math.min(...hmVals);
  const maxHm = Math.max(...hmVals);
  const xOf = (v: number) => PAD.l + ((v - minX) / (maxX - minX || 1)) * plotW;
  const yOf = (v: number) => PAD.t + plotH - ((v - minY) / (maxY - minY || 1)) * plotH;
  const colorOf = (hm: number) => {
    const pct = Math.round((((hm - minHm) / (maxHm - minHm || 1)) * 100 + Number.EPSILON) * 10) / 10;
    return `color-mix(in oklch, var(--thr) ${pct}%, var(--z2) ${100 - pct}%)`;
  };

  return (
    <div style={panelStyle}>
      {closeButton}
      <div style={{ fontSize: ".75rem", color: "var(--text-soft)", marginBottom: 8, paddingRight: 24 }}>
        Watt/kg vs. km/h · Farbe = Höhenmeter/km ·{" "}
        {selectedPoint ? fmtDateFull(selectedPoint.ride.dateISO) : `${fmtDateFull(selectedRide.dateISO)} (kein Watt/kg berechenbar)`}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Watt pro Kilogramm vs. Geschwindigkeit, gefärbt nach Höhenmeter pro Kilometer"
      >
        {[0, 1, 2, 3, 4].map((step) => {
          const v = minY + ((maxY - minY) / 4) * step;
          const y = PAD.t + plotH - (plotH / 4) * step;
          return (
            <g key={step}>
              <line x1={PAD.l} x2={width - PAD.r} y1={y} y2={y} stroke="var(--hair)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <text x={PAD.l - 8} y={PAD.t - 6} textAnchor="end" fontSize={9} fill="var(--text-label)">
          km/h
        </text>

        {[0, 1, 2, 3, 4].map((step) => {
          const v = minX + ((maxX - minX) / 4) * step;
          const x = PAD.l + (plotW / 4) * step;
          return (
            <text key={step} x={x} y={H - PAD.b + 14} textAnchor="middle" fontSize={10} fill="var(--text-label)">
              {v.toFixed(1)}
            </text>
          );
        })}
        <text x={width - PAD.r} y={H - 6} textAnchor="end" fontSize={9} fill="var(--text-label)">
          W/kg
        </text>

        {data
          .filter((p) => p !== selectedPoint)
          .map((p, i) => (
            <g key={p.ride.activityId ?? `${p.ride.dateISO}-${i}`}>
              <circle
                cx={xOf(p.wattKg)}
                cy={yOf(p.kmh)}
                r={8}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${fmtDateFull(p.ride.dateISO)} · ${p.wattKg.toFixed(2)} W/kg · ${p.kmh.toFixed(1)} km/h · ${p.hmProKm.toFixed(1)} Hm/km${p.ride.name ? " · " + p.ride.name : ""}`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
              />
              <circle cx={xOf(p.wattKg)} cy={yOf(p.kmh)} r={4} fill={colorOf(p.hmProKm)} opacity={0.7} pointerEvents="none" />
            </g>
          ))}

        {selectedPoint && (
          <g>
            <circle
              cx={xOf(selectedPoint.wattKg)}
              cy={yOf(selectedPoint.kmh)}
              r={10}
              fill="transparent"
              pointerEvents="all"
              onMouseEnter={(e) =>
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  content: `${fmtDateFull(selectedPoint.ride.dateISO)} · ${selectedPoint.wattKg.toFixed(2)} W/kg · ${selectedPoint.kmh.toFixed(1)} km/h · ${selectedPoint.hmProKm.toFixed(1)} Hm/km${selectedPoint.ride.name ? " · " + selectedPoint.ride.name : ""} · ausgewählt`,
                })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            <circle
              cx={xOf(selectedPoint.wattKg)}
              cy={yOf(selectedPoint.kmh)}
              r={7}
              fill={colorOf(selectedPoint.hmProKm)}
              stroke="var(--ss)"
              strokeWidth={2.5}
              pointerEvents="none"
            />
          </g>
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
