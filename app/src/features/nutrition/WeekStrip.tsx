/* ============================================================
   FEATURES/NUTRITION/WEEKSTRIP.TSX — Wochenleiste (Richtung B)
   (Fahrplan 25, R1; Entscheidung 1)

   Sieben Tage ab heute, jeder mit Datum, kleinem Fortschrittsbalken
   und Ampelpunkt. Antippen wählt den Tag der Bühne. Der Balken ist
   echte Information (geplant / Ziel), die Farbe kommt nur aus der
   Ampel (--ok / --warn / --danger) — der Punkt ist zusätzlich im
   Namen und im Tooltip ausgeschrieben, nie nur Farbe.

   Die Leiste sitzt direkt über dem Seitenhintergrund: Glas-Fill statt
   reiner Haarlinie (DESIGN.md, Ghost-Regel).
   ============================================================ */

import type { CSSProperties } from "react";
import { AMPEL_TEXT, AMPEL_TOKEN, AMPEL_TOOLTIP, type WeekStripDay } from "./nutrition-week-model";
import { TAP_MIN } from "./nutrition-styles";
import "./nutrition.css";

const BUTTON_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 4,
  width: "100%",
  minHeight: TAP_MIN + 28,
  padding: "8px 4px 10px",
  borderRadius: "var(--radius)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  cursor: "pointer",
  background: "var(--glass)",
  backdropFilter: "blur(16px)",
  boxShadow: "var(--e2)",
};
const TRACK_STYLE: CSSProperties = {
  width: "100%",
  height: 4,
  borderRadius: 999,
  background: "rgba(255, 255, 255, 0.14)",
  overflow: "hidden",
};

function label(day: WeekStripDay): string {
  const when = `${day.weekday} ${day.dateLabel}${day.isToday ? ", heute" : ""}`;
  if (day.filled === 0 || day.target == null) return `${when}: nichts geplant`;
  const ampel = day.ampel ? `, ${AMPEL_TEXT[day.ampel]}` : "";
  return `${when}: ${day.totalKcal} von ${day.target} kcal geplant${ampel}`;
}

export function WeekStrip({
  days,
  selectedISO,
  onSelect,
}: {
  days: readonly WeekStripDay[];
  selectedISO: string;
  onSelect: (dateISO: string) => void;
}) {
  return (
    <nav aria-label="Tage der Woche">
      <ul className="nut-strip">
        {days.map((day) => {
          const selected = day.dateISO === selectedISO;
          const color = day.ampel ? `var(${AMPEL_TOKEN[day.ampel]})` : "transparent";
          return (
            <li key={day.dateISO} style={{ minWidth: 0 }}>
              <button
                type="button"
                aria-pressed={selected}
                aria-current={day.isToday ? "date" : undefined}
                aria-label={label(day)}
                style={{
                  ...BUTTON_STYLE,
                  border: selected ? "1px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.14)",
                }}
                onClick={() => onSelect(day.dateISO)}
              >
                <span style={{ fontSize: ".7rem", color: "var(--ink-2)" }}>{day.isToday ? "Heute" : day.weekday}</span>
                <span style={{ fontSize: ".78rem", fontWeight: 600 }}>{day.dateLabel}</span>
                <span aria-hidden="true" style={TRACK_STYLE}>
                  <span style={{ display: "block", width: `${day.ratio * 100}%`, height: "100%", background: color }} />
                </span>
                <span
                  aria-hidden="true"
                  title={day.ampel ? `${AMPEL_TEXT[day.ampel]} — ${AMPEL_TOOLTIP}` : undefined}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: color,
                    // leerer Tag: nur ein feiner Ring, damit die Zeile nicht springt
                    border: day.ampel ? "none" : "1px solid var(--hair)",
                    boxSizing: "border-box",
                  }}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
