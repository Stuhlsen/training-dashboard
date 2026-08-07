import { z2Estimate } from "./planning-view-model";

const ROW_STYLE: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10 };
const LABEL_STYLE: React.CSSProperties = { fontSize: ".76rem", color: "var(--ink-3)", minWidth: 92 };

function pillStyle(color: string): React.CSSProperties {
  return {
    fontSize: ".76rem",
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: "var(--pill)",
    color,
    background: `color-mix(in oklab, ${color} 20%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 40%, transparent)`,
  };
}

interface Z2BlockProps {
  typ: string | null;
  km: number | null;
  details: string;
}

/** HF-Zielzone/Distanz/Kalorien-Block für lange Z2-Ausfahrten — Port von
 *  ui/planned.js::_renderCard Z. 936-961. `null`-Render außerhalb der Z2-
 *  Typen oder ohne `km` (Athlet 2 führt hier keine Distanz, s. dort). */
export function Z2Block({ typ, km, details }: Z2BlockProps) {
  const est = z2Estimate({ typ, km });
  if (!est) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>❤️ Ziel-HF</span>
        <span style={pillStyle("#4a7fa8")}>Z2 Aerobic · 123–152 bpm</span>
      </div>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>📍 Distanz</span>
        <span style={pillStyle("#6b9fa8")}>
          {est.kmMin}–{est.kmMax} km
        </span>
      </div>
      <div style={ROW_STYLE}>
        <span style={LABEL_STYLE}>🔥 ~Kalorien</span>
        <span style={pillStyle("#c9a84c")}>
          ca. {est.kcal} kcal · {est.hours}h
        </span>
      </div>
      <div style={{ fontSize: ".8rem", color: "var(--ink-2)" }}>{details}</div>
    </div>
  );
}
