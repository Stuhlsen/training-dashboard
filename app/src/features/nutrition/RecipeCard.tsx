/* ============================================================
   FEATURES/NUTRITION/RECIPECARD.TSX — Rezeptkachel der Rezeptliste
   (Fahrplan 25, R2; Entscheidungen 1, 4, 5, 7)

   Aufbau wie die Mahlzeit-Kachel: Bild im festen Rahmen (RecipeImage,
   Platzhalter springt nicht), Titel + Meta DARUNTER. Antippen öffnet die
   Details; Kochen und "In den Plan" liegen im "⋯"-Menü. Farbe = Bedeutung:
   keine Mahlzeiten- oder Zonenfarben, Mahlzeiten stehen als Text.
   Lange Titel brechen nach zwei Zeilen um (voller Titel als Tooltip und
   im Detailblatt), die Kachel wird dadurch nicht breiter.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { RecipeImage } from "../../components/RecipeImage";
import type { Recipe } from "../../api/types";
import { SLOT_LABELS } from "./nutrition-week-model";
import { SlotMenu, type SlotMenuItem } from "./SlotMenu";
import { META_STYLE, TAP_MIN } from "./nutrition-styles";

const TILE_STYLE: CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  height: "100%",
  borderRadius: "var(--radius-lg)",
  border: "1px solid var(--hair)",
  background: "var(--surface-tile)",
  boxShadow: "var(--e2)",
};
const OPEN_BUTTON_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  width: "100%",
  padding: 0,
  border: "none",
  borderRadius: "inherit",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const IMAGE_FRAME: CSSProperties = { borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" };
const CAPTION_STYLE: CSSProperties = { display: "block", padding: "10px 12px 12px" };
const EYEBROW_STYLE: CSSProperties = { ...META_STYLE, display: "block", margin: "0 0 2px" };
const TITLE_STYLE: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  overflowWrap: "anywhere",
  margin: 0,
  color: "var(--ink)",
  fontWeight: 600,
  fontSize: ".92rem",
  lineHeight: 1.3,
};
const META_LINE_STYLE: CSSProperties = { ...META_STYLE, display: "block", margin: "4px 0 0" };

/** "Frühstück · Snack" — reiner Text, keine Farbe */
function mealTypesText(recipe: Pick<Recipe, "mealType">): string {
  return (recipe.mealType ?? []).map((m) => SLOT_LABELS[m] ?? m).join(" · ");
}

export function RecipeCard({
  recipe,
  onDetails,
  onCook,
  onAddToPlan,
}: {
  recipe: Recipe;
  onDetails: () => void;
  onCook: () => void;
  onAddToPlan: () => void;
}) {
  // Menü liegt über den Nachbarkacheln, solange es offen ist
  const [menuOpen, setMenuOpen] = useState(false);
  const n = recipe.nutrition;

  const items: SlotMenuItem[] = [
    { key: "details", label: "Details", onSelect: onDetails },
    { key: "cook", label: "Kochen", onSelect: onCook },
    // Ohne Nährwerte würde der Plan die Kachel als "nicht mehr verfügbar" zeigen
    { key: "plan", label: "In den Plan", onSelect: onAddToPlan, disabled: !n },
  ];

  return (
    <div style={{ ...TILE_STYLE, zIndex: menuOpen ? 10 : undefined }}>
      <button type="button" style={OPEN_BUTTON_STYLE} aria-haspopup="dialog" onClick={onDetails}>
        <RecipeImage recipe={recipe} ratio="4 / 3" alt="" compact style={IMAGE_FRAME} />
        <span style={CAPTION_STYLE}>
          <span style={EYEBROW_STYLE}>{mealTypesText(recipe) || "Rezept"}</span>
          <span style={TITLE_STYLE} title={recipe.title}>
            {recipe.title}
          </span>
          <span style={META_LINE_STYLE}>
            {n ? `${Math.round(n.kcal)} kcal · ${Math.round(n.protein)} g Eiweiß pro Portion` : "Keine Nährwerte"}
          </span>
        </span>
      </button>
      <div style={{ position: "absolute", top: 6, right: 6, minWidth: TAP_MIN }}>
        <SlotMenu label={`${recipe.title}: Aktionen`} items={items} onOpenChange={setMenuOpen} />
      </div>
    </div>
  );
}
