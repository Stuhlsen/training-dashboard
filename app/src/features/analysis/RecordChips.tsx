import { AnalysisEmpty } from "./AnalysisSection";
import type { RecordChip } from "./analysis-view-model";

/** Port von analysis.js::_renderPower's `.records-digest`/`.record-chip`. */
export function RecordChips({ records }: { records: RecordChip[] }) {
  if (!records.length) return <AnalysisEmpty>Noch keine Bestwerte erfasst.</AnalysisEmpty>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
      {records.map((r) => (
        <div
          key={r.key}
          title={r.name}
          style={{
            background: "var(--glass-2)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius-sm, 10px)",
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span style={{ fontSize: "1rem" }}>{r.icon}</span>
          <span style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1.05rem", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
            {r.value}&nbsp;{r.unit}
          </span>
          <span style={{ fontSize: ".7rem", color: "var(--ink-3)" }}>{r.label}</span>
          <span style={{ fontSize: ".63rem", color: "var(--ink-3)" }}>
            {r.date}
            {r.historyCount ? ` · ${r.historyCount}× abgelöst` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
