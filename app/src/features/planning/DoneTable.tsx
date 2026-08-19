import { Fragment, useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { fmt, fmtDate, fmtInt } from "../../core/format.js";
import { RATING_COLOR, RATING_ICON } from "./compliance-rating";
import { DoneCompareBlock } from "./DoneCompareBlock";
import type { DoneTableRow, GapChip, PlanFidelitySummary } from "./done-table-view-model";

const HEADER_CELL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-label)",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  color: "var(--ink-3)",
  padding: "0 8px 6px",
  textAlign: "left",
};

const CELL_STYLE: React.CSSProperties = { padding: "8px", fontSize: ".8rem", verticalAlign: "middle" };

export interface DoneTableProps {
  rows: DoneTableRow[];
  fidelity: PlanFidelitySummary;
  gaps: GapChip[];
  canEdit: boolean;
  /** 13e liefert DoneDetailChart als eigentlichen Chart-Inhalt — hier nur
   *  ein Einhänge-Slot (gleiches Muster wie WeekGrid.tsx::renderDetail),
   *  damit 13d/13e parallel entwickelbar bleiben. */
  renderChart?: (row: DoneTableRow) => React.ReactNode;
}

/** "Absolviert"-Soll/Ist-Tabelle (Etappe 13d, Redesign nach "Planungstab
 *  Live"-Mockup) — ersetzt die bisherige Karten-Liste
 *  (`CardSection("✅ Absolviert…")` in PlanningPage.tsx, Verdrahtung folgt
 *  in 13f). Klick auf eine Zeile klappt DoneCompareBlock (unverändert
 *  wiederverwendet) + den DoneDetailChart-Slot darunter auf. */
export function DoneTable({ rows, fidelity, gaps, canEdit, renderChart }: DoneTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: ".78rem", color: "var(--ink-3)" }}>
        <span>
          Plantreue {fidelity.windowDays} Tage:{" "}
          <strong style={{ color: "var(--ink)" }}>{fidelity.ratedCount ? `${fidelity.pct}%` : "–"}</strong>
        </span>
        {fidelity.ratedCount > 0 && (
          <span>
            ({fidelity.fulfilledCount}/{fidelity.ratedCount})
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: ".8rem", color: "var(--ink-3)" }}>Noch keine absolvierten Einheiten.</div>
      ) : (
        <GlassCard variant="soft" radius="var(--radius)" style={{ overflowX: "auto", padding: "8px 4px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--hair)" }}>
                <th style={HEADER_CELL_STYLE}>Tag</th>
                <th style={HEADER_CELL_STYLE}>Einheit</th>
                <th style={HEADER_CELL_STYLE}>Soll/Ist</th>
                <th style={HEADER_CELL_STYLE}>Dauer</th>
                <th style={HEADER_CELL_STYLE}>TSS</th>
                <th style={HEADER_CELL_STYLE}>Ø Watt</th>
                <th style={HEADER_CELL_STYLE}>Compliance</th>
                <th style={{ ...HEADER_CELL_STYLE, textAlign: "right" }} aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = row.card.id === openId;
                return (
                  <Fragment key={row.card.id}>
                    <tr
                      data-plan-card-date={row.date}
                      onClick={row.expandable ? () => setOpenId(isOpen ? null : row.card.id) : undefined}
                      style={{
                        borderBottom: "1px solid var(--hair)",
                        cursor: row.expandable ? "pointer" : "default",
                        background: isOpen ? "rgba(255,255,255,.03)" : undefined,
                      }}
                    >
                      <td style={{ ...CELL_STYLE, fontFamily: "var(--font-mono)", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {fmtDate(row.date)}
                      </td>
                      <td style={CELL_STYLE}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                          <span aria-hidden="true">{row.typIcon}</span>
                          <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.name}
                          </span>
                        </span>
                      </td>
                      <td style={CELL_STYLE}>
                        <SollIstBar ratioPct={row.tssRatioPct} />
                      </td>
                      <td style={{ ...CELL_STYLE, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                        {row.durationActual}
                        {row.durationPlan !== "–" && (
                          <span style={{ color: "var(--ink-3)" }}> · Soll {row.durationPlan}</span>
                        )}
                      </td>
                      <td style={{ ...CELL_STYLE, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                        {fmtInt(row.tssActual)}
                        {row.tssPlanned != null && <span style={{ color: "var(--ink-3)" }}> / {fmtInt(row.tssPlanned)}</span>}
                      </td>
                      <td style={{ ...CELL_STYLE, color: row.wattColor ?? "var(--ink-2)", whiteSpace: "nowrap" }}>
                        {row.wattActual}
                      </td>
                      <td style={CELL_STYLE}>
                        {row.compliance ? (
                          <span style={{ color: RATING_COLOR[row.compliance.rating] ?? "var(--ink)" }}>
                            {RATING_ICON[row.compliance.rating] ?? ""}
                          </span>
                        ) : (
                          <span style={{ color: "var(--ink-3)" }}>–</span>
                        )}
                      </td>
                      <td style={{ ...CELL_STYLE, textAlign: "right", color: "var(--ink-3)" }}>
                        {row.expandable ? (isOpen ? "▾" : "▸") : ""}
                      </td>
                    </tr>
                    {isOpen && row.ride && (
                      <tr>
                        <td colSpan={8} style={{ padding: "10px 8px 16px", borderBottom: "1px solid var(--hair)" }}>
                          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                            <div style={{ flex: "1 1 260px", minWidth: 220 }}>
                              <DoneCompareBlock card={row.card} ride={row.ride} canEdit={canEdit} />
                            </div>
                            <div style={{ flex: "1 1 260px", minWidth: 220 }}>{renderChart?.(row)}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </GlassCard>
      )}

      {gaps.length > 0 && <GapsChips gaps={gaps} />}
    </div>
  );
}

function SollIstBar({ ratioPct }: { ratioPct: number | null }) {
  if (ratioPct == null) return <span style={{ color: "var(--ink-3)" }}>–</span>;
  const color = ratioPct >= 80 && ratioPct <= 120 ? "var(--ok)" : "var(--warn)";
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 48, height: 4, borderRadius: 2, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.min(100, ratioPct)}%`, background: color }} />
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-label)", color: "var(--ink-3)" }}>{fmt(ratioPct, 0)}%</span>
    </span>
  );
}

function GapsChips({ gaps }: { gaps: GapChip[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Lücken</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {gaps.map((gap) => (
          <span
            key={gap.id}
            title={gap.note}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: ".72rem",
              color: gap.kind === "cancelled" ? "var(--danger)" : "var(--warn)",
              background: "rgba(255,255,255,.03)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--pill)",
              padding: "3px 10px",
            }}
          >
            <span aria-hidden="true">{gap.typIcon}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{fmtDate(gap.date)}</span>
            <span>{gap.name}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
