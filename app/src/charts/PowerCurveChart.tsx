import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildCurveData } from "../core/powercurve.js";
import { makeIndexScale, pathD } from "../core/chart-scale.js";
import { ChartTooltip } from "./ChartTooltip";

interface PowerCurveChartProps {
  /** Rohes intervals.icu-Power-Curve-Objekt (beide Formate) — die Extraktion
   *  auf die Standard-Zeitintervalle übernimmt core/powercurve.js. */
  powerCurves: unknown;
  ftp: number | null | undefined;
}

const W_FALLBACK = 780;
const H = 260;
const PAD = { l: 56, r: 16, t: 30, b: 44 };

interface Tooltip {
  x: number;
  y: number;
  content: string;
}

/** Power-Curve-Chart (Etappe 8f, Familie 4 — "nicht-Datums-Achse",
 *  docs/chart-grundlagen.md §7.2) — Port von assets/js/ui/charts/power.js
 *  ::renderPowerCurve() nach dem PmcChart-Baumuster. Die x-Achse ist wie im
 *  Vanilla-Original index-basiert über die 11 festen Standard-Zeitintervalle
 *  (core/powercurve.js::STANDARD_SECS), keine echte Zeitstempel-/Log-Skala
 *  über Sekunden — die Buckets selbst sind bereits annähernd logarithmisch
 *  gestaffelt, das reicht für die visuelle Wirkung, `core/chart-scale.js::
 *  makeIndexScale` ist direkt wiederverwendbar. Bewusst NICHT portiert:
 *  W/kg-Unit-Toggle, Block-Overlay (Sweet-Spot/Schwelle/VO2max-Vergleich) —
 *  s. Etappe-8f-Plan, Scope-Entscheidung. Nimmt laut §7.3 nicht am
 *  Crosshair/Brush teil (Familie 4). */
export function PowerCurveChart({ powerCurves, ftp }: PowerCurveChartProps) {
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

  const curveData = useMemo(() => buildCurveData(powerCurves as object | null), [powerCurves]);

  if (!curveData.length) {
    return (
      <div
        role="img"
        aria-label="Power-Curve"
        style={{ padding: 24, color: "var(--text-soft)", fontSize: ".85rem" }}
      >
        {powerCurves ? "Noch keine Power-Curve-Daten verfügbar." : "Power-Curve-Daten werden beim nächsten Sync geladen."}
      </div>
    );
  }

  const plotH = H - PAD.t - PAD.b;
  const plotW = Math.max(width - PAD.l - PAD.r, 10);
  const we = curveData.length - 1;
  const scale = makeIndexScale({ ws: 0, we, padLeft: PAD.l, width: plotW });

  const maxWatts = Math.max(...curveData.map((d) => d.watts)) * 1.1 || 10;
  const yOf = (v: number) => PAD.t + plotH - (v / maxWatts) * plotH;

  const gridStep = Math.ceil(maxWatts / 5 / 50) * 50 || 50;
  const gridSteps = Math.max(1, Math.floor(maxWatts / gridStep));

  const points = curveData.map((d, i) => [scale.x(i), yOf(d.watts)] as [number, number]);
  const ftpY = ftp ? yOf(ftp) : null;

  const areaD = `${pathD([[scale.x(0), PAD.t + plotH], ...points, [scale.x(we), PAD.t + plotH]])} Z`;
  const aboveFtpD =
    ftpY != null
      ? `${pathD([
          [scale.x(0), Math.min(points[0][1], ftpY)],
          ...points.map(([x, y]) => [x, Math.min(y, ftpY)] as [number, number]),
          [scale.x(we), ftpY],
          [scale.x(0), ftpY],
        ])} Z`
      : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${H}`}
        style={{ width: "100%", height: H, display: "block" }}
        role="img"
        aria-label="Power-Curve: erreichte Watt je Zeitintervall"
      >
        {Array.from({ length: gridSteps + 1 }, (_, i) => i * gridStep).map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={width - PAD.r} y1={yOf(v)} y2={yOf(v)} stroke="var(--hair)" strokeWidth={1} />
            <text x={PAD.l - 8} y={yOf(v) + 3} textAnchor="end" fontSize={10} fill="var(--text-label)">
              {v}W
            </text>
          </g>
        ))}

        <path d={areaD} fill="var(--role-primary)" opacity={0.05} />
        {aboveFtpD && <path d={aboveFtpD} fill="var(--role-secondary)" opacity={0.15} />}

        {ftpY != null && (
          <g>
            <line
              x1={PAD.l}
              x2={width - PAD.r}
              y1={ftpY}
              y2={ftpY}
              stroke="var(--role-status)"
              strokeWidth={1.5}
              strokeDasharray="6,3"
              opacity={0.85}
            />
            <text x={PAD.l + 6} y={ftpY - 5} fontSize={9} fontWeight={600} fill="var(--role-status)">
              FTP {ftp}W
            </text>
          </g>
        )}

        <path d={pathD(points)} fill="none" stroke="var(--role-primary)" strokeWidth={2} strokeLinejoin="round" />

        {curveData.map((d, i) => (
          <g key={d.secs}>
            <text x={scale.x(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--text-label)">
              {d.label}
            </text>
            {/* Unsichtbare, größere Trefferfläche zuerst im DOM (19.08.2026,
                Bugfix) — s. PmcChart.tsx für die ausführliche Begründung. */}
            <circle
              cx={scale.x(i)}
              cy={yOf(d.watts)}
              r={10}
              fill="transparent"
              pointerEvents="all"
              onMouseEnter={(e) =>
                setTooltip({ x: e.clientX, y: e.clientY, content: `${d.label} · ${Math.round(d.watts)}W` })
              }
              onMouseLeave={() => setTooltip(null)}
            />
            <circle cx={scale.x(i)} cy={yOf(d.watts)} r={4} fill="var(--role-primary)" pointerEvents="none" />
          </g>
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
