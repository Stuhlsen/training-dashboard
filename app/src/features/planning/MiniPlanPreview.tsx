/* ============================================================
   FEATURES/PLANNING/MINIPLANPREVIEW.TSX — kompakte Wochen-Balkenreihe für die
   Live-Vorschau im „Neuer Plan"-Dialog (Fahrplan 20 E3, Vertrag V3). Reine
   Darstellung, keine Logik — ein Segment je `plan.weeks`-Eintrag, Farbe über
   `phaseColor()`. Kein Aufklappen, keine Zahlen im Ruhezustand — nur ein
   HTML-`title`-Tooltip mit Phase + TSS beim Hover.
   ============================================================ */

import { phaseColor } from "../../config";
import type { GeneratedPlan } from "./new-plan-dialog-view-model";

export interface MiniPlanPreviewProps {
  plan: GeneratedPlan;
}

export function MiniPlanPreview({ plan }: MiniPlanPreviewProps) {
  return (
    <div style={{ display: "flex", width: "100%", height: 10, borderRadius: "var(--pill)", overflow: "hidden" }}>
      {plan.weeks.map((week) => (
        <div
          key={week.index}
          title={`${week.phase} · ${week.targetTss} TSS`}
          style={{ flex: 1, background: phaseColor(week.phase) }}
        />
      ))}
    </div>
  );
}
