/* ============================================================
   FEATURES/PLANNING/WEEKLYHOURSFIELD.TSX — Feld „Stunden pro Woche"

   Geteilt von „Plan anpassen" für einen Plan (RecomputePlanDialog) und für
   verknüpfte Pläne (GroupSportEditor). Der Text gehört dem Feld, damit sich
   „8" löschen und „12" tippen lässt; nach außen geht nur eine gültige Zahl.
   ============================================================ */

import { useState } from "react";
import { FIELD_STYLE, LABEL_STYLE } from "./new-plan-dialog-styles";

interface WeeklyHoursFieldProps {
  hours: number;
  disabled?: boolean;
  onHours: (hours: number) => void;
}

export function WeeklyHoursField({ hours, disabled = false, onHours }: WeeklyHoursFieldProps) {
  // `null` = das Feld zeigt den Wert aus den Props; sonst steht darin, was gerade getippt wird.
  const [text, setText] = useState<string | null>(null);

  return (
    <label style={LABEL_STYLE}>
      Stunden pro Woche
      <input
        type="number"
        inputMode="decimal"
        min={0.5}
        step={0.5}
        disabled={disabled}
        style={{ ...FIELD_STYLE, maxWidth: 140 }}
        value={text ?? String(hours)}
        onChange={(e) => {
          setText(e.target.value);
          const h = Number(e.target.value);
          if (e.target.value !== "" && h > 0) onHours(h);
        }}
        onBlur={() => setText(null)}
      />
    </label>
  );
}
