/* Tests: scripts/lib/validate-recipe.js — Reine Validierung der
   Rezept-Eingabe (node:test). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecipes, titleToSlug } from "../scripts/lib/validate-recipe.js";

const VALID_RECIPE = {
  title: "Haferflocken-Porridge",
  mealType: ["breakfast"],
  dietTags: ["veg", "vegan"],
  containsTags: ["gluten"],
  servings: 2,
  ingredients: [
    { name: "Haferflocken", amount: 100, unit: "g", category: "Getreide" },
    { name: "Mandelmilch", amount: 200, unit: "ml", category: "Milchersatz" },
  ],
  instructions: [
    { text: "Haferflocken in Topf geben" },
    { text: "Mandelmilch hinzugeben und 5 Minuten köcheln lassen", timerSeconds: 300 },
  ],
  nutrition: { kcal: 350, protein: 12, carbs: 50, fat: 8 },
};
const VALID_FILE = [VALID_RECIPE];

/* ── validateRecipes ────────────────────────────────────────── */

test("valid recipe passes validation", () => {
  const result = validateRecipes(VALID_FILE);
  assert.equal(result.ok, true);
});

test("empty file passes (no recipes)", () => {
  const result = validateRecipes([]);
  assert.equal(result.ok, true);
});

test("not an array → error", () => {
  const result = validateRecipes({});
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].startsWith("Eingabe ist kein Array"));
});

test("null input → error", () => {
  const result = validateRecipes(null);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].startsWith("Eingabe ist kein Array"));
});

/* ── unknown meal_type ──────────────────────────────────────── */

test("unknown meal_type → error", () => {
  const r = { ...VALID_RECIPE, mealType: ["brunch"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter meal_type "brunch"'));
});

test("empty mealType array → error", () => {
  const r = { ...VALID_RECIPE, mealType: [] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("mealType fehlt oder leer"));
});

test("missing mealType → error", () => {
  const r = { ...VALID_RECIPE };
  delete r.mealType;
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("mealType fehlt oder leer"));
});

/* ── unknown diet_tag ────────────────────────────────────────── */

test("unknown diet_tag → error", () => {
  const r = { ...VALID_RECIPE, dietTags: ["paleo"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter diet_tag "paleo"'));
});

test("valid null dietTags → ok", () => {
  const r = { ...VALID_RECIPE, dietTags: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("undefined dietTags → ok", () => {
  const r = { ...VALID_RECIPE };
  delete r.dietTags;
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

/* ── unknown allergen key ────────────────────────────────────── */

test("unknown allergen key → error", () => {
  const r = { ...VALID_RECIPE, containsTags: ["xyz_allergen"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter Allergen-Key "xyz_allergen"'));
});

test("valid null containsTags → ok", () => {
  const r = { ...VALID_RECIPE, containsTags: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("undefined containsTags → ok", () => {
  const r = { ...VALID_RECIPE };
  delete r.containsTags;
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("empty containsTags → ok (unremarkable)", () => {
  const r = { ...VALID_RECIPE, containsTags: [] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

/* ── servings <= 0 ──────────────────────────────────────────── */

test("servings = 0 → error", () => {
  const r = { ...VALID_RECIPE, servings: 0 };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("servings fehlt oder <= 0"));
});

test("servings = -1 → error", () => {
  const r = { ...VALID_RECIPE, servings: -1 };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("servings fehlt oder <= 0"));
});

test("missing servings → error", () => {
  const r = { ...VALID_RECIPE };
  delete r.servings;
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("servings fehlt oder <= 0"));
});

/* ── empty title ────────────────────────────────────────────── */

test("empty title → error", () => {
  const r = { ...VALID_RECIPE, title: "" };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("title fehlt oder leer"));
});

test("whitespace-only title → error", () => {
  const r = { ...VALID_RECIPE, title: "   " };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("title fehlt oder leer"));
});

test("missing title → error", () => {
  const r = { ...VALID_RECIPE };
  delete r.title;
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("title fehlt oder leer"));
});

/* ── ingredient without amount ──────────────────────────────── */

test("ingredient missing amount → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ name: "Haferflocken", unit: "g", category: "Getreide" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("Pflichtfelder fehlen"));
  assert.ok(result.errors[0].includes("amount"));
});

test("ingredient missing name → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ amount: 100, unit: "g", category: "Getreide" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("name"));
});

test("ingredient missing unit → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ name: "Haferflocken", amount: 100, category: "Getreide" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("unit"));
});

test("ingredient missing category → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ name: "Haferflocken", amount: 100, unit: "g" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("category"));
});

test("null ingredients → ok", () => {
  const r = { ...VALID_RECIPE, ingredients: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

/* ── duplicate titles ──────────────────────────────────────── */

test("duplicate titles → error", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    { ...VALID_RECIPE, mealType: ["lunch"], ingredients: null, instructions: null },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("doppelter Titel")));
});

test("duplicate titles (case-insensitive) → error", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    { ...VALID_RECIPE, title: "haferflocken-porridge", mealType: ["lunch"], ingredients: null, instructions: null },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("doppelter Titel")));
});

test("similar but different titles → ok", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    { ...VALID_RECIPE, title: "Haferflocken-Porridge mit Beeren", mealType: ["lunch"], ingredients: null, instructions: null },
  ]);
  assert.equal(result.ok, true);
});

/* ── instruction validation ─────────────────────────────────── */

test("instruction without timerSeconds → valid", () => {
  const r = { ...VALID_RECIPE, instructions: [{ text: "Gut umrühren" }] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("instruction with empty text → error", () => {
  const r = { ...VALID_RECIPE, instructions: [{ text: "" }] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("text fehlt oder leer"));
});

test("null instructions → ok", () => {
  const r = { ...VALID_RECIPE, instructions: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

/* ── titleToSlug ───────────────────────────────────────────── */

test("titleToSlug: simple title", () => {
  assert.equal(titleToSlug("Haferflocken-Porridge"), "haferflocken-porridge");
});

test("titleToSlug: special chars", () => {
  assert.equal(titleToSlug("Süße Kürbissuppe!"), "süße-kürbissuppe");
});

test("titleToSlug: multiple spaces", () => {
  assert.equal(titleToSlug("  Bananen  Pancakes  "), "bananen-pancakes");
});

test("titleToSlug: very long title truncated", () => {
  const longTitle = "x".repeat(200);
  assert.ok(titleToSlug(longTitle).length <= 100);
});

/* ── multiple errors at once ───────────────────────────────── */

test("multiple validation errors reported together", () => {
  const result = validateRecipes([
    {
      title: "",
      mealType: ["brunch"],
      dietTags: ["paleo"],
      containsTags: ["fake_key"],
      servings: -1,
      ingredients: [{ name: "Test" }],
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 4);
});