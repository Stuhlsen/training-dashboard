/* Tests: scripts/lib/recipe-coverage.js (Fahrplan 23, E3c, E27)
   Abdeckung je Slot nach Allergen-Filter und Mischungs-Kennzahlen.
   Synthetische Rezepte; der echte Bestand liegt privat in planning/seed/
   und wird mit scripts/build-recipe-nutrition.js geprüft. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByIntolerances } from "../app/src/core/nutrition.js";
import { ALLERGEN_TAXONOMY } from "../scripts/lib/core/nutrition-taxonomy.js";
import {
  coverageReport,
  EU_ALLERGENS,
  MIN_PER_SLOT,
  mixReport,
  slotCounts,
  SLOTS,
} from "../scripts/lib/recipe-coverage.js";

const r = (title, meal_type, contains_tags = [], diet_tags = ["veg"]) => ({
  title,
  meal_type,
  contains_tags,
  diet_tags,
});

test("EU_ALLERGENS: genau die 14 Hauptallergene, ohne Freitext-Marker", () => {
  assert.equal(EU_ALLERGENS.length, 14);
  assert.equal(EU_ALLERGENS.includes("sonstiges"), false);
  assert.equal(ALLERGEN_TAXONOMY.length, 15);
});

test("slotCounts: Mehrfachzugehörigkeit zählt in jedem Slot", () => {
  const counts = slotCounts([r("a", ["breakfast", "snack"]), r("b", ["lunch"])]);
  assert.deepEqual(counts, { breakfast: 1, lunch: 1, dinner: 0, snack: 1 });
});

test("slotCounts: filtert mit der echten App-Funktion (Ergebnis identisch)", () => {
  const recipes = [r("a", ["lunch"], ["milk"]), r("b", ["lunch"], ["gluten"]), r("c", ["lunch"])];
  const viaApp = filterByIntolerances(
    recipes.map((x) => ({ ...x, containsTags: x.contains_tags })),
    ["milk"]
  ).length;
  assert.equal(slotCounts(recipes, ["milk"]).lunch, viaApp);
  assert.equal(viaApp, 2);
});

test("coverageReport: genug Auswahl ohne Beanstandung", () => {
  const recipes = SLOTS.flatMap((slot) => [1, 2, 3, 4].map((i) => r(`${slot}${i}`, [slot])));
  const rep = coverageReport(recipes);
  assert.deepEqual(rep.shortfalls, []);
  assert.equal(Object.keys(rep.perAllergen).length, 14);
});

test("coverageReport: meldet Slot und Allergen, wenn weniger als 3 übrig bleiben", () => {
  const recipes = [
    ...[1, 2, 3].map((i) => r(`f${i}`, ["breakfast"])),
    r("m1", ["breakfast"], ["milk"]),
    ...[1, 2, 3].map((i) => r(`l${i}`, ["lunch"])),
    ...[1, 2, 3].map((i) => r(`d${i}`, ["dinner"])),
    ...[1, 2, 3].map((i) => r(`s${i}`, ["snack"])),
  ];
  assert.deepEqual(coverageReport(recipes).shortfalls, []);
  const thin = recipes.filter((x) => x.title !== "f1");
  const rep = coverageReport(thin);
  assert.ok(rep.shortfalls.length > 0);
  assert.ok(rep.shortfalls.every((s) => s.includes(`(< ${MIN_PER_SLOT})`)));
  assert.ok(rep.shortfalls.some((s) => s.startsWith("milk / breakfast")));
});

test("mixReport: Anteile für vegetarisch, glutenfrei, laktosefrei, <= 30 min, Radsport", () => {
  const recipes = [
    r("a", ["lunch"], [], ["veg", "vegan", "glutenfrei"]),
    r("b", ["lunch"], ["gluten", "milk"], ["veg"]),
    r("c", ["dinner"], ["fish"], ["omnivor", "glutenfrei"]),
    r("d", ["snack"], ["milk"], ["veg", "glutenfrei"]),
  ];
  const meta = new Map([
    ["a", { minutes: 20, cycling: true }],
    ["b", { minutes: 45 }],
    ["c", { minutes: 30 }],
    ["d", { minutes: 5, cycling: true }],
  ]);
  const mix = mixReport(recipes, meta);
  assert.equal(mix.count, 4);
  assert.equal(mix.vegOrVegan, 0.75);
  assert.equal(mix.glutenFree, 0.75);
  assert.equal(mix.lactoseFree, 0.5);
  assert.equal(mix.quick30, 0.75);
  assert.equal(mix.cycling, 0.5);
  assert.deepEqual(mix.slots, { breakfast: 0, lunch: 2, dinner: 1, snack: 1 });
});

test("mixReport: leerer Bestand teilt nicht durch null", () => {
  const mix = mixReport([], new Map());
  assert.equal(mix.vegOrVegan, 0);
  assert.equal(mix.count, 0);
});
