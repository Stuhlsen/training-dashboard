/* ============================================================
   FEATURES/SETTINGS/FTPCHECK.TSX — Anzeige des Ziel-Checks (Fahrplan 43)

   Rendert nur eine fertige FtpCheckView aus goals-view-model.ts. Geteilt von
   den Einstellungen (GoalsSection) und der Trainer-Ansicht (TrainerGoals),
   damit beide dieselben Texte zeigen.
   ============================================================ */

import { LABEL_STYLE } from "./section-styles";
import type { FtpCheckView } from "./goals-view-model";

const CHECK_INFO_STYLE = {
  margin: 0,
  color: "var(--ink-3)",
  fontFamily: "var(--font-body)",
  fontSize: ".74rem",
  lineHeight: 1.5,
} as const;

export function FtpCheck({ view }: { view: FtpCheckView }) {
  if (view.kind !== "result") {
    return <p style={CHECK_INFO_STYLE}>{view.text}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "var(--font-disp)", fontWeight: 600, fontSize: ".82rem", color: "var(--ink)" }}>
        {view.headline}
      </div>
      <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {view.rows.map((row) => (
          <div key={row.label} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "2px 12px" }}>
            <dt style={{ ...LABEL_STYLE, display: "inline", marginBottom: 0 }}>{row.label}</dt>
            <dd style={{ margin: 0, fontSize: ".82rem", color: "var(--ink)" }}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {view.confidence && <p style={CHECK_INFO_STYLE}>{view.confidence}</p>}
    </div>
  );
}
