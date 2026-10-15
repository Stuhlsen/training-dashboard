/* ============================================================
   FEATURES/NUTRITION/AMPELBADGE.TSX — Ampel als Punkt + Text
   (Fahrplan 23, L3; aus DayCard.tsx herausgelöst, Fahrplan 25 R1)

   --ok / --warn / --danger, NICHT die Zonenfarben — und nie nur
   Farbe: Text + Tooltip ("keine medizinische Schwelle").
   ============================================================ */

import { AMPEL_TEXT, AMPEL_TOKEN, AMPEL_TOOLTIP, type Ampel } from "./nutrition-week-model";

export function AmpelBadge({ ampel }: { ampel: Ampel }) {
  return (
    <span
      title={AMPEL_TOOLTIP}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: ".78rem",
        color: "var(--ink)",
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 9, height: 9, borderRadius: "50%", background: `var(${AMPEL_TOKEN[ampel]})` }}
      />
      {AMPEL_TEXT[ampel]}
    </span>
  );
}
