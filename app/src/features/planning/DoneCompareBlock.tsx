import { buildDoneCompareRows } from "./planning-view-model";
import type { PlanCard as PlanCardT } from "../../api/types";

type Ride = import("../../types.js").Ride;

/** Feste Spaltenvorlage statt Flex — die optionale Extra-Spalte (max HF, NP,
 *  CTL, Distanz-Delta) ist immer als Grid-Track vorhanden, damit Pfeil und
 *  Ist-Spalte über alle Zeilen bündig bleiben (früher: eine Flex-Zelle mehr
 *  in Zeilen mit `extra` → verrutschte Spalten). */
const GRID_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 14px 1fr 1fr",
  columnGap: 8,
  rowGap: 6,
  fontSize: ".78rem",
};

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
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: ".78rem" }}>
      <div style={{ fontSize: ".76rem", fontWeight: 600, color: "var(--ink-2)" }}>Geplant → Tatsächlich</div>
      <div style={GRID_STYLE}>
        {rows.map((row) => (
          <div key={row.label} style={{ display: "contents" }}>
            <span style={{ color: "var(--ink-3)" }}>
              {row.icon} {row.label}
            </span>
            <span>{row.plan}</span>
            <span style={{ color: "var(--ink-3)" }}>→</span>
            <span style={{ color: row.color ?? "var(--ink)" }}>{row.actual}</span>
            <span style={{ color: "var(--ink-3)" }}>{row.extra ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
