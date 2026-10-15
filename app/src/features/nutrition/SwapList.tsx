/* ============================================================
   FEATURES/NUTRITION/SWAPLIST.TSX — Alternativen für einen Slot
   (Fahrplan 23 E32; aus DayCard.tsx herausgelöst, Fahrplan 25 R1)

   Je Alternative: Portionen, kcal, Eiweiß, die neue Tagessumme mit
   Ampel — der informativste Teil des Tabs (R0, Befund 2.8). Geschrieben
   wird hier nicht; "Übernehmen" ruft nur zurück.
   ============================================================ */

import type { CSSProperties } from "react";
import { RecipeImage } from "../../components/RecipeImage";
import type { swapCandidates } from "../../core/nutrition-plan.js";
import type { MealSlot, Recipe } from "../../api/types";
import { SLOT_LABELS, type Ampel } from "./nutrition-week-model";
import { AmpelBadge } from "./AmpelBadge";
import { META_STYLE, TAP_BUTTON_DISABLED_STYLE, TAP_BUTTON_STYLE, TEXT_STYLE } from "./nutrition-styles";

export type SwapCandidate = ReturnType<typeof swapCandidates>[number];

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
  padding: "10px 0",
  borderTop: "1px dashed var(--hair)",
};

export function SwapList({
  slot,
  swaps,
  recipesById,
  busy,
  onChoose,
}: {
  slot: MealSlot;
  swaps: readonly SwapCandidate[];
  recipesById: ReadonlyMap<string, Recipe>;
  busy: boolean;
  onChoose: (alt: SwapCandidate) => void;
}) {
  if (swaps.length === 0) return <p style={META_STYLE}>Keine Alternativen</p>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {swaps.map((alt) => {
        const r = recipesById.get(alt.recipeId);
        const protein = (r?.nutrition?.protein ?? 0) * alt.servings;
        const kcal = (r?.nutrition?.kcal ?? 0) * alt.servings;
        return (
          <li key={alt.recipeId} style={ROW_STYLE}>
            <div style={{ width: 56, flex: "none", borderRadius: 8, overflow: "hidden" }}>
              <RecipeImage recipe={r} ratio="1 / 1" alt="" compact />
            </div>
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <p style={{ ...TEXT_STYLE, margin: 0, color: "var(--ink)" }}>{r?.title ?? alt.recipeId}</p>
              <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                {fmtNum(alt.servings)} Portion{alt.servings === 1 ? "" : "en"} · {Math.round(kcal)} kcal ·{" "}
                {Math.round(protein)} g Eiweiß
              </p>
              <p style={{ ...META_STYLE, margin: "2px 0 0" }}>
                Tagessumme dann {alt.totals.kcal} kcal · <AmpelBadge ampel={alt.ampel as Ampel} />
              </p>
            </div>
            <button
              type="button"
              style={busy ? TAP_BUTTON_DISABLED_STYLE : TAP_BUTTON_STYLE}
              disabled={busy}
              aria-label={`${r?.title ?? "Rezept"} für ${SLOT_LABELS[slot]} wählen`}
              onClick={() => onChoose(alt)}
            >
              Übernehmen
            </button>
          </li>
        );
      })}
    </ul>
  );
}
