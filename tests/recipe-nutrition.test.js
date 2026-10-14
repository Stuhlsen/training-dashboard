/* Tests: scripts/lib/recipe-nutrition.js + scripts/lib/ingredient-nutrition.json
   (Fahrplan 23, E3c) — Summierung, Einheiten, Tag-Ableitung, Tabellen-Integrität.
   Die Rezepte selbst liegen privat in planning/seed/; hier nur synthetische Daten. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildAll,
  buildRecipe,
  deriveDietTags,
  explainIngredients,
  toGrams,
  validateIngredientTable,
} from "../scripts/lib/recipe-nutrition.js";
import { validateRecipes } from "../scripts/lib/validate-recipe.js";
import { renderSamples, parseArgs } from "../scripts/build-recipe-nutrition.js";

const entry = (over = {}) => ({
  kcal: 100,
  protein: 10,
  carbs: 20,
  fat: 5,
  allergene: [],
  kategorie: "Obst & Gemüse",
  quelle: "BLS:X000000",
  ...over,
});

const TABLE = {
  zutaten: {
    Reis: entry({ kcal: 350, protein: 8, carbs: 77, fat: 1, kategorie: "Getreide & Backwaren" }),
    Milch: entry({
      kcal: 62,
      protein: 3.5,
      carbs: 4,
      fat: 3.5,
      allergene: ["milk"],
      tier: "dairy",
      einheiten: { ml: 1.03 },
    }),
    Ei: entry({
      kcal: 135,
      protein: 13,
      carbs: 0.3,
      fat: 9,
      allergene: ["eggs"],
      tier: "egg",
      einheiten: { Stück: 55 },
    }),
    Honig: entry({
      kcal: 300,
      protein: 0,
      carbs: 75,
      fat: 0,
      tier: "honey",
      einheiten: { EL: 21 },
    }),
    Hähnchen: entry({ kcal: 109, protein: 23, carbs: 0, fat: 2, tier: "meat" }),
    Sojasauce: entry({
      kcal: 66,
      protein: 6,
      carbs: 5,
      fat: 1,
      allergene: ["soybeans", "gluten"],
      einheiten: { EL: 18 },
    }),
    Apfel: entry({ kcal: 58, protein: 0.4, carbs: 12, fat: 0.5 }),
  },
};

const src = (over = {}) => ({
  title: "Testgericht",
  meal_type: ["lunch"],
  servings: 2,
  ingredients: [["Reis", 200, "g"]],
  instructions: ["Kochen."],
  ...over,
});

/* ── toGrams ─────────────────────────────────────────────── */

test("toGrams: g bleibt, ml nutzt Dichte (Standard 1), Stück/EL nutzen Tabellenwert", () => {
  assert.equal(toGrams(150, "g", {}), 150);
  assert.equal(toGrams(100, "ml", {}), 100);
  assert.equal(toGrams(100, "ml", { einheiten: { ml: 1.03 } }), 103);
  assert.equal(toGrams(2, "Stück", { einheiten: { Stück: 55 } }), 110);
});

test("toGrams: unbekannte Einheit gibt null (kein stilles Raten)", () => {
  assert.equal(toGrams(1, "Bund", { einheiten: { EL: 15 } }), null);
});

/* ── buildRecipe: Summierung ─────────────────────────────── */

test("nutrition: Summe über Zutaten, geteilt durch Portionen", () => {
  const res = buildRecipe(
    src({
      ingredients: [
        ["Reis", 200, "g"],
        ["Ei", 2, "Stück"],
      ],
    }),
    TABLE
  );
  assert.equal(res.ok, true);
  // Reis 200 g: 700 kcal, 16 P, 154 C, 2 F · 2 Eier = 110 g: 148.5 kcal, 14.3 P, 0.33 C, 9.9 F
  const n = res.recipe.nutrition;
  assert.equal(n.kcal, Math.round((700 + 148.5) / 2));
  assert.equal(n.protein, 15.2);
  assert.equal(n.carbs, 77.2);
  assert.equal(n.fat, 6);
});

test("nutrition: Portionen verändern nur die Division, nicht die Summe", () => {
  const one = buildRecipe(src({ servings: 1 }), TABLE).recipe.nutrition;
  const four = buildRecipe(src({ servings: 4 }), TABLE).recipe.nutrition;
  assert.equal(one.kcal, 4 * four.kcal);
});

test("category kommt aus der Tabelle, Seed-Rezept besteht den Validator", () => {
  const { recipes } = buildAll(
    [
      src({
        ingredients: [
          ["Reis", 100, "g"],
          ["Milch", 200, "ml"],
        ],
      }),
    ],
    TABLE
  );
  assert.equal(recipes[0].ingredients[0].category, "Getreide & Backwaren");
  assert.equal(validateRecipes(recipes).ok, true);
});

/* ── Tag-Ableitung ───────────────────────────────────────── */

test("contains_tags: Vereinigung aller Zutaten, in Taxonomie-Reihenfolge, ohne Duplikate", () => {
  const res = buildRecipe(
    src({
      ingredients: [
        ["Milch", 100, "ml"],
        ["Sojasauce", 1, "EL"],
        ["Ei", 1, "Stück"],
        ["Milch", 50, "ml"],
      ],
    }),
    TABLE
  );
  assert.deepEqual(res.recipe.contains_tags, ["gluten", "eggs", "soybeans", "milk"]);
});

test("verstecktes Allergen: Sojasauce bringt gluten UND soybeans mit", () => {
  const res = buildRecipe(
    src({
      ingredients: [
        ["Reis", 100, "g"],
        ["Sojasauce", 1, "EL"],
      ],
    }),
    TABLE
  );
  assert.deepEqual(res.recipe.contains_tags, ["gluten", "soybeans"]);
  assert.equal(res.recipe.diet_tags.includes("glutenfrei"), false);
});

test("diet_tags: vegan, vegetarisch, omnivor, glutenfrei", () => {
  assert.deepEqual(deriveDietTags(new Set(), new Set()), ["veg", "vegan", "glutenfrei"]);
  assert.deepEqual(deriveDietTags(new Set(["dairy"]), new Set(["milk"])), ["veg", "glutenfrei"]);
  assert.deepEqual(deriveDietTags(new Set(["meat"]), new Set(["gluten"])), ["omnivor"]);
  assert.deepEqual(deriveDietTags(new Set(["fish", "dairy"]), new Set()), [
    "omnivor",
    "glutenfrei",
  ]);
});

test("Honig und Ei machen ein Rezept nicht vegan, aber vegetarisch", () => {
  const honey = buildRecipe(
    src({
      ingredients: [
        ["Apfel", 100, "g"],
        ["Honig", 1, "EL"],
      ],
    }),
    TABLE
  ).recipe;
  assert.deepEqual(honey.diet_tags, ["veg", "glutenfrei"]);
  const egg = buildRecipe(src({ ingredients: [["Ei", 2, "Stück"]] }), TABLE).recipe;
  assert.equal(egg.diet_tags.includes("vegan"), false);
});

test("Fleisch macht omnivor, auch zusammen mit Milchprodukten", () => {
  const r = buildRecipe(
    src({
      ingredients: [
        ["Hähnchen", 200, "g"],
        ["Milch", 100, "ml"],
      ],
    }),
    TABLE
  ).recipe;
  assert.equal(r.diet_tags[0], "omnivor");
  assert.equal(r.diet_tags.includes("veg"), false);
});

/* ── Fehlerfälle: kein stilles Raten ─────────────────────── */

test("unbekannte Zutat ist ein Fehler, kein Rezept", () => {
  const res = buildRecipe(src({ ingredients: [["Einhornstaub", 5, "g"]] }), TABLE);
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /Einhornstaub/);
});

test("nicht umrechenbare Einheit ist ein Fehler", () => {
  const res = buildRecipe(src({ ingredients: [["Reis", 1, "Bund"]] }), TABLE);
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /Bund/);
});

test("abweichende Kategorie im Quellrezept wird gemeldet", () => {
  const res = buildRecipe(src({ ingredients: [["Reis", 100, "g", "Milchprodukte"]] }), TABLE);
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /Kategorie/);
});

test("buildAll sammelt Fehler mehrerer Rezepte und behält die guten", () => {
  const { recipes, errors } = buildAll(
    [src(), src({ title: "Kaputt", ingredients: [["X", 1, "g"]] })],
    TABLE
  );
  assert.equal(recipes.length, 1);
  assert.equal(errors.length, 1);
});

/* ── Anweisungen ─────────────────────────────────────────── */

test("instructions: Text und [Text, Sekunden] werden zu {text, timerSeconds}", () => {
  const r = buildRecipe(src({ instructions: ["Nur Text", ["Mit Timer", 300]] }), TABLE).recipe;
  assert.deepEqual(r.instructions, [
    { text: "Nur Text" },
    { text: "Mit Timer", timerSeconds: 300 },
  ]);
});

/* ── Stichproben-Ausgabe ─────────────────────────────────── */

test("explainIngredients liefert Gramm, kcal-Anteil, Quelle, Allergene", () => {
  const [e] = explainIngredients(src({ ingredients: [["Milch", 100, "ml"]] }), TABLE);
  assert.equal(e.grams, 103);
  assert.equal(e.kcal, 64);
  assert.deepEqual(e.allergene, ["milk"]);
  assert.equal(e.quelle, "BLS:X000000");
});

test("renderSamples enthält Titel, Nährwerte und Tags; unbekannter Titel wirft", () => {
  const sources = [src()];
  const { recipes } = buildAll(sources, TABLE);
  const md = renderSamples(["Testgericht"], sources, recipes, TABLE);
  assert.match(md, /## Testgericht/);
  assert.match(md, /kcal/);
  assert.match(md, /contains_tags/);
  assert.throws(() => renderSamples(["Gibt es nicht"], sources, recipes, TABLE), /nicht gefunden/);
});

test("parseArgs: --sample darf mehrfach vorkommen", () => {
  const a = parseArgs(["--in", "a.json", "--sample", "A", "--sample", "B"]);
  assert.equal(a.in, "a.json");
  assert.deepEqual(a.sample, ["A", "B"]);
});

/* ── Echte Zutatentabelle ────────────────────────────────── */

const REAL = JSON.parse(
  readFileSync(new URL("../scripts/lib/ingredient-nutrition.json", import.meta.url), "utf8")
);

test("echte Tabelle: Pflichtfelder, gültige Allergen-Schlüssel, Quelle je Zeile", () => {
  assert.deepEqual(validateIngredientTable(REAL), []);
});

test("echte Tabelle: Quellenvermerk nennt das Max Rubner-Institut", () => {
  assert.match(
    REAL._quelle,
    /Max Rubner-Institut \(2025\): Bundeslebensmittelschlüssel \(BLS\), Version 4\.0/
  );
});

// BLS rechnet Oligosaccharide (z. B. Fruktane im Knoblauch) in die Energie ein,
// nicht aber in "Kohlenhydrate, verfügbar" — dort weicht Atwater legitim ab.
const ATWATER_EXCEPTIONS = new Set(["Knoblauch"]);

test("echte Tabelle: kcal passt grob zu Eiweiß/Kohlenhydraten/Fett (Atwater, ±40 %)", () => {
  const off = Object.entries(REAL.zutaten)
    .filter(([name, z]) => {
      if (ATWATER_EXCEPTIONS.has(name)) return false;
      const atwater = 4 * z.protein + 4 * z.carbs + 9 * z.fat;
      return Math.abs(z.kcal - atwater) > Math.max(25, atwater * 0.4);
    })
    .map(([name]) => name);
  assert.deepEqual(off, []);
});

test("echte Tabelle: bekannte versteckte Allergene sind hinterlegt", () => {
  const z = REAL.zutaten;
  assert.deepEqual([...z.Sojasauce.allergene].sort(), ["gluten", "soybeans"]);
  assert.ok(z.Gemüsebrühe.allergene.includes("celery"));
  assert.ok(z.Senf.allergene.includes("mustard"));
  assert.ok(z.Tofu.allergene.includes("soybeans"));
  assert.ok(z.Apfelessig.allergene.includes("sulphites"));
  assert.ok(z.Haferflocken.allergene.includes("gluten"));
  for (const dairy of [
    "Milch",
    "Naturjoghurt",
    "Skyr",
    "Magerquark",
    "Hüttenkäse",
    "Feta",
    "Gouda",
    "Parmesan",
  ]) {
    assert.ok(z[dairy].allergene.includes("milk"), `${dairy} braucht milk`);
  }
  assert.ok(z.Eier.allergene.includes("eggs"));
  // Im Zweifel mit Allergen gekennzeichnet (Entscheidung Alex, 2026-10-14)
  assert.ok(z.Kokosmilch.allergene.includes("nuts"));
  assert.ok(z.Datteln.allergene.includes("sulphites"));
  assert.ok(z.Reiswaffeln.allergene.includes("sesame"));
  assert.deepEqual([...z.Kakaopulver.allergene].sort(), ["milk", "nuts"]);
});
