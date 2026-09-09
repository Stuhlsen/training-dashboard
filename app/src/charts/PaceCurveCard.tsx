/* ============================================================
   CHARTS/PACECURVECARD.TSX — Pace-Kurve (beste Ø-Pace je Distanz) im
   Analyse-Tab. Fahrplan 10 E8b, das Pace-Pendant zu PowerCurveTraceCard.tsx.

   ÜBER DISTANZ, nicht über Dauer: rides-N.json trägt für Lauf/Schwimm
   keine Sekunden-Streams (E0-Bericht 2026-09-07, LP1) — je Aktivität
   genau EIN Datenpunkt (größter Distanz-Bucket ≤ Gesamtdistanz). Ohne
   Splits gibt es keinen Teil-Distanz-Bestwert. Die Rechnung liefert
   core/pace-curve.js::buildPaceCurve, hier nur das Rendering.

   y-Achse INVERTIERT: schnellere Pace (kleinere Sekunden) = weiter oben.
   ============================================================ */

import { makeIndexScale, pathD } from "../core/chart-scale.js";
import { fmtPace } from "../core/format.js";
import { GlassCard } from "../components/GlassCard";
import type { PaceCurvePoint } from "../features/analysis/pace-section-view-model";

interface PaceCurveCardProps {
  curve: PaceCurvePoint[];
  /** "min/km" (Lauf) bzw. "min/100 m" (Schwimm) — für die Kopfzeile. */
  thresholdUnit: string;
  /** "Läufe" / "Einheiten" — für den Leerzustandstext. */
  activityNoun: string;
}

const CW = 1000;
const CH = 220;
const CL = 62, CR = 16, CT = 14, CB = 32;

export function PaceCurveCard({ curve, thresholdUnit, activityNoun }: PaceCurveCardProps) {
  if (curve.length < 2) {
    return (
      <GlassCard variant="strong" radius="20px" style={{ padding: "16px 20px 12px" }}>
        <p style={{ margin: 0, fontSize: ".84rem", color: "var(--text-soft)" }}>
          Noch nicht genug {activityNoun} über verschiedene Distanzen für eine Pace-Kurve.
        </p>
      </GlassCard>
    );
  }

  const plotW = CW - CL - CR;
  const we = curve.length - 1;
  const scale = makeIndexScale({ ws: 0, we, padLeft: CL, width: plotW });

  const paces = curve.map((p) => p.paceSec);
  const pmin = Math.min(...paces) * 0.96;
  const pmax = Math.max(...paces) * 1.04;
  // Invertiert: kleine Pace (schnell) → kleines y (oben).
  const yOf = (p: number) => CT + ((p - pmin) / (pmax - pmin || 1)) * (CH - CT - CB);

  const xy = curve.map((p, i) => [scale.x(i), yOf(p.paceSec)] as [number, number]);
  const lineD = pathD(xy);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => pmin + (pmax - pmin) * f);

  return (
    <GlassCard variant="strong" radius="20px" style={{ padding: "16px 20px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-disp)", fontSize: ".98rem", fontWeight: 600, color: "var(--text-ink)" }}>Pace-Kurve</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: ".6rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-label)" }}>
          beste Ø-Pace je Distanz · {thresholdUnit}
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${CW} ${CH}`} width="100%" style={{ display: "block" }}>
          {grid.map((v, i) => (
            <line key={i} x1={CL} x2={CW - CR} y1={yOf(v)} y2={yOf(v)} stroke="rgba(255,255,255,.07)" strokeWidth={1} />
          ))}
          <path d={lineD} fill="none" stroke="var(--z1)" strokeWidth={2.2} strokeLinejoin="round" />
          {xy.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={3.4} fill="var(--z1)" />
          ))}
        </svg>

        {curve.map((p, i) => (
          <span
            key={p.distance}
            style={{
              position: "absolute",
              left: `${(xy[i][0] / CW) * 100}%`,
              top: `${(xy[i][1] / CH) * 100}%`,
              transform: `translate(${i === 0 ? "-10%" : i === curve.length - 1 ? "-90%" : "-50%"}, -100%)`,
              marginTop: -6,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              padding: "1px 4px",
              borderRadius: 4,
              background: "rgba(10,12,18,.66)",
              fontFamily: "var(--font-mono)",
              fontSize: ".62rem",
              color: "var(--text-soft)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtPace(p.paceSec)}
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
              fontSize: ".62rem",
              color: "var(--text-label)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtPace(v)}
          </span>
        ))}

        {curve.map((p, i) => (
          <span
            key={p.distance}
            style={{
              position: "absolute",
              left: `${(xy[i][0] / CW) * 100}%`,
              bottom: 0,
              transform: `translateX(${i === curve.length - 1 ? "-100%" : "-50%"})`,
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
              fontSize: ".62rem",
              color: "var(--text-label)",
            }}
          >
            {p.label}
          </span>
        ))}
      </div>
    </GlassCard>
  );
}
