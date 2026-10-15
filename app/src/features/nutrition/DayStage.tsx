/* ============================================================
   FEATURES/NUTRITION/DAYSTAGE.TSX — Tagesbühne (Richtung B)
   (Fahrplan 25, R1)

   Der gewählte Tag ist der Hauptdarsteller: Tagesziel mit Fortschritt
   und Ampel, "Tag zusammenstellen" als einzige Primäraktion, darunter
   die vier Bildkacheln. Reine Darstellung + lokaler UI-Zustand
   (geöffnete Alternativen, Details, Kochmodus) — geschrieben wird über
   die Rückruf-Funktionen der WeekView, nie hier.
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { fmtDate } from "../../core/format.js";
import type { MealPlanEntry, MealSlot, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import { SLOT_LABELS } from "./nutrition-week-model";
import { poolNote, useDayPlan, type Choice } from "./useDayPlan";
import { DayTargetCard } from "./DayTargetCard";
import { MealTile } from "./MealTile";
import { SwapList } from "./SwapList";
import { RecipeDetailsDialog } from "./RecipeDetails";
import { CookingDialog } from "./CookingDialog";
import {
  HEADING_STYLE,
  PRIMARY_BUTTON_DISABLED_STYLE,
  PRIMARY_BUTTON_STYLE,
  TAP_BUTTON_STYLE,
  TEXT_STYLE,
} from "./nutrition-styles";
import "./nutrition.css";

export interface DayStageProps {
  dateISO: string;
  isToday: boolean;
  day: Extract<NutritionDay, { ok: true }>;
  entries: readonly MealPlanEntry[];
  recipes: Recipe[];
  recipesById: ReadonlyMap<string, Recipe>;
  intolerances: string[];
  /** Ein Schreibvorgang für diesen Tag läuft */
  busy: boolean;
  /** Sichtbare Fehlermeldung des letzten Schreibvorgangs, sonst null */
  error: string | null;
  onCompose: (dateISO: string, choices: Partial<Record<MealSlot, Choice | null>>) => void;
  onChoose: (dateISO: string, slot: MealSlot, choice: Choice) => void;
  onRemove: (dateISO: string, entryId: string) => void;
}

export function DayStage(props: DayStageProps) {
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

  const detailsView = detailsSlot ? summary.slots.find((s) => s.slot === detailsSlot) : undefined;
  const hasIntolerances = intolerances.length > 0;
  const noRecipeText = hasIntolerances ? "Kein Rezept passt zu deinen Unverträglichkeiten" : "Kein Rezept verfügbar";

  return (
    <section aria-label={`Tag ${fmtDate(dateISO)}`}>
      <DayTargetCard
        day={day}
        dateISO={dateISO}
        isToday={isToday}
        summary={{ totalKcal: summary.totalKcal, filled: summary.filled, ampel: summary.ampel }}
        notes={nothingFits ? <p style={TEXT_STYLE}>{noRecipeText}</p> : null}
        actions={
          <button
            type="button"
            style={busy || nothingFits ? PRIMARY_BUTTON_DISABLED_STYLE : PRIMARY_BUTTON_STYLE}
            disabled={busy || nothingFits}
            onClick={() => props.onCompose(dateISO, suggestion.slots)}
          >
            Tag zusammenstellen
          </button>
        }
      />

      <ul className="nut-tiles" aria-label="Mahlzeiten">
        {summary.slots.map((view) => (
          <li key={view.slot} style={{ minWidth: 0 }}>
            <MealTile
              slot={view.slot}
              view={view}
              note={nothingFits ? null : poolNote(suggestion.flags.poolSize[view.slot], hasIntolerances)}
              busy={busy}
              proteinMin={summary.proteinMin}
              onDetails={() => setDetailsSlot(view.slot)}
              onSwap={() => setOpenSlot(openSlot === view.slot ? null : view.slot)}
              onCook={() => view.recipe && view.entry && setCooking({ recipe: view.recipe, servings: view.entry.servings })}
              onRemove={() => view.entry && props.onRemove(dateISO, view.entry.id)}
            />
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" style={{ ...TEXT_STYLE, color: "var(--danger)", margin: "0 0 12px" }}>
          {error}
        </p>
      )}

      {openSlot && (
        <GlassCard style={{ padding: "16px 20px", marginBottom: 16 }}>
          <section aria-label={`Alternativen: ${SLOT_LABELS[openSlot]}`}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h3 style={{ ...HEADING_STYLE, margin: 0 }}>{SLOT_LABELS[openSlot]} wählen</h3>
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
        </GlassCard>
      )}

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
    </section>
  );
}
