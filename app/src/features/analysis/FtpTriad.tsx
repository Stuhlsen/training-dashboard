import { AnalysisBox, AnalysisNote } from "./AnalysisSection";
import type { PowerDiagnostics } from "./analysis-view-model";

const ROW_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "28px 82px 64px 74px 1fr",
  gap: 10,
  alignItems: "center",
  padding: "10px 4px",
  borderBottom: "1px solid var(--hair)",
  fontSize: ".82rem",
};

/** Port von analysis.js::_renderPower's `.ftp-triad`/`.ftp-forecast-line`
 *  (ohne den Bestwerte-Digest, s. RecordChips.tsx). */
export function FtpTriad({ diagnostics }: { diagnostics: PowerDiagnostics }) {
  const { rows, weightNote, forecast } = diagnostics;

  return (
    <AnalysisBox>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r, i) => (
          <div key={r.label} style={{ ...ROW_STYLE, borderBottom: i === rows.length - 1 ? "none" : ROW_STYLE.borderBottom }}>
            <span style={{ fontSize: "1rem", textAlign: "center" }}>{r.icon}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: ".68rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-3)" }}>
              {r.label}
            </span>
            <span style={{ fontFamily: "var(--font-disp)", fontWeight: 700, fontSize: "1rem", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
              {r.value != null ? `${r.value} W` : "–"}
            </span>
            <span style={{ fontSize: ".74rem", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{r.wkgLabel}</span>
            <span style={{ fontSize: ".68rem", color: "var(--ink-3)", lineHeight: 1.4 }}>{r.meta}</span>
          </div>
        ))}
      </div>
      {weightNote && <AnalysisNote>{weightNote}</AnalysisNote>}
      {forecast &&
        (forecast.kind === "line" ? (
          <p style={{ fontSize: ".78rem", color: "var(--ink)", lineHeight: 1.5, margin: "12px 0 0", paddingTop: 12, borderTop: "1px solid var(--hair)" }}>
            {forecast.segments.map((s, i) =>
              s.strong ? (
                <strong key={i} style={{ color: "var(--accent)" }}>
                  {s.text}
                </strong>
              ) : (
                <span key={i}>{s.text}</span>
              )
            )}
          </p>
        ) : (
          <AnalysisNote>{forecast.segments.map((s) => s.text).join("")}</AnalysisNote>
        ))}
    </AnalysisBox>
  );
}
