import { AnalysisBox, AnalysisEmpty, AnalysisNote } from "./AnalysisSection";
import type { IntensityDistribution } from "./analysis-view-model";

const pct = (v: number) => Math.round(v * 100);

/** Port von analysis.js::_renderZones' `.zone-bar`/`.zone-legend`/
 *  `.zone-shape`. */
export function IntensityBand({ dist }: { dist: IntensityDistribution | null }) {
  if (!dist) {
    return (
      <AnalysisEmpty>
        Keine Zonen- oder Intensitätsdaten verfügbar — Zeit-in-Zone erscheint nach dem nächsten Daten-Sync.
      </AnalysisEmpty>
    );
  }

  return (
    <AnalysisBox>
      <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", background: "var(--hair)" }}>
        <div style={{ width: `${pct(dist.shares.low)}%`, background: "var(--z2, #4a7fa8)" }} title="Niedrig" />
        <div style={{ width: `${pct(dist.shares.mid)}%`, background: "var(--ss, #e08a3c)" }} title="Mittel" />
        <div style={{ width: `${pct(dist.shares.high)}%`, background: "var(--vo2, #a24ad0)" }} title="Hoch" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontSize: ".72rem", color: "var(--ink-3)", alignItems: "center" }}>
        <span>
          <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: "middle", background: "var(--z2, #4a7fa8)" }} />
          Niedrig {pct(dist.shares.low)}%
        </span>
        <span>
          <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: "middle", background: "var(--ss, #e08a3c)" }} />
          Mittel {pct(dist.shares.mid)}%
        </span>
        <span>
          <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, marginRight: 5, verticalAlign: "middle", background: "var(--vo2, #a24ad0)" }} />
          Hoch {pct(dist.shares.high)}%
        </span>
        <span style={{ color: "var(--ink-3)", marginLeft: "auto", fontSize: ".68rem" }}>Richtwert: ≥80% niedrig</span>
      </div>
      {dist.shapeLabel ? (
        <p style={{ fontSize: ".8rem", color: "var(--ink)", marginTop: 12, lineHeight: 1.5 }}>
          <strong style={{ color: "var(--accent)" }}>{dist.shapeLabel}</strong> — {dist.note}
        </p>
      ) : (
        <AnalysisNote>{dist.note}</AnalysisNote>
      )}
      <AnalysisNote>{dist.sourceLabel}</AnalysisNote>
    </AnalysisBox>
  );
}
