import { describe, expect, it } from "vitest";
import { browseRecipes, hasActiveFilters, normalizeSearch } from "./recipe-browse.js";

const r = (id, title, extra = {}) => ({
  id,
  title,
  status: "approved",
  mealType: ["lunch"],
  dietTags: ["veg"],
  containsTags: [],
  ...extra,
});

const POOL = [
  r("1", "Zitronen-Hähnchen", { dietTags: ["omnivor"], mealType: ["dinner"] }),
  r("2", "Haferbrei mit Beeren", { mealType: ["breakfast"], dietTags: ["veg", "vegan"], containsTags: ["gluten"] }),
  r("3", "Grüner Smoothie", { mealType: ["breakfast", "snack"], dietTags: ["vegan", "glutenfrei"] }),
  r("4", "Ohne Tags", { dietTags: null }),
];

describe("normalizeSearch", () => {
  it("ignoriert Groß-/Kleinschreibung, Akzente, ß und Leerraum", () => {
    expect(normalizeSearch("  GRÜNER   Smoothie ")).toBe("gruner smoothie");
    expect(normalizeSearch("Straße")).toBe("strasse");
    expect(normalizeSearch(null)).toBe("");
  });
});

describe("browseRecipes", () => {
  it("ohne Filter: alle genehmigten, nach Titel sortiert", () => {
    const { visible, available } = browseRecipes(POOL);
    expect(visible.map((x) => x.id)).toEqual(["3", "2", "4", "1"]);
    expect(available).toBe(4);
  });

  it("lässt nicht genehmigte Rezepte weg", () => {
    const { visible } = browseRecipes([...POOL, r("9", "Entwurf", { status: "pending" })]);
    expect(visible.some((x) => x.id === "9")).toBe(false);
  });

  it("Suche trifft Teilwörter in beliebiger Reihenfolge, ohne Umlaut-Zwang", () => {
    expect(browseRecipes(POOL, { filters: { query: "gruner" } }).visible.map((x) => x.id)).toEqual(["3"]);
    expect(browseRecipes(POOL, { filters: { query: "beeren hafer" } }).visible.map((x) => x.id)).toEqual(["2"]);
    expect(browseRecipes(POOL, { filters: { query: "xyz" } }).visible).toEqual([]);
  });

  it("Filter nach Mahlzeit und Ernährungsform; Rezepte ohne Tags fallen bei Formfilter weg", () => {
    expect(browseRecipes(POOL, { filters: { mealType: "breakfast" } }).visible.map((x) => x.id)).toEqual(["3", "2"]);
    expect(browseRecipes(POOL, { filters: { dietTag: "vegan" } }).visible.map((x) => x.id)).toEqual(["3", "2"]);
    expect(browseRecipes(POOL, { filters: { dietTag: "omnivor" } }).visible.map((x) => x.id)).toEqual(["1"]);
  });

  it("kombiniert Suche und Filter (UND)", () => {
    const { visible } = browseRecipes(POOL, { filters: { query: "e", mealType: "breakfast", dietTag: "glutenfrei" } });
    expect(visible.map((x) => x.id)).toEqual(["3"]);
  });

  it("blendet Rezepte mit eigener Unverträglichkeit hart aus und zählt sie", () => {
    const res = browseRecipes(POOL, { intolerances: ["gluten"] });
    expect(res.visible.map((x) => x.id)).toEqual(["3", "4", "1"]);
    expect(res.hiddenByIntolerance).toBe(1);
    expect(res.available).toBe(3);
  });

  it("alles unverträglich: visible leer, available 0, hiddenByIntolerance > 0", () => {
    const res = browseRecipes([r("a", "A", { containsTags: ["gluten"] })], { intolerances: ["gluten"] });
    expect(res).toEqual({ visible: [], hiddenByIntolerance: 1, available: 0 });
  });

  it("verträgt Müll: kein Array, fehlende Felder", () => {
    expect(browseRecipes(null).visible).toEqual([]);
    expect(browseRecipes([null, { id: "x", title: "T" }]).visible.map((x) => x.id)).toEqual(["x"]);
  });

  it("mutiert die Eingabe nicht", () => {
    const copy = POOL.map((x) => x.id);
    browseRecipes(POOL);
    expect(POOL.map((x) => x.id)).toEqual(copy);
  });
});

describe("hasActiveFilters", () => {
  it("erkennt Suche, Mahlzeit, Form; Leerraum zählt nicht", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ query: "   " })).toBe(false);
    expect(hasActiveFilters({ query: "a" })).toBe(true);
    expect(hasActiveFilters({ mealType: "lunch" })).toBe(true);
    expect(hasActiveFilters({ dietTag: "vegan" })).toBe(true);
  });
});
