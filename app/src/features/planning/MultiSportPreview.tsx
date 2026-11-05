/* ============================================================
   FEATURES/PLANNING/MULTISPORTPREVIEW.TSX — gemeinsame Vorschau aller
   Sportarten des „Neuer Plan"-Dialogs (Fahrplan 44 E4).

   - Raster: Tage als Zeilen, je Sportart eine Spalte — so stehen mehrere
     Einheiten am selben Tag nebeneinander und das Raster bleibt auch auf dem
     Handy lesbar. Sportart = Symbol + Beschriftung + Farbe aus den
     Sport-Tokens (E1); die Farbe trägt nie allein die Bedeutung.
   - Last: jede Sportart eine eigene Zeile, dazu die Summe mit dem Zusatz
     „Näherung" (M8) — TSS und die Last aus Laufen/Schwimmen sind nicht
     aufeinander geeicht.
   - Ersetzen: je Sportart, welcher laufende Plan abgelöst wird.

   Reine Darstellung; die Zahlen kommen aus dem View-Model.
   ============================================================ */

import { useState } from "react";
import { sportBadge } from "../../core/activity-sport.js";
import { addDaysISO, fmtDate } from "../../core/format.js";
import { WEEKDAY_LABELS } from "./new-plan-dialog-view-model";
import { MULTI_SPORT_LABEL, type LoadSummary } from "./multi-sport-plan-view-model";
import type { ActiveSport } from "../../api/hooks/useActiveSport";

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontSize: ".74rem",
};
const CELL_STYLE: React.CSSProperties = {
  padding: "5px 6px",
  borderTop: "1px solid var(--hair)",
  verticalAlign: "top",
  color: "var(--ink-2)",
  overflowWrap: "anywhere",
  textAlign: "left",
};
const HEAD_STYLE: React.CSSProperties = {
  ...CELL_STYLE,
  borderTop: "none",
  color: "var(--ink)",
  fontWeight: 600,
};

/** Was die Vorschau braucht — "Neuer Plan" (E4) und "Sportart hinzufügen" (E5) liefern beides. */
export interface MultiSportPreviewData {
  items: ReadonlyArray<{
    sport: ActiveSport;
    plan: {
      weeks: ReadonlyArray<{
        start: string;
        cards: ReadonlyArray<{ date: string; name: string; durationMin: number | null }>;
      }>;
    };
  }>;
  load: LoadSummary;
}

interface MultiSportPreviewProps {
  bundle: MultiSportPreviewData;
  notes: ReadonlyArray<{ text: string }>;
}

export function MultiSportPreview({ bundle, notes }: MultiSportPreviewProps) {
  const { items, load } = bundle;
  const [weekIdx, setWeekIdx] = useState(0);
  const idx = Math.min(weekIdx, Math.max(0, load.weekStarts.length - 1));
  const weekStart = load.weekStarts[idx];

  // Karten der gewählten Woche je Sportart.
  const cardsOf = (item: (typeof items)[number], date: string) =>
    (item.plan.weeks.find((w) => w.start === weekStart)?.cards ?? []).filter((c) => c.date === date);

  return (
    <div
      style={{ borderTop: "1px solid var(--hair)", paddingTop: 14, display: "grid", gap: 14 }}
      aria-label="Gemeinsame Vorschau"
      role="region"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: ".86rem", color: "var(--ink)" }}>Gemeinsame Vorschau</strong>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".76rem", color: "var(--ink-3)" }}>
          Woche
          <select
            aria-label="Woche"
            value={idx}
            onChange={(e) => setWeekIdx(Number(e.target.value))}
            style={{
              background: "rgba(255,255,255,.04)",
              border: "1px solid var(--hair)",
              borderRadius: "var(--radius-sm)",
              color: "var(--ink)",
              font: "inherit",
              padding: "4px 8px",
            }}
          >
            {load.weekStarts.map((s, i) => (
              <option key={s} value={i}>
                {i + 1} · ab {fmtDate(s)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {weekStart && (
        <table style={TABLE_STYLE} aria-label="Wochenraster aller Sportarten">
          <thead>
            <tr>
              <th scope="col" style={{ ...HEAD_STYLE, width: 34, color: "var(--ink-3)" }}>
                Tag
              </th>
              {items.map((it) => {
                const badge = sportBadge(it.sport);
                return (
                  <th
                    key={it.sport}
                    scope="col"
                    style={{ ...HEAD_STYLE, borderBottom: `2px solid ${badge.colorVar}` }}
                  >
                    <span aria-hidden="true">{badge.icon}</span> {MULTI_SPORT_LABEL[it.sport]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {WEEKDAY_LABELS.map((d, i) => {
              const date = addDaysISO(weekStart, i);
              return (
                <tr key={d.iso}>
                  <th scope="row" style={{ ...CELL_STYLE, color: "var(--ink-3)", fontWeight: 600 }}>
                    {d.short}
                  </th>
                  {items.map((it) => {
                    const cards = cardsOf(it, date);
                    return (
                      <td key={it.sport} style={CELL_STYLE} data-sport={it.sport}>
                        {cards.length === 0 ? (
                          <span aria-label="frei" style={{ color: "var(--ink-3)" }}>
                            –
                          </span>
                        ) : (
                          cards.map((c, n) => (
                            <div key={n}>
                              {c.name}
                              {!c.name.includes(`${c.durationMin} min`) && (
                                <span style={{ color: "var(--ink-3)" }}> · {c.durationMin} min</span>
                              )}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div>
        <table style={TABLE_STYLE} aria-label="Last pro Woche (Näherung)">
          <thead>
            <tr>
              <th scope="col" style={HEAD_STYLE}>
                Last (TSS)
              </th>
              <th scope="col" style={HEAD_STYLE}>
                Diese Woche
              </th>
              <th scope="col" style={HEAD_STYLE}>
                Ø je Woche
              </th>
            </tr>
          </thead>
          <tbody>
            {load.rows.map((r) => {
              const badge = sportBadge(r.sport);
              return (
                <tr key={r.sport}>
                  <th scope="row" style={{ ...CELL_STYLE, fontWeight: 400 }}>
                    <span aria-hidden="true">{badge.icon}</span> {r.label}
                  </th>
                  <td style={CELL_STYLE}>{r.values[idx]}</td>
                  <td style={CELL_STYLE}>{r.avg}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" style={{ ...CELL_STYLE, color: "var(--ink)", fontWeight: 700 }}>
                {load.totalLabel}
              </th>
              <td style={{ ...CELL_STYLE, color: "var(--ink)", fontWeight: 700 }}>{load.total[idx]}</td>
              <td style={{ ...CELL_STYLE, color: "var(--ink)", fontWeight: 700 }}>{load.totalAvg}</td>
            </tr>
          </tfoot>
        </table>
        <p style={{ margin: "6px 0 0", fontSize: ".72rem", color: "var(--ink-3)" }}>
          Die Summe ist eine Näherung: Die Last aus Rad, Laufen und Schwimmen ist nicht aufeinander
          geeicht.
        </p>
      </div>

      <ul style={{ margin: 0, paddingLeft: 18, fontSize: ".78rem", color: "var(--ink-2)", display: "grid", gap: 3 }}>
        {notes.map((n, i) => (
          <li key={`${i}-${n.text}`}>{n.text}</li>
        ))}
      </ul>
    </div>
  );
}
