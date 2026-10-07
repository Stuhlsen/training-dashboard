/* Tests: scripts/lib/validate-recipe.js — Reine Validierung der
   Rezept-Eingabe (node:test). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRecipes, titleToSlug } from "../scripts/lib/validate-recipe.js";

/* Input-Format: snake_case (DB-Spaltennamen), siehe Script-Header. */

const VALID_RECIPE = {
  title: "Haferflocken-Porridge",
  meal_type: ["breakfast"],
  diet_tags: ["veg", "vegan"],
  contains_tags: ["gluten"],
  servings: 2,
  ingredients: [
    { name: "Haferflocken", amount: 100, unit: "g", category: "Getreide & Backwaren" },
    { name: "Mandelmilch", amount: 200, unit: "ml", category: "Milchprodukte" },
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

/* ── invented example in documented format ────────────────────── */

test("invented example in documented format passes", () => {
  const example = [
    {
      title: "Bananen-Pancakes",
      meal_type: ["breakfast"],
      diet_tags: ["veg", "vegan"],
      contains_tags: ["gluten"],
      servings: 2,
      ingredients: [
        { name: "Banane", amount: 1, unit: "Stück", category: "Obst & Gemüse" },
        { name: "Haferflocken", amount: 80, unit: "g", category: "Getreide & Backwaren" },
      ],
      instructions: [
        { text: "Banane zerdrücken" },
        { text: "Mit Haferflocken mischen und braten", timerSeconds: 240 },
      ],
    },
  ];
  const result = validateRecipes(example);
  assert.equal(result.ok, true);
  // Has nutrition warning since no nutrition provided
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings[0].includes("keine Nährwertangaben"));
});

/* ── unknown meal_type ──────────────────────────────────────── */

test("unknown meal_type → error", () => {
  const r = { ...VALID_RECIPE, meal_type: ["brunch"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter meal_type "brunch"'));
});

test("empty meal_type array → error", () => {
  const r = { ...VALID_RECIPE, meal_type: [] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("meal_type fehlt oder leer"));
});

test("missing meal_type → error", () => {
  const r = { ...VALID_RECIPE };
  delete r.meal_type;
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("meal_type fehlt oder leer"));
});

/* ── unknown diet_tag ────────────────────────────────────────── */

test("unknown diet_tag → error", () => {
  const r = { ...VALID_RECIPE, diet_tags: ["paleo"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter diet_tag "paleo"'));
});

test("valid null diet_tags → ok", () => {
  const r = { ...VALID_RECIPE, diet_tags: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("undefined diet_tags → ok", () => {
  const r = { ...VALID_RECIPE };
  delete r.diet_tags;
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

/* ── unknown allergen key ────────────────────────────────────── */

test("unknown allergen key → error", () => {
  const r = { ...VALID_RECIPE, contains_tags: ["xyz_allergen"] };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('unbekannter Allergen-Key "xyz_allergen"'));
});

test("valid null contains_tags → ok", () => {
  const r = { ...VALID_RECIPE, contains_tags: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("undefined contains_tags → ok", () => {
  const r = { ...VALID_RECIPE };
  delete r.contains_tags;
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("empty contains_tags → ok (unremarkable)", () => {
  const r = { ...VALID_RECIPE, contains_tags: [] };
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

/* ── ingredient without required fields ──────────────────────── */

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

test("ingredient amount = 0 → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ name: "Salz", amount: 0, unit: "Prise", category: "Gewürze & Vorrat" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("amount muss > 0 sein"));
});

test("ingredient amount negative → error", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [{ name: "Salz", amount: -1, unit: "Prise", category: "Gewürze & Vorrat" }],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("amount muss > 0 sein"));
});

test("null ingredients → ok", () => {
  const r = { ...VALID_RECIPE, ingredients: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
});

test("null entry in ingredients array → error (crash guard)", () => {
  const r = {
    ...VALID_RECIPE,
    ingredients: [
      { name: "Haferflocken", amount: 100, unit: "g", category: "Getreide" },
      null,
    ],
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("Zutat ist null oder ungültig")));
});

/* ── duplicate titles ──────────────────────────────────────── */

test("duplicate titles → error", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    { ...VALID_RECIPE, meal_type: ["lunch"], ingredients: null, instructions: null },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("doppelter Titel")));
});

test("duplicate titles (case-insensitive) → error", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    {
      ...VALID_RECIPE,
      title: "haferflocken-porridge",
      meal_type: ["lunch"],
      ingredients: null,
      instructions: null,
    },
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("doppelter Titel")));
});

test("similar but different titles → ok", () => {
  const result = validateRecipes([
    { ...VALID_RECIPE },
    {
      ...VALID_RECIPE,
      title: "Haferflocken-Porridge mit Beeren",
      meal_type: ["lunch"],
      ingredients: null,
      instructions: null,
    },
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

/* ── nutrition validation ───────────────────────────────────── */

test("missing nutrition → ok with warning", () => {
  const r = { ...VALID_RECIPE };
  delete r.nutrition;
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings[0].includes("keine Nährwertangaben"));
});

test("null nutrition → ok with warning", () => {
  const r = { ...VALID_RECIPE, nutrition: null };
  const result = validateRecipes([r]);
  assert.equal(result.ok, true);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(result.warnings[0].includes("keine Nährwertangaben"));
});

test("nutrition with negative kcal → error", () => {
  const r = { ...VALID_RECIPE, nutrition: { kcal: -100, protein: 10, carbs: 50, fat: 5 } };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("nutrition ungültig"));
});

test("nutrition with non-numeric protein → error", () => {
  const r = { ...VALID_RECIPE, nutrition: { kcal: 200, protein: "abc", carbs: 50, fat: 5 } };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("nutrition ungültig"));
});

test("nutrition with NaN → error", () => {
  const r = { ...VALID_RECIPE, nutrition: { kcal: 200, protein: NaN, carbs: 50, fat: 5 } };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("nutrition ungültig"));
});

test("nutrition with missing field → error", () => {
  const r = {
    ...VALID_RECIPE,
    nutrition: { kcal: 200, protein: 10, carbs: 50 },
  };
  const result = validateRecipes([r]);
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes("nutrition ungültig"));
});

/* ── titleToSlug ───────────────────────────────────────────── */

test("titleToSlug: simple title", () => {
  assert.equal(titleToSlug("Haferflocken-Porridge"), "haferflocken-porridge");
});

test("titleToSlug: special chars", () => {
  assert.equal(titleToSlug("Süße Kürbissuppe!"), "suesse-kuerbissuppe");
});

test("titleToSlug: multiple spaces", () => {
  assert.equal(titleToSlug("  Bananen  Pancakes  "), "bananen-pancakes");
});

test("titleToSlug: Umlaute, ß und Akzente werden zu reinem ASCII", () => {
  assert.equal(titleToSlug("Rührei mit Hähnchen"), "ruehrei-mit-haehnchen");
  assert.equal(titleToSlug("Größe Öl-Äpfel"), "groesse-oel-aepfel");
  assert.equal(titleToSlug("Crème brûlée"), "creme-brulee");
  assert.match(titleToSlug("Süße Köstlichkeiten 2 für Alle"), /^[a-z0-9-]+$/);
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
      meal_type: ["brunch"],
      diet_tags: ["paleo"],
      contains_tags: ["fake_key"],
      servings: -1,
      ingredients: [{ name: "Test", amount: 0, unit: "g", category: "Getreide" }],
    },
  ]);
  assert.equal(result.ok, false);
  // Should have at least: empty title, unknown meal_type, unknown diet_tag,
  // unknown allergen key, servings <= 0, ingredient amount > 0
  assert.ok(result.errors.length >= 5);
});