/* Tests: Einkaufsliste (Fahrplan 23, E8) — Zusammenrechnen, Portionsfaktor,
 * mehrere Einheiten, ausgeschlossene Tage, fehlende Zutaten, Kategorien,
 * Schlüssel-Vergleich, Rundung und Gleitkomma. Alle Daten synthetisch. */

import { describe, expect, it } from "vitest";
import {
  aggregateShoppingList,
  checkProgress,
  formatShoppingAmount,
  PANTRY_CATEGORY,
  roundAmount,
} from "./shopping-list.js";

const OBST = "Obst & Gemüse";

const ing = (name, amount, unit, category = OBST) => ({ name, amount, unit, category });
const recipe = (id, servings, ingredients, title = `Rezept ${id}`) => ({ id, title, servings, ingredients });
const entry = (date, recipeId, servings = 1, extraServings = 0) => ({ date, recipeId, servings, extraServings });

/** Einzige Zeile einer Liste (für Ein-Zutat-Fälle). */
function onlyRow(list) {
  expect(list.groups).toHaveLength(1);
  expect(list.groups[0].rows).toHaveLength(1);
  return list.groups[0].rows[0];
}

describe("aggregateShoppingList — Zusammenrechnen", () => {
  it("rechnet gleiche Zutat mit gleicher Einheit über Rezepte und Tage zusammen", () => {
    const recipes = [recipe("a", 2, [ing("Banane", 2, "Stück")]), recipe("b", 2, [ing("Banane", 1, "Stück")])];
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a", 2), entry("2026-10-15", "b", 2)],
      recipes,
    });
    const row = onlyRow(list);
    expect(row.amounts).toEqual([{ unit: "Stück", amount: 3 }]);
    expect(row.rezepte).toEqual(["Rezept a", "Rezept b"]);
  });

  it("gleicher Name mit anderer Einheit: eine Zeile, mehrere Mengen", () => {
    const recipes = [recipe("a", 1, [ing("Honig", 2, "TL")]), recipe("b", 1, [ing("Honig", 1, "EL")])];
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a"), entry("2026-10-14", "b")], recipes });
    const row = onlyRow(list);
    expect(row.amounts).toEqual([
      { unit: "EL", amount: 1 },
      { unit: "TL", amount: 2 },
    ]);
  });

  it("Groß-/Kleinschreibung und Randleerzeichen zählen nicht", () => {
    const recipes = [recipe("a", 1, [ing("Haferflocken", 50, "g")]), recipe("b", 1, [ing("  haferFLOCKEN ", 30, " G ")])];
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a"), entry("2026-10-14", "b")], recipes });
    const row = onlyRow(list);
    expect(row.name).toBe("Haferflocken");
    expect(row.amounts).toEqual([{ unit: "g", amount: 80 }]);
  });

  it("führt ähnliche Namen NICHT unscharf zusammen", () => {
    const recipes = [recipe("a", 1, [ing("Beeren", 100, "g"), ing("Beeren (tiefgekühlt)", 100, "g")])];
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a")], recipes });
    expect(list.groups[0].rows.map((r) => r.name)).toEqual(["Beeren", "Beeren (tiefgekühlt)"]);
  });

  it("gleicher Name in zwei Kategorien bleibt getrennt (nichts geht verloren)", () => {
    const recipes = [recipe("a", 1, [ing("Mix", 1, "Stück", OBST), ing("Mix", 1, "Stück", "Eier")])];
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a")], recipes });
    expect(list.groups.map((g) => g.category)).toEqual([OBST, "Eier"]);
  });
});

describe("aggregateShoppingList — Gäste-Portionen", () => {
  it("rechnet eigene + Gäste-Portionen in die Menge", () => {
    const recipes = [recipe("a", 2, [ing("Nudeln", 200, "g")])];
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a", 1, 5)], recipes });
    expect(onlyRow(list).amounts).toEqual([{ unit: "g", amount: 600 }]);
  });

  it("ohne extraServings (alter Eintrag) gilt nur servings", () => {
    const recipes = [recipe("a", 2, [ing("Nudeln", 200, "g")])];
    const list = aggregateShoppingList({
      entries: [{ date: "2026-10-14", recipeId: "a", servings: 1 }],
      recipes,
    });
    expect(onlyRow(list).amounts).toEqual([{ unit: "g", amount: 100 }]);
  });

  it("folgt einem geänderten Eintrag: gleicher Plan, mehr Gäste, größere Liste", () => {
    const recipes = [recipe("a", 2, [ing("Nudeln", 200, "g")])];
    const before = aggregateShoppingList({ entries: [entry("2026-10-14", "a", 1, 0)], recipes });
    const after = aggregateShoppingList({ entries: [entry("2026-10-14", "a", 1, 3)], recipes });
    expect(onlyRow(before).amounts).toEqual([{ unit: "g", amount: 100 }]);
    expect(onlyRow(after).amounts).toEqual([{ unit: "g", amount: 400 }]);
  });
});

describe("aggregateShoppingList — Portionsfaktor", () => {
  // Rezept-Portionen 2 und 4, Eintrag 0,5 / 0,75 / 1 / 1,5 / 2 Portionen; Basis 200 g.
  const cases = [
    { recipeServings: 2, eaten: 0.5, expected: 50 },
    { recipeServings: 2, eaten: 0.75, expected: 75 },
    { recipeServings: 2, eaten: 1, expected: 100 },
    { recipeServings: 2, eaten: 1.5, expected: 150 },
    { recipeServings: 2, eaten: 2, expected: 200 },
    { recipeServings: 4, eaten: 0.5, expected: 25 },
    { recipeServings: 4, eaten: 0.75, expected: 38 }, // 37,5 → ganzzahlig, halb nach oben
    { recipeServings: 4, eaten: 1, expected: 50 },
    { recipeServings: 4, eaten: 1.5, expected: 75 },
    { recipeServings: 4, eaten: 2, expected: 100 },
  ];
  for (const { recipeServings, eaten, expected } of cases) {
    it(`Rezept für ${recipeServings}, gegessen ${eaten} → ${expected} g`, () => {
      const list = aggregateShoppingList({
        entries: [entry("2026-10-14", "a", eaten)],
        recipes: [recipe("a", recipeServings, [ing("Reis", 200, "g")])],
      });
      expect(onlyRow(list).amounts).toEqual([{ unit: "g", amount: expected }]);
    });
  }

  it("ungültige Portionen (0, negativ, Rezept ohne Portionen) tragen nichts bei", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a", 0), entry("2026-10-14", "b", 1), entry("2026-10-14", "c", -1)],
      recipes: [recipe("a", 2, [ing("X", 1, "g")]), recipe("b", 0, [ing("Y", 1, "g")]), recipe("c", 2, [ing("Z", 1, "g")])],
    });
    expect(list.groups).toEqual([]);
  });
});

describe("aggregateShoppingList — Zeitraum, Lücken, Kategorien", () => {
  const recipes = [recipe("a", 1, [ing("Banane", 1, "Stück")]), recipe("b", 1, [ing("Apfel", 1, "Stück")])];

  it("ausgeschlossene Tage fließen nicht ein", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a"), entry("2026-10-15", "b")],
      recipes,
      excludedDates: ["2026-10-15"],
    });
    expect(onlyRow(list).name).toBe("Banane");
  });

  it("leere Woche: keine Gruppen, keine fehlenden Rezepte", () => {
    expect(aggregateShoppingList({ entries: [], recipes })).toEqual({ groups: [], missingIngredients: [] });
  });

  it("Eintrag mit unbekanntem Rezept wird übersprungen", () => {
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "gibt-es-nicht")], recipes });
    expect(list.groups).toEqual([]);
  });

  it("ingredients null oder leer: Rezept steht unter 'fehlende Zutaten', einmalig, kein Fehler", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "n"), entry("2026-10-15", "n"), entry("2026-10-15", "l"), entry("2026-10-15", "a")],
      recipes: [...recipes, recipe("n", 1, null, "Ohne Zutaten"), recipe("l", 1, [], "Leere Liste")],
    });
    expect(list.missingIngredients).toEqual(["Leere Liste", "Ohne Zutaten"]);
    expect(onlyRow(list).name).toBe("Banane");
  });

  it("Kategorien in Marktreihenfolge, unbekannte vor dem Vorrat, Vorrat zuletzt", () => {
    const r = recipe("a", 1, [
      ing("Salz", 1, "Prise", PANTRY_CATEGORY),
      ing("Sonderding", 1, "Stück", "Tiefkühl"),
      ing("Mandeln", 20, "g", "Nüsse & Samen"),
      ing("Joghurt", 100, "g", "Milchprodukte"),
      ing("Apfel", 1, "Stück", OBST),
    ]);
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a")], recipes: [r] });
    expect(list.groups.map((g) => g.category)).toEqual([OBST, "Milchprodukte", "Nüsse & Samen", "Tiefkühl", PANTRY_CATEGORY]);
    expect(list.groups.map((g) => g.isPantry)).toEqual([false, false, false, false, true]);
  });

  it("Zeilen sind innerhalb der Kategorie alphabetisch, der Schlüssel enthält Kategorie, Name, Einheit", () => {
    const r = recipe("a", 1, [ing("Zwiebel", 1, "Stück"), ing("Apfel", 1, "Stück")]);
    const list = aggregateShoppingList({ entries: [entry("2026-10-14", "a")], recipes: [r] });
    expect(list.groups[0].rows.map((x) => x.name)).toEqual(["Apfel", "Zwiebel"]);
    expect(list.groups[0].rows[0].key).toBe("obst & gemüse|apfel|stück");
  });
});

describe("Rundung und Gleitkomma", () => {
  it("g und ml ganzzahlig, alle anderen Einheiten auf 0,5", () => {
    expect(roundAmount(37.5, "g")).toBe(38);
    expect(roundAmount(12.4, "ml")).toBe(12);
    expect(roundAmount(1.3, "Stück")).toBe(1.5);
    expect(roundAmount(1.2, "EL")).toBe(1);
    expect(roundAmount(2.75, "TL")).toBe(3);
  });

  it("positive Mengen werden nie zu 0", () => {
    expect(roundAmount(0.2, "g")).toBe(1);
    expect(roundAmount(0.1, "Prise")).toBe(0.5);
  });

  it("Gleitkomma-Rauschen kippt die Rundung nicht (0,1 + 0,2 + 2,2 = 2,5 → 2,5)", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a"), entry("2026-10-14", "b"), entry("2026-10-14", "c")],
      recipes: [
        recipe("a", 1, [ing("Zimt", 0.1, "TL")]),
        recipe("b", 1, [ing("Zimt", 0.2, "TL")]),
        recipe("c", 1, [ing("Zimt", 2.2, "TL")]),
      ],
    });
    expect(onlyRow(list).amounts).toEqual([{ unit: "TL", amount: 2.5 }]);
  });

  it("rundet erst am Ende: 3 × 0,75 Portionen von 1 Stück = 2,25 → 2,5, nicht 3 × 1", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a", 0.75), entry("2026-10-15", "a", 0.75), entry("2026-10-16", "a", 0.75)],
      recipes: [recipe("a", 1, [ing("Ei", 1, "Stück", "Eier")])],
    });
    expect(onlyRow(list).amounts).toEqual([{ unit: "Stück", amount: 2.5 }]);
  });

  it("Faktor 1/3 ergibt keine Nachkommastellen-Reste in g", () => {
    const list = aggregateShoppingList({
      entries: [entry("2026-10-14", "a", 1)],
      recipes: [recipe("a", 3, [ing("Reis", 100, "g")])],
    });
    expect(onlyRow(list).amounts).toEqual([{ unit: "g", amount: 33 }]);
  });
});

describe("formatShoppingAmount", () => {
  it("deutsches Dezimalkomma, ganze Zahlen ohne Komma", () => {
    expect(formatShoppingAmount(1.5)).toBe("1,5");
    expect(formatShoppingAmount(2)).toBe("2");
    expect(formatShoppingAmount(250)).toBe("250");
  });
});

describe("checkProgress", () => {
  const group = (category, keys, isPantry = false) => ({
    category,
    isPantry,
    rows: keys.map((key) => ({ key, name: key, amounts: [], rezepte: [] })),
  });
  const groups = [group("Obst & Gemüse", ["a", "b", "c"]), group(PANTRY_CATEGORY, ["salz"], true)];

  it("zählt abgehakte und alle Zeilen", () => {
    expect(checkProgress(groups, new Set(["a", "c"]))).toEqual({ done: 2, total: 3 });
  });

  it("ohne Haken: 0 von n", () => {
    expect(checkProgress(groups, new Set())).toEqual({ done: 0, total: 3 });
  });

  it("Vorrat zählt weder als Gesamtzahl noch als erledigt", () => {
    expect(checkProgress(groups, new Set(["salz"]))).toEqual({ done: 0, total: 3 });
  });

  it("unbekannte Schlüssel werden ignoriert", () => {
    expect(checkProgress(groups, new Set(["alt", "b"]))).toEqual({ done: 1, total: 3 });
  });

  it("leere Liste: 0 von 0", () => {
    expect(checkProgress([], new Set(["a"]))).toEqual({ done: 0, total: 0 });
  });
});
