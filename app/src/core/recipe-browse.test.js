import { describe, expect, it } from "vitest";
import {
  RECIPE_SORT_OPTIONS,
  browseRecipes,
  formatPrepTime,
  hasActiveFilters,
  normalizeSearch,
} from "./recipe-browse.js";

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

describe("browseRecipes: Dauer (Fahrplan 30 B1)", () => {
  const TIMED = [
    r("a", "Anders", { prepMinutes: 30 }),
    r("b", "Bowl", { prepMinutes: 5 }),
    r("c", "Curry", { prepMinutes: 45 }),
    r("d", "Dessert", { prepMinutes: null }),
    r("e", "Eintopf", { prepMinutes: 5 }),
    r("f", "Fisch", { prepMinutes: 490 }),
  ];

  it("Filter 'bis N Min' nimmt Rezepte bis einschließlich N und lässt Rezepte ohne Zeit weg", () => {
    expect(browseRecipes(TIMED, { filters: { maxMinutes: 15 } }).visible.map((x) => x.id)).toEqual(["b", "e"]);
    expect(browseRecipes(TIMED, { filters: { maxMinutes: 30 } }).visible.map((x) => x.id)).toEqual(["a", "b", "e"]);
    expect(browseRecipes(TIMED, { filters: { maxMinutes: 45 } }).visible.map((x) => x.id)).toEqual(["a", "b", "c", "e"]);
  });

  it("zählt 'available' unabhängig vom Zeitfilter (Leerzustand bleibt 'kein Rezept passt')", () => {
    expect(browseRecipes(TIMED, { filters: { maxMinutes: 15 } }).available).toBe(6);
  });

  it("Sortierung 'fastest': kürzeste zuerst, Gleichstand nach Titel, ohne Zeit zuletzt", () => {
    const { visible } = browseRecipes(TIMED, { sort: "fastest" });
    expect(visible.map((x) => x.id)).toEqual(["b", "e", "a", "c", "f", "d"]);
  });

  it("Standard bleibt nach Titel", () => {
    expect(browseRecipes(TIMED).visible.map((x) => x.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("Sortierung 'best': Schnitt absteigend, bei Gleichstand mehr Bewertungen, unbewertete zuletzt", () => {
    const rated = [
      r("a", "Auflauf", { ratingAvg: 4.0, ratingCount: 3 }),
      r("b", "Bowl", { ratingAvg: null, ratingCount: 0 }),
      r("c", "Curry", { ratingAvg: 4.5, ratingCount: 2 }),
      r("d", "Dessert"), // Felder fehlen ganz (Rezept ohne Statistik)
      r("e", "Eintopf", { ratingAvg: 4.5, ratingCount: 9 }),
      r("f", "Fisch", { ratingAvg: 4.0, ratingCount: 3 }),
    ];
    expect(browseRecipes(rated, { sort: "best" }).visible.map((x) => x.id)).toEqual(["e", "c", "a", "f", "b", "d"]);
  });

  it("Sortierung 'best' behandelt Anzahl 0 oder fehlenden Schnitt als unbewertet", () => {
    const odd = [
      r("a", "Auflauf", { ratingAvg: 5, ratingCount: 0 }),
      r("b", "Bowl", { ratingAvg: Number.NaN, ratingCount: 4 }),
      r("c", "Curry", { ratingAvg: 2, ratingCount: 1 }),
    ];
    expect(browseRecipes(odd, { sort: "best" }).visible.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });

  it("bietet 'Beste Bewertung' neben 'Schnellste' an", () => {
    expect(RECIPE_SORT_OPTIONS.map((o) => o.value)).toEqual(["title", "fastest", "best"]);
    expect(RECIPE_SORT_OPTIONS.find((o) => o.value === "best")?.label).toBe("Beste Bewertung");
  });

  it("Zeitfilter und Suche greifen zusammen", () => {
    const { visible } = browseRecipes(TIMED, { filters: { maxMinutes: 30, query: "bowl" } });
    expect(visible.map((x) => x.id)).toEqual(["b"]);
  });
});

describe("formatPrepTime", () => {
  it("zeigt Minuten, ab 60 Stunden und Minuten", () => {
    expect(formatPrepTime(25)).toBe("25 min");
    expect(formatPrepTime(60)).toBe("1 h");
    expect(formatPrepTime(130)).toBe("2 h 10 min");
    expect(formatPrepTime(490)).toBe("8 h 10 min");
  });
  it("gibt ohne gültigen Wert null zurück", () => {
    for (const bad of [null, undefined, 0, -3, NaN]) expect(formatPrepTime(bad)).toBeNull();
  });
});

describe("hasActiveFilters", () => {
  it("erkennt Suche, Mahlzeit, Form, Dauer; Leerraum zählt nicht", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ query: "   " })).toBe(false);
    expect(hasActiveFilters({ query: "a" })).toBe(true);
    expect(hasActiveFilters({ mealType: "lunch" })).toBe(true);
    expect(hasActiveFilters({ dietTag: "vegan" })).toBe(true);
    expect(hasActiveFilters({ maxMinutes: 30 })).toBe(true);
    expect(hasActiveFilters({ maxMinutes: null })).toBe(false);
  });
});
