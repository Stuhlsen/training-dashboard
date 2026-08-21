/* ============================================================
   CHARTS/POWERCURVETRACECARD.TSX — Power-Curve-Karte im Analyse-Tab
   „Antworten & Spuren" (Handoff-Abschnitt „Power-Curve-Karte", eigene
   Glaskarte unter Frage 1 "Werde ich stärker?").

   Eigenständig ggü. PowerCurveChart.tsx (Familie 4, kein Crosshair/Brush,
   11 log-verteilte STANDARD_SECS, FTP-Schwellenlinie): diese Karte nutzt
   8 GLEICHMÄSSIG verteilte Stützstellen (Handoff-Vorgabe, kein FTP-Bezug)
   und einen W/kg-Toggle. Wiederverwendet aus core/powercurve.js nur die
   generischen Extraktions-Helfer (extractPowerCurve/nearestWatts), nicht
   STANDARD_SECS selbst. „Vorjahr"-Vergleichslinie aus dem Prototyp entfällt
   (keine historische Power-Curve in der Datenpipeline, s. Umsetzungsplan).
   ============================================================ */

import { useMemo, useState } from "react";
import { extractPowerCurve, nearestWatts } from "../core/powercurve.js";
import { makeIndexScale, pathD } from "../core/chart-scale.js";
import { GlassCard } from "../components/GlassCard";

export type PowerUnit = "W" | "W/kg";

interface PowerCurveTraceCardProps {
  powerCurves: unknown;
  unit: PowerUnit;
  weightKg: number | null;
  /** Formatiert einen Watt-Wert passend zum aktuellen `unit` (Ganzzahl W
   *  bzw. zwei Nachkommastellen W/kg, deutsches Komma) — vom Aufrufer
   *  übergeben, damit diese Karte keine eigene Formatierungsregel kennt. */
  formatValue: (watts: number) => string;
}

const TARGET_POINTS: Array<{ secs: number; label: string }> = [
  { secs: 5, label: "5 s" },
  { secs: 15, label: "15 s" },
  { secs: 60, label: "1 min" },
  { secs: 300, label: "5 min" },
  { secs: 600, label: "10 min" },
  { secs: 1200, label: "20 min" },
  { secs: 3600, label: "60 min" },
  { secs: 5400, label: "90 min" },
];

const CW = 1000;
const CH = 240;
const CL = 58, CR = 15, CT = 14, CB = 34;

interface Cursor {
  index: number;
  clientX: number;
  clientY: number;
}

/** Power-Curve-Karte mit 8 gleichmäßig verteilten Stützstellen, W/kg-Toggle,
 *  Werte-Plättchen je Punkt (HTML-Spans über dem SVG, s. Handoff „Labels in
 *  Charts") und Hover-Fadenkreuz mit Tooltip. */
export function PowerCurveTraceCard({ powerCurves, unit, weightKg, formatValue }: PowerCurveTraceCardProps) {
  const [cursor, setCursor] = useState<Cursor | null>(null);

  const points = useMemo(() => {
    const { secs, watts } = extractPowerCurve(powerCurves as object | null);
    const map: Record<number, number> = {};
    for (let i = 0; i < secs.length; i++) if (watts[i] != null && watts[i] > 0) map[secs[i]] = watts[i];
    return TARGET_POINTS.map((p) => ({ ...p, watts: nearestWatts(map, p.secs) })).filter(
      (p): p is { secs: number; label: string; watts: number } => p.watts != null && p.watts > 0,
    );
  }, [powerCurves]);

  if (points.length < 2) {
    return (
      <GlassCard variant="strong" radius="20px" style={{ padding: "16px 20px 12px" }}>
        <p style={{ margin: 0, fontSize: ".84rem", color: "var(--text-soft)" }}>
          {powerCurves ? "Noch nicht genug Power-Curve-Punkte für die Kurve." : "Power-Curve-Daten werden beim nächsten Sync geladen."}
        </p>
      </GlassCard>
    );
  }

  const isKg = unit === "W/kg";
  const displayW = (raw: number) => (isKg && weightKg ? raw / weightKg : raw);

  const plotW = CW - CL - CR;
  const we = points.length - 1;
  const scale = makeIndexScale({ ws: 0, we, padLeft: CL, width: plotW });

  const vals = points.map((p) => displayW(p.watts));
  const vmax = Math.max(...vals) * 1.06;
  const vmin = Math.min(...vals) * 0.9;
  const yOf = (v: number) => CH - CB - ((v - vmin) / (vmax - vmin || 1)) * (CH - CT - CB);

  const xy = points.map((p, i) => [scale.x(i), yOf(displayW(p.watts))] as [number, number]);
  const areaD = `${pathD([[xy[0][0], CH - CB], ...xy, [xy[xy.length - 1][0], CH - CB]])} Z`;
  const lineD = pathD(xy);

  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => vmin + (vmax - vmin) * f);

  return (
    <GlassCard variant="strong" radius="20px" style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-disp)", fontSize: ".98rem", fontWeight: 600, color: "var(--text-ink)" }}>Power-Curve</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-label)" }}>
          5 s bis 90 min · Bestleistungen
        </span>
      </div>

      <div style={{ position: "relative" }} onMouseLeave={() => setCursor(null)}>
        <svg
          viewBox={`0 0 ${CW} ${CH}`}
          width="100%"
          style={{ display: "block" }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const xs = ((e.clientX - rect.left) / rect.width) * CW;
            const i = Math.round(scale.invert(xs));
            const clamped = Math.max(0, Math.min(we, i));
            setCursor({ index: clamped, clientX: e.clientX, clientY: e.clientY });
          }}
        >
          {grid.map((v, i) => (
            <line key={i} x1={CL} x2={CW - CR} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
          ))}
          <path d={areaD} fill="rgba(74,158,255,.10)" />
          <path d={lineD} fill="none" stroke="var(--role-primary)" strokeWidth={2.2} strokeLinejoin="round" />
          {xy.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3.4} fill="var(--role-primary)" />
          ))}
          {cursor != null && <line x1={xy[cursor.index][0]} x2={xy[cursor.index][0]} y1={14} y2={CH - CB} stroke="rgba(255,255,255,.5)" strokeWidth={1} />}
        </svg>

        {points.map((p, i) => (
          <span
            key={p.secs}
            style={{
              position: "absolute",
              left: `${(xy[i][0] / CW) * 100}%`,
              top: `${(xy[i][1] / CH) * 100}%`,
              transform: `translate(${i === 0 ? "-10%" : i === points.length - 1 ? "-90%" : "-50%"}, -100%)`,
              marginTop: -6,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              padding: "1px 4px",
              borderRadius: 4,
              background: "rgba(10,12,18,.66)",
              fontFamily: "var(--font-mono)",
              fontSize: ".64rem",
              color: "var(--text-soft)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatValue(displayW(p.watts))}
          </span>
        ))}

        {grid.map((v, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: 2,
              top: `${(yOf(v) / CH) * 100}%`,
              transform: "translateY(-50%)",
              fontFamily: "var(--font-mono)",
              fontSize: ".64rem",
              color: "var(--text-label)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatValue(v)}
          </span>
        ))}

        {points.map((p, i) => (
          <span
            key={p.secs}
            style={{
              position: "absolute",
              left: `${(xy[i][0] / CW) * 100}%`,
              bottom: 0,
              transform: `translateX(${i === points.length - 1 ? "-100%" : "-50%"})`,
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: ".64rem",
              color: "var(--text-label)",
            }}
          >
            {p.label}
          </span>
        ))}

        {cursor != null && (
          <div
            style={{
              position: "absolute",
              left: `${(xy[cursor.index][0] / CW) * 100}%`,
              top: 8,
              transform: "translateX(-50%)",
              padding: "7px 10px",
              borderRadius: 8,
              background: "var(--surface-tooltip)",
              border: "1px solid var(--hair)",
              boxShadow: "var(--e2)",
              pointerEvents: "none",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".62rem", color: "var(--text-soft)" }}>{points[cursor.index].label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".7rem", color: "var(--role-primary)", fontVariantNumeric: "tabular-nums" }}>
              {formatValue(displayW(points[cursor.index].watts))}
            </span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
