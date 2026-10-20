import { describe, expect, it } from "vitest";
import {
  COOK_PORTION_MAX,
  COOK_PORTION_MIN,
  clampCookPortions,
  findPlanEntryForRecipe,
  splitPortions,
  stepCookPortions,
  totalPortions,
} from "./portions.js";

describe("clampCookPortions", () => {
  it("lässt gültige Halbschritte unverändert", () => {
    expect(clampCookPortions(1)).toBe(1);
    expect(clampCookPortions(6.5)).toBe(6.5);
  });
  it("klemmt auf 0,5 … 12", () => {
    expect(clampCookPortions(0)).toBe(COOK_PORTION_MIN);
    expect(clampCookPortions(-3)).toBe(COOK_PORTION_MIN);
    expect(clampCookPortions(40)).toBe(COOK_PORTION_MAX);
  });
  it("rundet auf halbe Portionen", () => {
    expect(clampCookPortions(2.3)).toBe(2.5);
    expect(clampCookPortions(2.2)).toBe(2);
  });
  it("fällt bei NaN und Nicht-Zahlen auf die Untergrenze", () => {
    expect(clampCookPortions(NaN)).toBe(COOK_PORTION_MIN);
    expect(clampCookPortions(Infinity)).toBe(COOK_PORTION_MIN);
    expect(clampCookPortions(/** @type {any} */ ("3"))).toBe(COOK_PORTION_MIN);
  });
});

describe("stepCookPortions", () => {
  it("geht in Halbschritten rauf und runter", () => {
    expect(stepCookPortions(2, 1)).toBe(2.5);
    expect(stepCookPortions(2, -1)).toBe(1.5);
  });
  it("bleibt an den Grenzen stehen", () => {
    expect(stepCookPortions(COOK_PORTION_MIN, -1)).toBe(COOK_PORTION_MIN);
    expect(stepCookPortions(COOK_PORTION_MAX, 1)).toBe(COOK_PORTION_MAX);
  });
});

describe("totalPortions", () => {
  it("addiert eigene und Gäste-Portionen", () => {
    expect(totalPortions({ servings: 1.5, extraServings: 4.5 })).toBe(6);
  });
  it("behandelt fehlende Gäste-Portionen als 0", () => {
    expect(totalPortions({ servings: 2 })).toBe(2);
  });
});

describe("splitPortions", () => {
  it("behält den eigenen Anteil, der Rest sind Gäste", () => {
    expect(splitPortions(6, 1.5)).toEqual({ servings: 1.5, extraServings: 4.5 });
  });
  it("ohne Gäste, wenn die Gesamtzahl nicht über dem eigenen Anteil liegt", () => {
    expect(splitPortions(1, 1.5)).toEqual({ servings: 1, extraServings: 0 });
    expect(splitPortions(1.5, 1.5)).toEqual({ servings: 1.5, extraServings: 0 });
  });
  it("nimmt für ein neues Rezept 1 eigene Portion als Standard", () => {
    expect(splitPortions(6)).toEqual({ servings: 1, extraServings: 5 });
    expect(splitPortions(0.5)).toEqual({ servings: 0.5, extraServings: 0 });
  });
  it("klemmt die Gesamtzahl auf 12", () => {
    expect(splitPortions(30, 2)).toEqual({ servings: 2, extraServings: 10 });
  });
});

describe("findPlanEntryForRecipe", () => {
  const e = (date, recipeId = "r1") => ({ date, recipeId });

  it("liefert den frühesten Eintrag ab heute, heute zuerst", () => {
    const entries = [e("2026-10-23"), e("2026-10-21"), e("2026-10-22")];
    expect(findPlanEntryForRecipe(entries, "r1", "2026-10-21")?.date).toBe("2026-10-21");
    expect(findPlanEntryForRecipe(entries, "r1", "2026-10-22")?.date).toBe("2026-10-22");
  });
  it("ignoriert vergangene Einträge und andere Rezepte", () => {
    const entries = [e("2026-10-19"), e("2026-10-22", "r2")];
    expect(findPlanEntryForRecipe(entries, "r1", "2026-10-21")).toBeNull();
  });
  it("liefert null bei leerem Plan", () => {
    expect(findPlanEntryForRecipe([], "r1", "2026-10-21")).toBeNull();
  });
});
