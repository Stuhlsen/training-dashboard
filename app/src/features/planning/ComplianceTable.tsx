import { formatSignedDelta } from "../../core/plan-feedback.js";
import { accessorySteps, complianceRuleText, fmtMinSec, visibleCompliance } from "./planning-view-model";

type Ride = import("../../types.js").Ride;

const RATING_LABEL: Record<string, string> = { green: "grün", yellow: "gelb", red: "rot" };
const RATING_ICON: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
const RATING_COLOR: Record<string, string> = { green: "var(--ok)", yellow: "var(--warn)", red: "var(--danger)" };

const CELL_STYLE: React.CSSProperties = { flex: 1, fontSize: ".78rem" };
const ROW_STYLE: React.CSSProperties = { display: "flex", gap: 8, padding: "3px 0" };

interface ComplianceTableProps {
  ride: Ride | null | undefined;
  cardId: string;
  workoutStructure: unknown;
}

/** Intervalltabelle Soll → Ist + Compliance-Ampel — Port von ui/planned.js::
 *  _renderComplianceTable Z. 1302-1365. `null`-Render, wenn die Ist-Fahrt
 *  nicht gegen GENAU diese Karte gematcht wurde (visibleCompliance()). */
export function ComplianceTable({ ride, cardId, workoutStructure }: ComplianceTableProps) {
  const c = visibleCompliance(ride, cardId);
  if (!c) return null;

  const ratingColor = RATING_COLOR[c.rating] ?? "var(--ink)";
  const accessory = accessorySteps(workoutStructure);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".78rem" }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Intervalle — Soll → Ist</div>

      <div style={{ ...ROW_STYLE, color: "var(--ink-3)", fontWeight: 600, borderBottom: "1px solid var(--hair)" }}>
        <span style={{ ...CELL_STYLE, flex: "0 0 28px" }}>Nr.</span>
        <span style={CELL_STYLE}>Dauer</span>
        <span style={CELL_STYLE}>Watt</span>
        <span style={{ ...CELL_STYLE, flex: "0 0 24px" }}>✓</span>
      </div>

      {c.matched.map((m, i) => (
        <div key={i} style={ROW_STYLE}>
          <span style={{ ...CELL_STYLE, flex: "0 0 28px", color: "var(--ink-3)" }}>{i + 1}</span>
          <span style={CELL_STYLE}>
            {fmtMinSec(m.plannedDurationS)} → {fmtMinSec(m.actualDurationS)}
          </span>
          <span style={CELL_STYLE}>
            {Math.round(m.plannedWatts)} W → {m.avgWatts != null ? `${Math.round(m.avgWatts)} W` : "–"}
          </span>
          <span style={{ ...CELL_STYLE, flex: "0 0 24px", color: m.fulfilled ? "var(--ok)" : "var(--danger)" }}>
            {m.fulfilled ? "✓" : "✗"}
          </span>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 2 }}>
        <span style={{ color: "var(--ink-3)" }}>Fade: {formatSignedDelta(c.fadePct)}%</span>
        <span style={{ color: ratingColor, fontWeight: 600 }}>
          {RATING_ICON[c.rating] ?? ""} {RATING_LABEL[c.rating] ?? c.rating}: {complianceRuleText(c.rule)}
        </span>
        {c.derived && (
          <span
            title="Struktur aus dem Freitext-Titel abgeleitet, keine reguläre Plankarten-Struktur"
            style={{
              fontSize: ".68rem",
              color: "var(--ink-3)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--pill)",
              padding: "1px 8px",
            }}
          >
            abgeleitet
          </span>
        )}
      </div>

      {accessory.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
          <div style={{ fontSize: ".72rem", color: "var(--ink-3)" }}>➕ Zusatz — zählt nicht in die Ampel oben (L6.1)</div>
          {accessory.map((step, i) => {
            const reps = Number.isInteger(step.reps) ? step.reps : "?";
            const workS = step.work?.duration_s;
            const target = step.work?.target;
            return (
              <div key={i} style={{ fontSize: ".74rem", color: "var(--ink-2)" }}>
                {reps} × {workS ? `${workS}s` : "–"}
                {target != null ? ` ${target}` : ""}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
