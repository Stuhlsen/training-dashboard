import { buildDoneCompareRows } from "./planning-view-model";
import type { PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;

const ROW_STYLE: React.CSSProperties = { display: "flex", gap: 8, padding: "3px 0", fontSize: ".78rem" };
const CELL_STYLE: React.CSSProperties = { flex: 1 };

interface DoneCompareBlockProps {
  card: PlanCardT;
  ride: Ride;
  canEdit: boolean;
}

/** "Geplant → Tatsächlich"-Vergleichsblock einer absolvierten Plankarte —
 *  Port von ui/planned.js::_renderDoneCard Z. 1094-1259 (compareHtml).
 *  Rein präsentational, gleicher Row/Cell-Aufbau wie ComplianceTable.tsx;
 *  die eigentliche Zeilenlogik sitzt in buildDoneCompareRows(). */
export function DoneCompareBlock({ card, ride, canEdit }: DoneCompareBlockProps) {
  const rows = buildDoneCompareRows(card, ride, canEdit);
  if (!rows.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: ".78rem" }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Geplant → Tatsächlich</div>
      {rows.map((row) => (
        <div key={row.label} style={ROW_STYLE}>
          <span style={{ ...CELL_STYLE, color: "var(--ink-3)" }}>
            {row.icon} {row.label}
          </span>
          <span style={CELL_STYLE}>{row.plan}</span>
          <span style={{ ...CELL_STYLE, flex: "0 0 14px", color: "var(--ink-3)" }}>→</span>
          <span style={{ ...CELL_STYLE, color: row.color ?? "var(--ink)" }}>{row.actual}</span>
          {row.extra && <span style={{ ...CELL_STYLE, color: "var(--ink-3)" }}>{row.extra}</span>}
        </div>
      ))}
    </div>
  );
}
