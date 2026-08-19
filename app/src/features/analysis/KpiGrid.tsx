import type { AnalysisKpi } from "./analysis-view-model";

/** Port von analysis.js::_renderKPIs' `.analysis-kpi-grid`/`.analysis-kpi`
 *  (assets/css/components.css). */
export function KpiGrid({ kpis }: { kpis: AnalysisKpi[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginTop: 16 }}>
      {kpis.map((k) => (
        <div
          key={k.label}
          style={{
            background: "var(--glass-2)",
            border: "1px solid var(--hair)",
            borderRadius: "var(--radius)",
            padding: "14px 16px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: k.color ?? "var(--ink)", lineHeight: 1.1 }}>{k.value}</div>
          <div style={{ fontSize: "var(--fs-label)", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 4 }}>
            {k.label}
          </div>
          {k.sub && <div style={{ fontSize: ".65rem", color: "var(--ink-3)", marginTop: 3 }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}
