import { weekDisplayLabels } from "../../core/week-labels.js";
import { AnalysisBox, AnalysisEmpty } from "./AnalysisSection";
import type { LoadRow } from "./analysis-view-model";

const RISK_COLOR: Record<LoadRow["risk"], string> = {
  ok: "var(--z1, #4a9a6e)",
  caution: "var(--ss, #e08a3c)",
  high: "var(--thr, #d94f4f)",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  // 4 links → +6px, damit "Monot."/"Strain" im echten IBM Plex Mono bei
  // .72rem nicht mehr an den Track-Rand stossen (waren zuvor auf System-
  // Mono-Fallback abgestimmt, s. Etappe Typeset 2026-08-19).
  gridTemplateColumns: "66px 52px 52px 62px 62px 1fr",
  gap: 8,
  alignItems: "center",
  padding: "9px 4px",
  borderBottom: "1px solid var(--hair)",
  fontSize: ".78rem",
  fontVariantNumeric: "tabular-nums",
};

/** Port von analysis.js::_renderLoad's `.load-table` (letzte 8 Wochen). */
export function LoadTable({ rows }: { rows: LoadRow[] }) {
  if (!rows.length) return <AnalysisEmpty>Noch keine Wochenlast-Daten.</AnalysisEmpty>;

  return (
    <AnalysisBox>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            ...ROW_STYLE,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-label)",
            textTransform: "uppercase",
            letterSpacing: ".05em",
            color: "var(--ink-3)",
            borderBottom: "1px solid var(--hair)",
          }}
        >
          <span>Woche</span>
          <span>Last</span>
          <span>Ramp</span>
          <span>Monot.</span>
          <span>Strain</span>
          <span>Einordnung</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.week} style={{ ...ROW_STYLE, borderBottom: i === rows.length - 1 ? "none" : ROW_STYLE.borderBottom }}>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-3)", fontSize: ".72rem" }}>
              {weekDisplayLabels([r.week])[0]}
            </span>
            <span>{r.total || "–"}</span>
            <span>{r.ramp != null ? (r.ramp > 0 ? "+" : "") + r.ramp : "–"}</span>
            <span>{r.monotony ?? "–"}</span>
            <span>{r.strain ?? "–"}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", fontWeight: 600, letterSpacing: ".02em", color: RISK_COLOR[r.risk] }}>
                {r.label}
              </span>
              <span style={{ fontSize: ".68rem", color: "var(--ink-3)", lineHeight: 1.4 }}>{r.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </AnalysisBox>
  );
}
