/* ============================================================
   FEATURES/NUTRITION/NUTRITION-HERO-MODEL.TS — Daten der Hero-Kachel
   (Fahrplan 23, E9)

   Reine Funktion: Tagesziel + heutiger Plan + (falls getrackt) die
   aufgenommenen kcal. Die Regeln für Summe und Ampel kommen
   unverändert aus `summarizeDay` (nutrition-week-model.ts) — hier wird
   nur zusammengesetzt, nichts neu gerechnet.
   ============================================================ */

import type { MealPlanEntry, Recipe } from "../../api/types";
import type { NutritionDay, NutritionWellnessDay } from "./nutrition-day-model";
import { summarizeDay, type Ampel } from "./nutrition-week-model";

export type HeroNutritionView =
  | {
      kind: "target";
      target: number;
      /** null, solange heute nichts geplant ist (dann auch keine Ampel) */
      planned: { kcal: number; ampel: Ampel } | null;
      /** aufgenommene kcal laut Sync; null, wenn nicht getrackt */
      consumed: number | null;
      sourceKeys: string[];
    }
  | { kind: "missing"; missing: string[] };

export function buildHeroNutrition(params: {
  day: NutritionDay;
  todayISO: string;
  entries: readonly MealPlanEntry[];
  recipesById: ReadonlyMap<string, Recipe>;
  wellness: readonly NutritionWellnessDay[];
}): HeroNutritionView {
  const { day, todayISO, entries, recipesById, wellness } = params;
  if (!day.ok) return { kind: "missing", missing: day.missing };

  const summary = summarizeDay({
    dateISO: todayISO,
    entries,
    recipesById,
    target: day.target,
    floor: day.floor,
    weightKg: day.weightKg,
  });

  const today = wellness.find((w) => (w.dateISO || w.date) === todayISO);
  const intake = today?.kcalConsumed;
  const consumed = typeof intake === "number" && Number.isFinite(intake) && intake > 0 ? Math.round(intake) : null;

  return {
    kind: "target",
    target: day.target,
    planned: summary.ampel ? { kcal: summary.totalKcal, ampel: summary.ampel } : null,
    consumed,
    sourceKeys: day.sourceKeys,
  };
}
