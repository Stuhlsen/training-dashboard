import type { TargetGoal } from "../../api/supabase/bikefit";
import type { BikeType } from "../../api/supabase/bikes";
import { BIKEFIT_TARGET_RANGES } from "../../core/bikefit";

export type RecommendationDirection = "increase" | "decrease" | "ok";

interface AngleItem {
  key: string;
  label: string;
  measured: number | null;
  direction?: RecommendationDirection | string;
  hint?: string;
  source: string;
}

interface TargetComparison {
  name?: string;
  value?: number | null;
  targetMin?: number;
  targetMax?: number;
  direction?: string;
  strength?: string;
  diff?: number | null;
  advice?: string;
  hint?: string;
}

interface IterationResultProps {
  bikeType?: BikeType;
  goal: TargetGoal;
  angles: Record<string, number | null>;
  recommendations: Record<string, TargetComparison>;
}

export function IterationResult({ bikeType = "road", goal, angles, recommendations }: IterationResultProps) {
  const typeRanges = BIKEFIT_TARGET_RANGES[bikeType] || BIKEFIT_TARGET_RANGES.road;
  const ranges = typeRanges[goal] || typeRanges.balanced;

  const items: AngleItem[] = [
    {
      key: "kneeAngle",
      label: "Kniewinkel (BDC)",
      measured: angles.kneeAngle ?? null,
      direction: recommendations.kneeAngle?.direction,
      hint: recommendations.kneeAngle?.advice || recommendations.kneeAngle?.hint,
      source: "Holmes et al. 1994 (Sattelhöhe)",
    },
    {
      key: "hipAngle",
      label: "Hüftwinkel (offen)",
      measured: angles.hipAngle ?? null,
      direction: recommendations.hipAngle?.direction,
      hint: recommendations.hipAngle?.advice || recommendations.hipAngle?.hint,
      source: "Pruitt 2006 (Beckenneigung)",
    },
    {
      key: "torsoAngle",
      label: "Rumpfwinkel (zur Horizontalen)",
      measured: angles.torsoAngle ?? null,
      direction: recommendations.torsoAngle?.direction,
      hint: recommendations.torsoAngle?.advice || recommendations.torsoAngle?.hint,
      source: "Silberman et al. 2005 (Cockpit-Reach)",
    },
    {
      key: "elbowAngle",
      label: "Ellbogenwinkel (Beugung)",
      measured: angles.elbowAngle ?? null,
      direction: recommendations.elbowAngle?.direction,
      hint: recommendations.elbowAngle?.advice || recommendations.elbowAngle?.hint,
      source: "Mellion 1991 (Stoßdämpfung)",
    },
  ];

  const getStatusBadge = (dir?: RecommendationDirection | string) => {
    if (!dir) return <span style={{ color: "var(--ink-3)" }}>–</span>;
    if (dir === "ok") {
      return (
        <span
          style={{
            padding: "3px 10px",
            borderRadius: "var(--radius-pill)",
            background: "rgba(74, 154, 110, 0.15)",
            border: "1px solid var(--z1)",
            color: "var(--z1)",
            fontSize: ".75rem",
            fontWeight: 600,
          }}
        >
          Optimal
        </span>
      );
    }
    return (
      <span
        style={{
          padding: "3px 10px",
          borderRadius: "var(--radius-pill)",
          background: "rgba(224, 138, 60, 0.15)",
          border: "1px solid var(--ss)",
          color: "var(--ss)",
          fontSize: ".75rem",
          fontWeight: 600,
        }}
      >
        Anpassung empfohlen
      </span>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3
          style={{
            margin: "0 0 4px",
            fontFamily: "var(--font-disp)",
            fontSize: "1.15rem",
            fontWeight: 600,
            color: "var(--ink)",
          }}
        >
          Winkel-Analyse & Biomechanik
        </h3>
        <p style={{ margin: 0, fontSize: ".85rem", color: "var(--ink-3)" }}>
          Fahrradtyp: <strong style={{ color: "var(--ink)" }}>{bikeType.toUpperCase()}</strong> · Zielkorridor:{" "}
          <strong style={{ color: "var(--ink)" }}>{goal.toUpperCase()}</strong>
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
        {items.map((it) => {
          const range = (ranges as Record<string, { min: number; max: number; name?: string }>)[it.key];
          const hasRange = range && typeof range.min === "number" && typeof range.max === "number";

          return (
            <div
              key={it.key}
              style={{
                padding: "14px 18px",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-2)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: ".9rem", color: "var(--ink)" }}>{it.label}</strong>
                  <div style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>{it.source}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "var(--font-disp)", fontSize: "1.2rem", fontWeight: 700, color: "var(--ink)" }}>
                      {it.measured !== null ? `${Math.round(it.measured)}°` : "–"}
                    </div>
                    {hasRange && (
                      <div style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>
                        Soll: {range.min}°–{range.max}°
                      </div>
                    )}
                  </div>
                  {getStatusBadge(it.direction)}
                </div>
              </div>

              {it.hint && (
                <div
                  style={{
                    fontSize: ".8rem",
                    color: "var(--ink-2)",
                    background: "rgba(255, 255, 255, 0.03)",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-sm)",
                    lineHeight: 1.4,
                  }}
                >
                  💡 {it.hint}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}