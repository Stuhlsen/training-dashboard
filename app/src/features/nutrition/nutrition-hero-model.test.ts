/* Tests: nutrition-hero-model — Kachel-Daten (Ziel, Plan + Ampel, gegessen). */

import { describe, expect, it } from "vitest";
import type { MealPlanEntry, Recipe } from "../../api/types";
import type { NutritionDay } from "./nutrition-day-model";
import { buildHeroNutrition } from "./nutrition-hero-model";

const TODAY = "2026-10-14";

const OK_DAY = {
  ok: true,
  dateISO: TODAY,
  target: 2300,
  floor: 1700,
  capped: false,
  bmr: 1800,
  formula: "ten-haaf-2014",
  hints: [],
  bodyFatDate: null,
  sexAssumed: false,
  trainingKcal: 0,
  trainingUnknown: false,
  weightKg: 80,
  weightSource: "profile",
  sourceKeys: ["ten-haaf-2014"],
} as NutritionDay;

function recipe(id: string, kcal: number): Recipe {
  return { id, mealType: ["lunch"], nutrition: { kcal, protein: 30, carbs: 10, fat: 5 } } as unknown as Recipe;
}

function entry(slot: MealPlanEntry["mealSlot"], recipeId: string, date = TODAY): MealPlanEntry {
  return { id: `${date}-${slot}`, athleteId: "u1", date, mealSlot: slot, recipeId, servings: 1, extraServings: 0, createdAt: "", updatedAt: "" };
}

const RECIPES = new Map<string, Recipe>([["l", recipe("l", 2300)]]);
const base = { day: OK_DAY, todayISO: TODAY, recipesById: RECIPES, entries: [] as MealPlanEntry[], wellness: [] };

describe("buildHeroNutrition", () => {
  it("fehlende Profilangaben → Hinweis mit den fehlenden Feldern", () => {
    const view = buildHeroNutrition({ ...base, day: { ok: false, missing: ["Gewicht"], hint: null } });
    expect(view).toEqual({ kind: "missing", missing: ["Gewicht"] });
  });

  it("nichts geplant → nur Ziel, keine Plan-Zeile und keine Ampel", () => {
    const view = buildHeroNutrition(base);
    expect(view).toMatchObject({ kind: "target", target: 2300, planned: null, consumed: null });
  });

  it("heutiger Plan → Summe und Ampel; Einträge anderer Tage zählen nicht", () => {
    const view = buildHeroNutrition({
      ...base,
      entries: [entry("lunch", "l"), entry("dinner", "l", "2026-10-15")],
    });
    expect(view).toMatchObject({ kind: "target", planned: { kcal: 2300, ampel: "green" } });
  });

  it("gegessen nur mit getrackter Zufuhr > 0", () => {
    const tracked = buildHeroNutrition({ ...base, wellness: [{ dateISO: TODAY, kcalConsumed: 1840.4 }] });
    expect(tracked).toMatchObject({ consumed: 1840 });
    const zero = buildHeroNutrition({ ...base, wellness: [{ dateISO: TODAY, kcalConsumed: 0 }] });
    expect(zero).toMatchObject({ consumed: null });
    const other = buildHeroNutrition({ ...base, wellness: [{ dateISO: "2026-10-13", kcalConsumed: 2000 }] });
    expect(other).toMatchObject({ consumed: null });
  });
});
