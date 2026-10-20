/* ============================================================
   FEATURES/NUTRITION/MEALTILE.TSX — Bildkachel einer Mahlzeit
   (Fahrplan 25, R1; Entscheidungen 1, 3, 5)

   Gefüllt: Bild (RecipeImage, fester Rahmen) mit Titel + Meta
   DARUNTER — nicht über dem Bild, weil das KI-Label dort unten links
   sitzt. Antippen öffnet die Details; alle weiteren Aktionen liegen im
   "⋯"-Menü. Leer: gestrichelte Kachel "+ Mittagessen", Antippen öffnet
   die Auswahl.

   Farbe = Bedeutung: Mahlzeiten haben keine eigene Farbe; unterschieden
   werden sie durch Reihenfolge und Beschriftung.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { RecipeImage } from "../../components/RecipeImage";
import type { MealSlot } from "../../api/types";
import { SLOT_LABELS, type SlotView } from "./nutrition-week-model";
import { SlotMenu } from "./SlotMenu";
import { buildSlotMenuItems } from "./slot-menu-items";
import { META_STYLE, TAP_MIN } from "./nutrition-styles";

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

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
  display: "block",
  margin: 0,
  color: "var(--ink)",
  fontWeight: 600,
  fontSize: ".92rem",
  lineHeight: 1.3,
};
const META_LINE_STYLE: CSSProperties = { ...META_STYLE, display: "block", margin: "4px 0 0" };
const EMPTY_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  width: "100%",
  height: "100%",
  minHeight: 150,
  padding: 12,
  borderRadius: "var(--radius-lg)",
  border: "1px dashed rgba(255, 255, 255, 0.28)",
  background: "var(--surface-tile)",
  color: "var(--ink)",
  fontFamily: "var(--font-disp)",
  fontWeight: 600,
  fontSize: ".95rem",
  cursor: "pointer",
};

export interface MealTileProps {
  slot: MealSlot;
  view: SlotView;
  /** z. B. "nur 2 Vorschläge" */
  note: string | null;
  /** Ein Schreibvorgang für diesen Tag läuft */
  busy: boolean;
  proteinMin: number;
  onDetails: () => void;
  onSwap: () => void;
  onCook: () => void;
  onRemove: () => void;
}

export function MealTile({ slot, view, note, busy, proteinMin, onDetails, onSwap, onCook, onRemove }: MealTileProps) {
  const { entry, recipe } = view;
  const label = SLOT_LABELS[slot];
  // Menü liegt über den Nachbarkacheln, solange es offen ist
  const [menuOpen, setMenuOpen] = useState(false);

  if (!entry) {
    return (
      <button
        type="button"
        style={busy ? { ...EMPTY_STYLE, opacity: 0.5, cursor: "not-allowed" } : EMPTY_STYLE}
        disabled={busy}
        aria-label={`${label}: Rezept wählen`}
        onClick={onSwap}
      >
        <span aria-hidden="true">+ {label}</span>
        {note && <span style={{ ...META_STYLE, margin: 0, textAlign: "center" }}>{note}</span>}
      </button>
    );
  }

  const items = buildSlotMenuItems({ busy, hasRecipe: !!recipe, onSwap, onDetails, onCook, onRemove });

  return (
    <div style={{ ...TILE_STYLE, zIndex: menuOpen ? 10 : undefined }}>
      {recipe ? (
        <button type="button" style={OPEN_BUTTON_STYLE} aria-haspopup="dialog" onClick={onDetails}>
          <RecipeImage recipe={recipe} ratio="4 / 3" alt="" compact style={IMAGE_FRAME} />
          <span style={CAPTION_STYLE}>
            <span style={EYEBROW_STYLE}>{label}</span>
            <span style={TITLE_STYLE}>{recipe.title}</span>
            <span style={META_LINE_STYLE}>
              {fmtNum(entry.servings)} Portion{entry.servings === 1 ? "" : "en"}{entry.extraServings > 0 && ` + ${fmtNum(entry.extraServings)} Gäste`} · {Math.round(view.kcal ?? 0)} kcal ·{" "}
              {Math.round(view.protein ?? 0)} g Eiweiß
            </span>
            {view.proteinLow && (
              <span style={META_LINE_STYLE}>
                Eiweiß unter dem bevorzugten Bereich (ab {fmtNum(proteinMin)} g je Hauptmahlzeit)
              </span>
            )}
          </span>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <RecipeImage recipe={null} ratio="4 / 3" alt="" compact style={IMAGE_FRAME} />
          <span style={CAPTION_STYLE}>
            <span style={EYEBROW_STYLE}>{label}</span>
            <span style={{ ...TITLE_STYLE, fontWeight: 400, color: "var(--ink-2)" }}>
              Dieses Rezept ist nicht mehr verfügbar
            </span>
          </span>
        </div>
      )}
      <div style={{ position: "absolute", top: 6, right: 6, minWidth: TAP_MIN }}>
        <SlotMenu label={`${label}: Aktionen`} items={items} onOpenChange={setMenuOpen} />
      </div>
    </div>
  );
}
