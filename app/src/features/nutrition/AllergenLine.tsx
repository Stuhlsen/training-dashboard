/* ============================================================
   FEATURES/NUTRITION/ALLERGENLINE.TSX — Allergen-Zeile (Fahrplan 23, E10)

   Eine Zeile "Enthält: Gluten, Milch/Laktose" aus recipe.containsTags
   (aus den Zutaten abgeleitet, E26) mit den deutschen Namen der
   Taxonomie (core/nutrition-taxonomy.js). Ohne Tags steht
   "Keine Allergene hinterlegt" — nie einfach nichts. Direkt darunter
   der Orientierungs-Hinweis. Nur in Details und Kochmodus, nie in
   den Listenzeilen.
   ============================================================ */

import type { CSSProperties } from "react";
import { ALLERGEN_NOTE, allergenText } from "./allergen-text";

export function AllergenLine({
  tags,
  lineStyle,
  noteStyle,
}: {
  tags: readonly string[] | null | undefined;
  lineStyle?: CSSProperties;
  noteStyle?: CSSProperties;
}) {
  return (
    <div data-testid="allergen-line">
      <p style={lineStyle}>{allergenText(tags)}</p>
      <p style={noteStyle}>{ALLERGEN_NOTE}</p>
    </div>
  );
}
