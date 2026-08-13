import { phaseColor } from "../../config";
import { AnalysisBox, AnalysisEmpty } from "./AnalysisSection";
import type { PeriodizationSummary } from "./analysis-view-model";

const STATUS_COLOR: Record<PeriodizationSummary["blocks"][number]["status"], string> = {
  ok: "var(--z1, #4a9a6e)",
  teilweise: "var(--ss, #e08a3c)",
  abweichend: "var(--thr, #d94f4f)",
};

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "12px 96px 130px auto 1fr",
  gap: 10,
  alignItems: "center",
  padding: "9px 4px",
  borderBottom: "1px solid var(--hair)",
  fontSize: ".78rem",
};

/** Port von analysis.js::_renderPeriodization's `.phase-comp-row`. */
export function PeriodizationBlocks({ summary }: { summary: PeriodizationSummary | null }) {
  if (!summary) {
    return <AnalysisEmpty>Wird befüllt, sobald Trainingsblock-Wochen Fahrten mit Phasen-Zuordnung haben.</AnalysisEmpty>;
  }

  const lastRowIndex = summary.blocks.length - 1;
  const lastRecoveryIndex = summary.recovery.length - 1;

  return (
    <AnalysisBox>
      {summary.blocks.length ? (
        summary.blocks.map((b, i) => (
          <div key={b.phase} style={{ ...ROW_STYLE, borderBottom: i === lastRowIndex && !summary.recovery.length ? "none" : ROW_STYLE.borderBottom }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: phaseColor(b.phase) }} />
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>{b.phase}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--ink-3)" }}>{b.weeks.join(", ")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", fontWeight: 600, letterSpacing: ".02em", color: STATUS_COLOR[b.status] }}>
              {b.status === "ok" ? "phasengerecht" : b.status}
            </span>
            <span style={{ fontSize: ".7rem", color: "var(--ink-3)", lineHeight: 1.4 }}>{b.note}</span>
          </div>
        ))
      ) : (
        <AnalysisEmpty>Noch keine Blockwochen (Sweet Spot / Schwelle / VO₂max) mit Daten.</AnalysisEmpty>
      )}

      {summary.recovery.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: ".64rem",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "var(--ink-3)",
              marginTop: 12,
              marginBottom: 4,
            }}
          >
            Erholungswochen
          </div>
          {summary.recovery.map((r, i) => (
            <div key={r.week} style={{ ...ROW_STYLE, gridTemplateColumns: "12px 96px 1fr auto", borderBottom: i === lastRecoveryIndex ? "none" : ROW_STYLE.borderBottom }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: phaseColor("Erholung") }} />
              <span style={{ fontWeight: 600, color: "var(--ink)" }}>{r.week}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", color: "var(--ink-3)" }}>
                {r.tss} TSS{r.refTss != null ? ` vs. ${r.refTss} Nachbarwochen` : ""}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: ".68rem",
                  fontWeight: 600,
                  letterSpacing: ".02em",
                  color: r.reduced == null ? "var(--dim)" : r.reduced ? "var(--z1, #4a9a6e)" : "var(--thr, #d94f4f)",
                }}
              >
                {r.reduced == null ? "keine Referenz" : r.reduced ? "real reduziert" : "zu hart für Erholung"}
              </span>
            </div>
          ))}
        </div>
      )}
    </AnalysisBox>
  );
}
