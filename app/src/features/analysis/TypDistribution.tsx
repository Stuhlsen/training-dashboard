import { AnalysisBox } from "./AnalysisSection";
import type { TypDistributionRow } from "./analysis-view-model";

/** Port von analysis.js::_renderTypDistribution's `.typ-dist-bars`. */
export function TypDistribution({ rows }: { rows: TypDistributionRow[] }) {
  if (!rows.length) return null;

  return (
    <AnalysisBox style={{ marginTop: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.typ} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: ".75rem", color: "var(--ink-3)", minWidth: 130, flexShrink: 0 }}>{r.typ}</span>
            <div style={{ flex: 1, height: 6, background: "var(--hair)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${r.pct.toFixed(1)}%`, height: "100%", borderRadius: 3, background: r.color }} />
            </div>
            <span style={{ fontSize: ".75rem", fontWeight: 700, minWidth: 36, textAlign: "right", flexShrink: 0, color: r.color }}>
              {r.pct.toFixed(0)}%
            </span>
            <span style={{ fontSize: ".7rem", color: "var(--ink-3)", minWidth: 120, flexShrink: 0 }}>
              {r.count} Fahrten · {r.km} km
            </span>
          </div>
        ))}
      </div>
    </AnalysisBox>
  );
}
