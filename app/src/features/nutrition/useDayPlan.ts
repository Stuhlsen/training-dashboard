/* ============================================================
   FEATURES/NUTRITION/USEDAYPLAN.TS — Rechnung eines Plan-Tages
   (Fahrplan 23 E31/E32; aus DayCard.tsx herausgelöst, Fahrplan 25 R1)

   Gemeinsam für die Tagesbühne und die aufgeklappte Wochenansicht:
   Summe + Ampel des Tages, Vorschlag für "Tag zusammenstellen",
   Alternativen für den geöffneten Slot. Reine Berechnung aus den
   gelieferten Daten, kein Schreiben.
   ============================================================ */

import { useMemo } from "react";
import { composeDay, swapCandidates } from "../../core/nutrition-plan.js";
import type { MealPlanEntry, MealSlot, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import { SLOT_ORDER, recentRecipeIds, summarizeDay } from "./nutrition-week-model";

export interface Choice {
  recipeId: string;
  servings: number;
}

export interface DayPlanInput {
  dateISO: string;
  day: Extract<NutritionDay, { ok: true }>;
  entries: readonly MealPlanEntry[];
  recipes: Recipe[];
  recipesById: ReadonlyMap<string, Recipe>;
  intolerances: string[];
  /** Slot, dessen Alternativen gerade offen sind */
  openSlot: MealSlot | null;
}

export function poolNote(count: number, hasIntolerances: boolean): string | null {
  if (count === 0) return hasIntolerances ? "Kein Rezept passt zu deinen Unverträglichkeiten" : "Kein Rezept verfügbar";
  if (count < 3) return `nur ${count} ${count === 1 ? "Vorschlag" : "Vorschläge"}`;
  return null;
}

export function useDayPlan({ dateISO, day, entries, recipes, recipesById, intolerances, openSlot }: DayPlanInput) {
  const summary = useMemo(
    () =>
      summarizeDay({
        dateISO,
        entries,
        recipesById,
        target: day.target,
        floor: day.floor,
        weightKg: day.weightKg,
      }),
    [dateISO, entries, recipesById, day.target, day.floor, day.weightKg],
  );

  const current = useMemo(() => {
    const out: Partial<Record<MealSlot, Choice>> = {};
    for (const s of summary.slots) {
      if (s.entry && s.recipe) out[s.slot] = { recipeId: s.entry.recipeId, servings: s.entry.servings };
    }
    return out;
  }, [summary]);

  const suggestion = useMemo(
    () =>
      composeDay({
        recipes,
        intolerances,
        target: day.target,
        floor: day.floor,
        weightKg: day.weightKg,
        dateISO,
        planned: recentRecipeIds(entries, dateISO),
      }),
    [recipes, intolerances, day.target, day.floor, day.weightKg, dateISO, entries],
  );

  const swaps = useMemo(
    () =>
      openSlot
        ? swapCandidates({
            recipes,
            intolerances,
            target: day.target,
            floor: day.floor,
            weightKg: day.weightKg,
            dateISO,
            planned: recentRecipeIds(entries, dateISO),
            slot: openSlot,
            current,
          })
        : [],
    [openSlot, recipes, intolerances, day.target, day.floor, day.weightKg, dateISO, entries, current],
  );

  const nothingFits = SLOT_ORDER.every((s) => suggestion.flags.poolSize[s] === 0);

  return { summary, suggestion, swaps, nothingFits };
}
