// Fahrplan 25 S1a — Konsistenztest: der Dienst muss fuer die 60 eindeutigen
// Seed-Rezepte exakt dieselben Naehrwerte und Tags ableiten wie das
// Seed-Skript (build-recipe-nutrition.js). Die Rezepte liegen privat in
// planning/seed/ (gitignored) — fehlen sie (z. B. in der CI), wird uebersprungen.
// Anderer Ort: Umgebungsvariable RECIPE_SEED_DIR.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const seedDir = process.env.RECIPE_SEED_DIR ?? path.join(__dirname, "..", "planning", "seed");
const files = ["own-recipes.json", "own-recipes-e3c.json"].map((f) => path.join(seedDir, f));
const available = files.every((f) => fs.existsSync(f));

const { deriveRecipe } = require("./recipes.js");

test(
  "60 eindeutige Seed-Rezepte: Dienst = Seed-Skript (Naehrwerte, Tags, Zutaten, Schritte)",
  { skip: available ? false : `Seed-Dateien nicht gefunden (${seedDir})` },
  async () => {
    // Spaetere Datei gewinnt: e3c enthaelt die abgeleiteten Werte der Doppelten.
    const byTitle = new Map();
    for (const file of files) {
      for (const recipe of JSON.parse(fs.readFileSync(file, "utf8"))) byTitle.set(recipe.title, recipe);
    }
    assert.equal(byTitle.size, 60);

    const mismatches = [];
    for (const seed of byTitle.values()) {
      const body = {
        title: seed.title,
        meal_type: seed.meal_type,
        servings: seed.servings,
        ingredients: seed.ingredients.map(({ name, amount, unit }) => ({ name, amount, unit })),
        instructions: seed.instructions,
      };
      const result = await deriveRecipe(body, "11111111-1111-4111-8111-111111111111");
      if (!result.ok) {
        mismatches.push(`${seed.title}: ${JSON.stringify(result.error.details)}`);
        continue;
      }
      const { recipe } = result;
      try {
        assert.deepEqual(recipe.nutrition, seed.nutrition);
        assert.deepEqual(recipe.contains_tags, seed.contains_tags);
        assert.deepEqual(recipe.diet_tags, seed.diet_tags);
        assert.deepEqual(recipe.ingredients, seed.ingredients);
        assert.deepEqual(recipe.instructions, seed.instructions);
      } catch (err) {
        mismatches.push(`${seed.title}: ${err.message.split("\n")[0]}`);
      }
    }
    assert.deepEqual(mismatches, []);
  }
);
