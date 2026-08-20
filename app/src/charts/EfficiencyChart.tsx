import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { makeIndexScale, pathD, pickLabelIndices } from "../core/chart-scale.js";
import { efficiencyTrend } from "../core/efficiency.js";
import { fmt, fmtInt, fmtDate, fmtDateFull } from "../core/format.js";
import { ChartTooltip } from "./ChartTooltip";
import { EfficiencyDetailScatter } from "./EfficiencyDetailScatter";

type Ride = import("../types.js").Ride;
type WellnessDay = import("../types.js").WellnessDay;

interface EfficiencyChartProps {
  rides: Ride[];
  wellness?: WellnessDay[];
}

const W_FALLBACK = 780;
const H = 210;
const PAD = { l: 50, r: 16, t: 16, b: 36 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Aerobe Effizienz (Watt/HF) — Etappe 12c, erweitert um eine durchgehende,
 *  bei EF-Lücken sichtbar unterbrochene Rohlinie + Klick-Scatter (Etappe
 *  "EF-Trendlinie + Scatter", 20.08.2026). Ersetzt damit auch den früheren
 *  TempoTrendChart ("Ø Tempo · Entwicklung", km/h-Trend) — Bergetappen mit
 *  hoher Leistung, aber niedriger Ø-Geschwindigkeit verfälschten dessen
 *  Trend, EF ist streckenunabhängig.
 *
 *  Achse ist bewusst der FAHRT-Index (chronologisch, ein Punkt = eine
 *  Fahrt), NICHT das Tagesgerüst von WellnessChart/SleepChart (Familie 2).
 *  Deren Lücken-Linie verbindet laut eigenem Kopfkommentar bewusst ÜBER
 *  Messlücken hinweg — genau das Gegenteil dessen, was hier gewollt ist
 *  (Fahrten ohne EF sollen eine SICHTBARE Lücke erzeugen, kein Verbinden).
 *  Über ein Tagesgerüst wäre das nicht sinnvoll ausdrückbar: Fahrten liegen
 *  selten an aufeinanderfolgenden Kalendertagen, fast jeder Punkt bliebe
 *  isoliert. Auf der Fahrt-Index-Achse dagegen bedeutet "Lücke" exakt "diese
 *  Fahrt hat kein EF" — die Rohlinie bricht dort, das nächste Segment
 *  beginnt bei der nächsten Fahrt mit EF-Wert.
 *
 *  Die bestehende Rolling-Mean-Linie über vergleichbare Z2-Fahrten
 *  (core/efficiency.js::efficiencyTrend) bleibt als zweite, geglättete
 *  Overlay-Linie erhalten — analog zu TempoTrendChart, das ebenfalls
 *  Rohlinie + geglättete Trendlinie gleichzeitig zeigte. */
export function EfficiencyChart({ rides, wellness }: EfficiencyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(W_FALLBACK);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [selectedRide, setSelectedRide] = useState<Ride | null>(null);

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

  const allRides = useMemo(
    () => (rides ?? []).slice().sort((a, b) => a.dateISO.localeCompare(b.dateISO)),
    [rides],
  );
  const trend = useMemo(() => efficiencyTrend(rides ?? []), [rides]);
  const comparableSet = useMemo(
    () => new Set(trend.comparable.map((r) => r.dateISO + (r.name || ""))),
    [trend],
  );
  // Objekt-Referenz als Map-Schlüssel statt eines abgeleiteten Strings:
  // `allRides` ist dieselbe `rides`-Prop nur sortiert (kein .map()/Kopie
  // der Elemente), `trend.comparable` filtert ebenfalls direkt aus `rides`
  // — Fahrt-Objekte bleiben also identisch referenzierbar. Vermeidet die
  // Kollisionsgefahr eines "Datum+Name"-Strings bei zwei gleichnamigen
  // Fahrten am selben Tag (v.a. Notion-Altbestand ohne activityId).
  const indexByRide = useMemo(() => new Map<Ride, number>(allRides.map((r, i) => [r, i])), [allRides]);

  const efCount = allRides.filter((r) => r.efficiency != null).length;
  const we = Math.max(allRides.length - 1, 0);

  if (efCount < 2) {
    return (
      <div role="img" aria-label="Aerobe Effizienz" style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}>
        Noch nicht genug Powermeter-Fahrten für einen EF-Trend.
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const visible = allRides.map((r) => r.efficiency).filter((v): v is number => v != null);
  const vMin = Math.max(0, Math.min(...visible) - 0.1);
  const vMax = Math.max(...visible) + 0.1;
  const yOf = (v: number) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  // Rohlinie in Segmente zerlegt: ein <path> je zusammenhängendem Lauf von
  // Fahrten mit EF-Wert, keine Verbindung über eine Lücke hinweg.
  const rawSegments: string[] = [];
  let run: [number, number][] = [];
  for (let i = 0; i < allRides.length; i++) {
    const v = allRides[i].efficiency;
    if (v != null) {
      run.push([scale.x(i), yOf(v)]);
    } else if (run.length) {
      if (run.length >= 2) rawSegments.push(pathD(run));
      run = [];
    }
  }
  if (run.length >= 2) rawSegments.push(pathD(run));

  const rollPoints = trend.comparable
    .map((r, idx) => {
      const i = indexByRide.get(r);
      const rv = trend.rolling[idx];
      return i != null && rv != null ? { i, x: scale.x(i), y: yOf(rv) } : null;
    })
    .filter((p): p is { i: number; x: number; y: number } => p != null)
    .sort((a, b) => a.i - b.i);
  const rollPath = rollPoints.length >= 2 ? pathD(rollPoints.map((p) => [p.x, p.y])) : null;

  const dateXs = allRides.map((_, i) => scale.x(i));
  const pickedTicks = [...pickLabelIndices(dateXs, 55)];

  const noteText =
    trend.comparable.length >= 3
      ? `EF-Trend: ${trend.comparable.length} vergleichbare Z2-Fahrten${trend.slopePer30d != null ? ` · ${trend.slopePer30d > 0 ? "+" : ""}${trend.slopePer30d} W/bpm je 30 Tage` : ""}`
      : "Nur Powermeter-Fahrten";

  function handleSelect(r: Ride) {
    setSelectedRide((prev) => (prev === r ? null : r));
  }

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

        {rawSegments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--role-primary)" strokeWidth={1.8} opacity={0.55} />
        ))}
        {rollPath && <path d={rollPath} fill="none" stroke="var(--z1)" strokeWidth={2} strokeLinejoin="round" opacity={0.9} />}

        {allRides.map((d, i) => {
          const v = d.efficiency;
          if (v == null) return null;
          const comparable = trend.comparable.length < 3 || comparableSet.has(d.dateISO + (d.name || ""));
          const x = scale.x(i);
          const y = yOf(v);
          const selected = selectedRide === d;
          return (
            <g key={d.activityId ?? `${d.dateISO}-${i}`}>
              {/* Unsichtbare, größere Trefferfläche zuerst im DOM
                  (19.08.2026, Bugfix) — s. PmcChart.tsx für die
                  ausführliche Begründung. */}
              <circle
                cx={x}
                cy={y}
                r={10}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: "pointer" }}
                onMouseEnter={(e) =>
                  setTooltip({
                    x: e.clientX,
                    y: e.clientY,
                    content: `${fmtDateFull(d.dateISO)} · Effizienz ${fmt(d.efficiency ?? null, 2)} W/bpm · ${fmtInt(d.watt ?? null)}W · ${fmtInt(d.hf ?? null)} bpm${trend.comparable.length >= 3 ? (comparable ? " · vergleichbar (Z2)" : " · Kontext") : ""} · Klick für Detailansicht`,
                  })
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => handleSelect(d)}
              />
              <circle
                cx={x}
                cy={y}
                r={selected ? 6 : comparable ? 4.5 : 3}
                fill={selected ? "var(--ss)" : comparable ? "var(--z2)" : "var(--text-label)"}
                opacity={selected ? 1 : comparable ? 0.9 : 0.4}
                stroke="var(--surface-page)"
                strokeWidth={selected ? 1.5 : 1}
                pointerEvents="none"
              />
            </g>
          );
        })}

        {pickedTicks.map((i) => (
          <text key={i} x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
            {fmtDate(allRides[i].dateISO)}
          </text>
        ))}
      </svg>
      {tooltip && (
        <ChartTooltip x={tooltip.x} y={tooltip.y}>
          {tooltip.content}
        </ChartTooltip>
      )}
      {selectedRide && (
        <EfficiencyDetailScatter
          rides={allRides}
          wellness={wellness ?? []}
          selectedRide={selectedRide}
          onClose={() => setSelectedRide(null)}
        />
      )}
    </div>
  );
}
