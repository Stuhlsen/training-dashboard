import { describe, expect, it } from "vitest";
import {
  RATING_EMPTY_TEXT,
  canRateRecipe,
  formatRating,
  isValidStars,
  withRatingStats,
} from "./recipe-rating.js";

describe("formatRating", () => {
  it("zeigt Schnitt mit Komma und Anzahl", () => {
    expect(formatRating(4.3, 7)).toBe("4,3 ★ (7)");
    expect(formatRating(5, 1)).toBe("5,0 ★ (1)");
  });

  it("rundet auf eine Nachkommastelle", () => {
    expect(formatRating(4.26, 12)).toBe("4,3 ★ (12)");
    expect(formatRating(4.24, 12)).toBe("4,2 ★ (12)");
    expect(formatRating(3.5, 2)).toBe("3,5 ★ (2)");
  });

  it("zeigt ohne Bewertung den Leer-Text, nie eine Null", () => {
    expect(formatRating(null, 0)).toBe(RATING_EMPTY_TEXT);
    expect(formatRating(undefined, undefined)).toBe(RATING_EMPTY_TEXT);
    expect(formatRating(0, 0)).toBe("noch nicht bewertet");
    expect(formatRating(4, 0)).toBe("noch nicht bewertet");
    expect(formatRating(Number.NaN, 3)).toBe("noch nicht bewertet");
  });
});

describe("isValidStars", () => {
  it("lässt nur ganze Zahlen von 1 bis 5 zu", () => {
    for (const ok of [1, 2, 3, 4, 5]) expect(isValidStars(ok)).toBe(true);
    for (const bad of [0, 6, -1, 2.5, "3", null, undefined, Number.NaN]) expect(isValidStars(bad)).toBe(false);
  });
});

describe("canRateRecipe", () => {
  const approved = { status: "approved", submittedBy: "u-other" };

  it("erlaubt ein freigegebenes, fremdes Rezept", () => {
    expect(canRateRecipe(approved, "u-me")).toBe(true);
  });

  it("erlaubt Seed-Rezepte ohne Einreicher", () => {
    expect(canRateRecipe({ status: "approved", submittedBy: null }, "u-me")).toBe(true);
  });

  it("sperrt das eigene Rezept", () => {
    expect(canRateRecipe({ status: "approved", submittedBy: "u-me" }, "u-me")).toBe(false);
  });

  it("sperrt Rezepte, die nicht freigegeben sind", () => {
    expect(canRateRecipe({ status: "pending", submittedBy: "u-other" }, "u-me")).toBe(false);
    expect(canRateRecipe({ status: "rejected", submittedBy: null }, "u-me")).toBe(false);
    expect(canRateRecipe({ submittedBy: null }, "u-me")).toBe(false);
  });

  it("sperrt ohne Anmeldung oder ohne Rezept", () => {
    expect(canRateRecipe(approved, null)).toBe(false);
    expect(canRateRecipe(approved, "")).toBe(false);
    expect(canRateRecipe(null, "u-me")).toBe(false);
  });
});

describe("withRatingStats", () => {
  const recipes = [{ id: "a", title: "A" }, { id: "b", title: "B" }];

  it("hängt Schnitt und Anzahl an, ohne die Eingabe zu verändern", () => {
    const merged = withRatingStats(recipes, [{ recipeId: "a", avg: 4.5, count: 2 }]);
    expect(merged).toEqual([
      { id: "a", title: "A", ratingAvg: 4.5, ratingCount: 2 },
      { id: "b", title: "B", ratingAvg: null, ratingCount: 0 },
    ]);
    expect(recipes[0]).toEqual({ id: "a", title: "A" });
  });

  it("behandelt eine Anzahl von 0 als unbewertet", () => {
    expect(withRatingStats(recipes, [{ recipeId: "a", avg: 3, count: 0 }])[0]).toMatchObject({
      ratingAvg: null,
      ratingCount: 0,
    });
  });

  it("verträgt fehlende Listen", () => {
    expect(withRatingStats(recipes, undefined)).toHaveLength(2);
    expect(withRatingStats(undefined, [])).toEqual([]);
  });
});
