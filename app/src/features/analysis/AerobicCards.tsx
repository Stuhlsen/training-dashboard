import { AnalysisEmpty } from "./AnalysisSection";
import type { AerobicCard } from "./analysis-view-model";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--glass-2)",
  border: "1px solid var(--hair)",
  borderRadius: "var(--radius)",
  padding: "14px 16px",
};

/** Port von analysis.js::_renderAerobic's `.analysis-grid-3`/`.aerobic-card`. */
export function AerobicCards({ cards }: { cards: AerobicCard[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 }}>
      {cards.map((c) => (
        <div key={c.title} style={CARD_STYLE}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: ".64rem",
              textTransform: "uppercase",
              letterSpacing: ".06em",
              color: "var(--ink-3)",
              marginBottom: 8,
            }}
          >
            {c.title}
          </div>
          {c.empty ? (
            <AnalysisEmpty>{c.empty}</AnalysisEmpty>
          ) : (
            <>
              <div style={{ fontFamily: "var(--font-disp)", fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.1, color: c.valueColor ?? "var(--ink)" }}>
                {c.value}
                {c.unit && <span style={{ fontSize: ".7rem", fontWeight: 400, color: "var(--ink-3)", marginLeft: 4 }}>{c.unit}</span>}
              </div>
              {c.subs?.map((s, i) => (
                <div key={i} style={{ fontSize: ".7rem", color: s.color ?? "var(--ink-3)", marginTop: 5, lineHeight: 1.45 }}>
                  {s.text}
                </div>
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
