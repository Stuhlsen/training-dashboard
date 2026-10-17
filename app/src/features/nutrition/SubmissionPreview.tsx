/* ============================================================
   FEATURES/NUTRITION/SUBMISSIONPREVIEW.TSX — Vorschau vor dem Absenden
   (Fahrplan 25, S2a) — zeigt, was der SERVER aus den Zutaten abgeleitet hat:
   Nährwerte pro Portion, Allergene, Ernährungsformen. Die App rechnet nichts.
   ============================================================ */

import type { RecipePreview } from "../../api/recipe-submission";
import { DIET_FILTER_OPTIONS } from "../../core/recipe-browse.js";
import { AllergenLine } from "./AllergenLine";
import { META_STYLE, TEXT_STYLE } from "./nutrition-styles";

const DIET_LABELS = new Map<string, string>(
  (DIET_FILTER_OPTIONS as { value: string; label: string }[]).map((o) => [o.value, o.label]),
);

export function SubmissionPreview({ preview, stale }: { preview: RecipePreview; stale: boolean }) {
  const n = preview.nutrition;
  const diets = preview.diet_tags.map((t) => DIET_LABELS.get(t) ?? t);

  return (
    <section
      aria-label="Vorschau der berechneten Werte"
      style={{ border: "1px solid var(--hair)", borderRadius: "var(--radius)", padding: "14px 16px", background: "var(--surface-tile)" }}
    >
      <p style={META_STYLE}>Nährwerte pro Portion (vom System berechnet)</p>
      <p style={{ ...TEXT_STYLE, color: "var(--ink)" }}>
        {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g Eiweiß · {Math.round(n.carbs)} g Kohlenhydrate · {Math.round(n.fat)} g Fett
      </p>
      <AllergenLine tags={preview.contains_tags} />
      <p style={TEXT_STYLE}>{diets.length > 0 ? `Ernährungsform: ${diets.join(", ")}` : "Keine Ernährungsform zugeordnet"}</p>
      {stale && (
        <p role="status" style={TEXT_STYLE}>
          Du hast das Rezept seit dieser Vorschau geändert. Berechne die Vorschau neu, bevor du dich auf diese Werte verlässt.
        </p>
      )}
    </section>
  );
}
