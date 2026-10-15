/* ============================================================
   FEATURES/NUTRITION/RECIPEDETAILS.TSX — Rezept-Details
   (Fahrplan 23 E7b/E10; Fahrplan 25 R1)

   DetailsContent  Zutaten (auf die geplanten Portionen skaliert),
                   Nährwerte, Allergen-Zeile. Aus DayCard.tsx
                   herausgelöst; Texte bleiben wörtlich gleich.
   RecipeDetailsDialog
                   Detailblatt über der Seite: großes Bild, gegliederte
                   Details, "Kochen" als Primäraktion. Escape schließt,
                   Fokus bleibt im Blatt und kehrt danach zurück.
   ============================================================ */

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { RecipeImage } from "../../components/RecipeImage";
import { roundAmount, formatShoppingAmount } from "../../core/shopping-list.js";
import type { Recipe } from "../../api/types";
import { AllergenLine } from "./AllergenLine";
import { META_STYLE, PRIMARY_BUTTON_STYLE, TAP_BUTTON_STYLE } from "./nutrition-styles";

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

const DETAILS_STYLE: CSSProperties = { paddingTop: 4 };
const SECTION_LABEL_STYLE: CSSProperties = {
  margin: "14px 0 6px",
  fontFamily: "var(--font-mono)",
  fontSize: ".75rem",
  fontWeight: 600,
  color: "var(--ink-2)",
};
const LIST_STYLE: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };
const INGREDIENT_STYLE: CSSProperties = {
  margin: 0,
  padding: "5px 0",
  borderTop: "1px solid var(--hair)",
  fontSize: ".9rem",
  lineHeight: 1.4,
  color: "var(--ink)",
};
const NUTRITION_LINE_STYLE: CSSProperties = { margin: "0 0 4px", fontSize: ".9rem", lineHeight: 1.5, color: "var(--ink)" };
const HINT_STYLE: CSSProperties = { ...META_STYLE, fontStyle: "italic" };
const ALLERGEN_LINE_STYLE: CSSProperties = { ...SECTION_LABEL_STYLE, margin: "14px 0 2px" };

/** Skaliert einen Zutatenwert auf die geplanten Portionen.
 *  Faktor = entryServings / recipeServings. */
function scaledIngredient(amount: number, unit: string, entryServings: number, recipeServings: number): string {
  // Fehlende/ungültige Rezept-Portionen: Menge unskaliert zeigen statt NaN
  const factor = recipeServings > 0 ? entryServings / recipeServings : 1;
  const rounded = roundAmount(amount * factor, unit);
  return `${formatShoppingAmount(rounded)} ${unit}`;
}

export function DetailsContent({ recipe, servings }: { recipe: Recipe; servings: number }) {
  if (!recipe.nutrition && !recipe.ingredients) {
    return (
      <div style={DETAILS_STYLE}>
        <p style={HINT_STYLE}>Keine Nährwertangaben und keine Zutaten hinterlegt</p>
        <AllergenLine tags={recipe.containsTags} lineStyle={ALLERGEN_LINE_STYLE} noteStyle={HINT_STYLE} />
      </div>
    );
  }

  const n = recipe.nutrition;
  const scale = recipe.servings > 0 ? servings / recipe.servings : 1;

  return (
    <div style={DETAILS_STYLE}>
      {recipe.ingredients && recipe.ingredients.length > 0 ? (
        <div>
          <p style={SECTION_LABEL_STYLE}>Zutaten</p>
          <ul style={LIST_STYLE}>
            {recipe.ingredients.map((ing, i) => (
              <li key={i} style={INGREDIENT_STYLE}>
                {scaledIngredient(ing.amount, ing.unit, servings, recipe.servings)} {ing.name}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p style={HINT_STYLE}>Keine Zutaten hinterlegt</p>
      )}

      {n && (
        <div>
          <p style={SECTION_LABEL_STYLE}>Nährwerte pro Portion</p>
          <p style={NUTRITION_LINE_STYLE}>
            {Math.round(n.kcal)} kcal · {Math.round(n.protein)} g Eiweiß · {Math.round(n.carbs)} g Kohlenhydrate ·{" "}
            {Math.round(n.fat)} g Fett
          </p>
          {servings !== recipe.servings && (
            <p style={{ ...NUTRITION_LINE_STYLE, color: "var(--ink-2)" }}>
              Geplant: {fmtNum(servings)} Portion{servings === 1 ? "" : "en"} = {Math.round(n.kcal * scale)} kcal ·{" "}
              {Math.round(n.protein * scale)} g Eiweiß
            </p>
          )}
        </div>
      )}

      <AllergenLine tags={recipe.containsTags} lineStyle={ALLERGEN_LINE_STYLE} noteStyle={HINT_STYLE} />
    </div>
  );
}

/* ── Detailblatt ──────────────────────────────────────────── */

const BACKDROP_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  background: "rgba(8, 9, 12, 0.72)",
};
const PANEL_STYLE: CSSProperties = {
  width: "min(560px, 100%)",
  maxHeight: "92vh",
  overflow: "auto",
  borderRadius: "var(--radius-lg)",
  background: "var(--surface-tile)",
  boxShadow: "var(--e3)",
  color: "var(--ink)",
};

const FOCUSABLE = 'button:not([disabled]), a[href], summary, [tabindex]:not([tabindex="-1"])';

export function RecipeDetailsDialog({
  recipe,
  servings,
  onClose,
  onCook,
}: {
  recipe: Recipe;
  servings: number;
  onClose: () => void;
  onCook: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Fokus ins Blatt holen und danach dorthin zurückgeben, wo er herkam
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      style={BACKDROP_STYLE}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`Details: ${recipe.title}`} style={PANEL_STYLE}>
        <RecipeImage recipe={recipe} ratio="16 / 9" alt={recipe.title} />
        <div style={{ padding: "16px 20px 20px" }}>
          <h2 style={{ margin: "0 0 4px", fontFamily: "var(--font-disp)", fontSize: "1.2rem", fontWeight: 600 }}>
            {recipe.title}
          </h2>
          <p style={{ ...META_STYLE, margin: 0 }}>
            {fmtNum(servings)} Portion{servings === 1 ? "" : "en"} geplant
          </p>
          <DetailsContent recipe={recipe} servings={servings} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
            <button type="button" style={PRIMARY_BUTTON_STYLE} onClick={onCook}>
              Kochen
            </button>
            <button ref={closeRef} type="button" style={TAP_BUTTON_STYLE} onClick={onClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
