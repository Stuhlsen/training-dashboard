/* ============================================================
   FEATURES/NUTRITION/DAYCARD.TSX — Tageskarte der aufgeklappten Woche
   (Fahrplan 23, E6 PR B; Fahrplan 25 R1)

   "Woche aufklappen" zeigt alle Tage untereinander. Jede Karte nutzt
   dieselbe Rechnung (useDayPlan), dasselbe Menü (SlotMenu), dieselben
   Alternativen (SwapList), dasselbe Detailblatt und denselben
   Kochmodus wie die Tagesbühne — und schreibt über dieselben
   Rückruf-Funktionen der WeekView.

   Eine Primäraktion mit --accent gibt es hier nicht: sie gehört der
   Bühne ("Tag zusammenstellen"), sieben Akzentknöpfe untereinander
   wären Lärm. Ampel (L3): --ok / --warn / --danger, nie nur Farbe.
   ============================================================ */

import { useState, type CSSProperties } from "react";
import { GlassCard } from "../../components/GlassCard";
import { RecipeImage } from "../../components/RecipeImage";
import { fmtDate } from "../../core/format.js";
import { SOURCE_BY_KEY } from "../../core/nutrition-sources.js";
import type { MealSlot, Recipe } from "../../api/types";
import { SLOT_LABELS, type SlotView } from "./nutrition-week-model";
import { poolNote, useDayPlan } from "./useDayPlan";
import type { DayStageProps } from "./DayStage";
import { AmpelBadge } from "./AmpelBadge";
import { SlotMenu } from "./SlotMenu";
import { buildSlotMenuItems } from "./slot-menu-items";
import { SwapList } from "./SwapList";
import { RecipeDetailsDialog } from "./RecipeDetails";
import { CookingDialog } from "./CookingDialog";
import { SourceList } from "./SourceList";
import { InfoIcon } from "../../components/InfoIcon";
import {
  HEADING_STYLE,
  META_STYLE,
  TAP_BUTTON_DISABLED_STYLE,
  TAP_BUTTON_STYLE,
  TAP_MIN,
  TEXT_STYLE,
} from "./nutrition-styles";

// Hero-Kachel (features/hero/NutritionCard.tsx) importiert AmpelBadge von hier — Pfad bleibt gültig
export { AmpelBadge };

export type DayCardProps = DayStageProps;

/** 1.5 → "1,5" */
const fmtNum = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

const ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 0",
  borderTop: "1px solid var(--hair)",
};
const ROW_BUTTON_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flex: 1,
  minWidth: 0,
  minHeight: TAP_MIN,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const THUMB_STYLE: CSSProperties = { width: 56, flex: "none", borderRadius: 8, overflow: "hidden" };

function MealRow({
  view,
  note,
  busy,
  proteinMin,
  onDetails,
  onSwap,
  onCook,
  onRemove,
}: {
  view: SlotView;
  note: string | null;
  busy: boolean;
  proteinMin: number;
  onDetails: () => void;
  onSwap: () => void;
  onCook: () => void;
  onRemove: () => void;
}) {
  const { slot, entry, recipe } = view;
  const label = SLOT_LABELS[slot];

  if (!entry) {
    return (
      <li style={ROW_STYLE}>
        <button
          type="button"
          style={busy ? { ...ROW_BUTTON_STYLE, opacity: 0.5, cursor: "not-allowed" } : ROW_BUTTON_STYLE}
          disabled={busy}
          aria-label={`${label}: Rezept wählen`}
          onClick={onSwap}
        >
          <span style={THUMB_STYLE}>
            <RecipeImage recipe={null} ratio="1 / 1" alt="" compact />
          </span>
          <span style={{ minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: "block", color: "var(--ink)", fontWeight: 600 }}>
              + {label}
            </span>
            {note && <span style={{ ...META_STYLE, display: "block", margin: "2px 0 0" }}>{note}</span>}
          </span>
        </button>
      </li>
    );
  }

  const menu = (
    <SlotMenu
      label={`${label}: Aktionen`}
      items={buildSlotMenuItems({ busy, hasRecipe: !!recipe, onSwap, onDetails, onCook, onRemove })}
    />
  );

  if (!recipe) {
    return (
      <li style={ROW_STYLE}>
        <span style={THUMB_STYLE}>
          <RecipeImage recipe={null} ratio="1 / 1" alt="" compact />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ ...META_STYLE, display: "block", margin: 0 }}>{label}</span>
          <span style={{ ...TEXT_STYLE, display: "block", margin: 0 }}>Dieses Rezept ist nicht mehr verfügbar</span>
        </span>
        {menu}
      </li>
    );
  }

  return (
    <li style={ROW_STYLE}>
      <button type="button" style={ROW_BUTTON_STYLE} aria-haspopup="dialog" onClick={onDetails}>
        <span style={THUMB_STYLE}>
          <RecipeImage recipe={recipe} ratio="1 / 1" alt="" compact />
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ ...META_STYLE, display: "block", margin: 0 }}>{label}</span>
          <span style={{ display: "block", color: "var(--ink)", fontWeight: 600 }}>{recipe.title}</span>
          <span style={{ ...META_STYLE, display: "block", margin: "2px 0 0" }}>
            {fmtNum(entry.servings)} Portion{entry.servings === 1 ? "" : "en"} · {Math.round(view.kcal ?? 0)} kcal ·{" "}
            {Math.round(view.protein ?? 0)} g Eiweiß
          </span>
          {view.proteinLow && (
            <span style={{ ...META_STYLE, display: "block", margin: "4px 0 0" }}>
              Eiweiß unter dem bevorzugten Bereich (ab {fmtNum(proteinMin)} g je Hauptmahlzeit)
            </span>
          )}
        </span>
      </button>
      {menu}
    </li>
  );
}

export function DayCard(props: DayCardProps) {
  const { dateISO, isToday, day, entries, recipes, recipesById, intolerances, busy, error } = props;
  const [openSlot, setOpenSlot] = useState<MealSlot | null>(null);
  const [detailsSlot, setDetailsSlot] = useState<MealSlot | null>(null);
  const [cooking, setCooking] = useState<{ recipe: Recipe; servings: number } | null>(null);

  const { summary, suggestion, swaps, nothingFits } = useDayPlan({
    dateISO,
    day,
    entries,
    recipes,
    recipesById,
    intolerances,
    openSlot,
  });

  const hasIntolerances = intolerances.length > 0;
  const showRedS = summary.ampel === "red" || day.capped;
  const sources = day.sourceKeys.map((k) => SOURCE_BY_KEY.get(k)).filter((s): s is NonNullable<typeof s> => !!s);
  const detailsView = detailsSlot ? summary.slots.find((s) => s.slot === detailsSlot) : undefined;

  return (
    <>
      <GlassCard style={{ padding: "20px 24px", marginBottom: 16 }}>
        <section aria-label={`Tag ${fmtDate(dateISO)}`}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 12 }}>
            <h3 style={{ ...HEADING_STYLE, margin: 0 }}>
              {fmtDate(dateISO)}
              {isToday ? " · Heute" : ""}
            </h3>
            <span style={META_STYLE}>Ziel {day.target} kcal</span>
            {summary.filled > 0 && (
              <span style={META_STYLE}>
                {summary.totalKcal} von {day.target} kcal geplant
              </span>
            )}
            {summary.ampel && <AmpelBadge ampel={summary.ampel} />}
          </div>

          {day.trainingKcal > 0 && <p style={{ ...META_STYLE, margin: "6px 0 0" }}>Training: +{day.trainingKcal} kcal</p>}
          {day.trainingUnknown && (
            <p style={{ ...TEXT_STYLE, margin: "6px 0 0" }}>Einheit geplant, Energie nicht berechenbar</p>
          )}
          {showRedS && (
            <div style={{ marginTop: 6 }}>
              <p style={{ ...TEXT_STYLE, margin: 0 }}>
                {summary.ampel === "red"
                  ? `Die Summe liegt unter der Mindestzufuhr von ${day.floor} kcal.`
                  : `Das Ziel wurde auf die Mindestzufuhr (${day.floor} kcal) angehoben.`}
              </p>
              <details>
                <summary style={{ cursor: "pointer", color: "var(--ink-3)", fontSize: ".8rem" }}><InfoIcon style={{ marginRight: "0.35em" }} />Quelle</summary>
                <SourceList sources={sources} />
              </details>
            </div>
          )}
          {nothingFits && (
            <p style={{ ...TEXT_STYLE, margin: "8px 0 0" }}>
              {hasIntolerances ? "Kein Rezept passt zu deinen Unverträglichkeiten" : "Kein Rezept verfügbar"}
            </p>
          )}

          <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
            {summary.slots.map((view) => (
              <MealRow
                key={view.slot}
                view={view}
                note={nothingFits ? null : poolNote(suggestion.flags.poolSize[view.slot], hasIntolerances)}
                busy={busy}
                proteinMin={summary.proteinMin}
                onDetails={() => setDetailsSlot(view.slot)}
                onSwap={() => setOpenSlot(openSlot === view.slot ? null : view.slot)}
                onCook={() => view.recipe && view.entry && setCooking({ recipe: view.recipe, servings: view.entry.servings })}
                onRemove={() => view.entry && props.onRemove(dateISO, view.entry.id)}
              />
            ))}
          </ul>

          {openSlot && (
            <section aria-label={`Alternativen: ${SLOT_LABELS[openSlot]}`} style={{ marginTop: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <h4 style={{ ...HEADING_STYLE, margin: 0, fontSize: ".95rem" }}>{SLOT_LABELS[openSlot]} wählen</h4>
                <button type="button" style={TAP_BUTTON_STYLE} onClick={() => setOpenSlot(null)}>
                  Schließen
                </button>
              </div>
              <SwapList
                slot={openSlot}
                swaps={swaps}
                recipesById={recipesById}
                busy={busy}
                onChoose={(alt) => {
                  const slot = openSlot;
                  setOpenSlot(null);
                  props.onChoose(dateISO, slot, { recipeId: alt.recipeId, servings: alt.servings });
                }}
              />
            </section>
          )}

          {error && (
            <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: "8px 0 0" }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              style={busy || nothingFits ? TAP_BUTTON_DISABLED_STYLE : TAP_BUTTON_STYLE}
              disabled={busy || nothingFits}
              onClick={() => props.onCompose(dateISO, suggestion.slots)}
            >
              Tag zusammenstellen
            </button>
          </div>
        </section>
      </GlassCard>

      {detailsView?.recipe && detailsView.entry && (
        <RecipeDetailsDialog
          recipe={detailsView.recipe}
          servings={detailsView.entry.servings}
          onClose={() => setDetailsSlot(null)}
          onCook={() => {
            setCooking({ recipe: detailsView.recipe!, servings: detailsView.entry!.servings });
            setDetailsSlot(null);
          }}
        />
      )}
      {cooking && (
        <CookingDialog recipe={cooking.recipe} servings={cooking.servings} onClose={() => setCooking(null)} />
      )}
    </>
  );
}
