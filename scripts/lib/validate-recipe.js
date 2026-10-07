/* ============================================================
   SCRIPTS/LIB/VALIDATE-RECIPE.JS — Reine Rezept-Validierung (kein I/O)
   (Fahrplan 23, Etappe E3 — V3/V4/V5/V7)

   Reine Funktion, die ein Array von Rezept-Objekten (aus einer
   JSON-Datei) gegen die Validitätsregeln prüft. Keine Nebenwirkungen,
   kein I/O — getestet mit node:test + dem gemockten Supabase-Client.

   Validierung startet mit einem leeren Fehler-Array und sammelt
   alle Verstöße, nie nur den ersten. Rückgabe: { ok, errors, warnings }
   mit detaillierten Fehlermeldungen — kein Wurf.

   Erwartetes Eingabeformat (pro Rezept, snake_case — DB-Spaltennamen):
   {
     title: string,               // Pflicht, nicht leer
     meal_type: string[],         // Pflicht, nur "breakfast"/"lunch"/"dinner"/"snack"
     diet_tags: string[],         // Optional, nur "veg"/"vegan"/"glutenfrei"/"omnivor"
     contains_tags: string[],     // Optional, nur gültige AllergenKeys aus nutrition-taxonomy.js
     servings: number,            // Pflicht, > 0
     ingredients: [{              // Optional, wenn vorhanden:
       name: string,              //   Pflicht
       amount: number,            //   Pflicht (> 0)
       unit: string,              //   Pflicht
       category: string           //   Pflicht (z.B. "Obst & Gemüse", "Milchprodukte",
                                  //   "Getreide & Backwaren", "Fleisch & Fisch", "Eier",
                                  //   "Hülsenfrüchte & Konserven", "Nüsse & Samen",
                                  //   "Öle", "Gewürze & Vorrat")
     }],
     instructions: [{             // Optional, wenn vorhanden:
       text: string,              //   Pflicht
       timerSeconds: number       //   Optional
     }],
     nutrition: {                 // Optional — fehlend = warning, kein Fehler.
                                  //   Wenn vorhanden, müssen kcal/protein/carbs/fat
                                  //   positive Zahlen sein.
       kcal: number, protein: number, carbs: number, fat: number
     },
     image_url: string            // Optional
   }
   ============================================================ */

import { isValidAllergenKey } from "./core/nutrition-taxonomy.js";

const VALID_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const VALID_DIET_TAGS = new Set(["veg", "vegan", "glutenfrei", "omnivor"]);
const REQUIRED_INGREDIENT_FIELDS = ["name", "amount", "unit", "category"];

function isValidMealType(val) {
  return typeof val === "string" && VALID_MEAL_TYPES.has(val);
}

function isValidDietTag(val) {
  return typeof val === "string" && VALID_DIET_TAGS.has(val);
}

/** Prüft, ob ein Nutrition-Objekt gültige Zahlen hat. */
function isValidNutrition(n) {
  if (!n || typeof n !== "object") return false;
  for (const field of ["kcal", "protein", "carbs", "fat"]) {
    const v = n[field];
    if (typeof v !== "number" || Number.isNaN(v) || v < 0) return false;
  }
  return true;
}

/**
 * Validiert ein Array von Rezept-Objekten (snake_case keys).
 * @param {unknown[]} recipes  Roh-Array aus der JSON-Datei
 * @returns {{ ok: true, warnings?: string[] } | { ok: false, errors: string[], warnings?: string[] }}
 */
export function validateRecipes(recipes) {
  if (!Array.isArray(recipes)) {
    return { ok: false, errors: ["Eingabe ist kein Array"] };
  }

  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  const seenTitles = new Set();

  for (let i = 0; i < recipes.length; i++) {
    const r = recipes[i];
    const prefix = `Rezept #${i + 1}`;

    if (!r || typeof r !== "object" || Array.isArray(r)) {
      errors.push(`${prefix}: kein gültiges Objekt`);
      continue;
    }

    // ---- title ----
    if (typeof r.title !== "string" || r.title.trim() === "") {
      errors.push(`${prefix}: title fehlt oder leer`);
    }

    // ---- duplicate title ----
    if (typeof r.title === "string" && r.title.trim()) {
      const key = r.title.trim().toLowerCase();
      if (seenTitles.has(key)) {
        errors.push(`${prefix}: doppelter Titel "${r.title}"`);
      }
      seenTitles.add(key);
    }

    // ---- meal_type ----
    const mealType = r.meal_type;
    if (!Array.isArray(mealType) || mealType.length === 0) {
      errors.push(`${prefix}: meal_type fehlt oder leer`);
    } else {
      for (const mt of mealType) {
        if (!isValidMealType(mt)) {
          errors.push(`${prefix}: unbekannter meal_type "${String(mt)}"`);
        }
      }
    }

    // ---- diet_tags ----
    if (r.diet_tags !== undefined && r.diet_tags !== null) {
      if (!Array.isArray(r.diet_tags)) {
        errors.push(`${prefix}: diet_tags ist kein Array`);
      } else {
        for (const dt of r.diet_tags) {
          if (!isValidDietTag(dt)) {
            errors.push(`${prefix}: unbekannter diet_tag "${String(dt)}"`);
          }
        }
      }
    }

    // ---- contains_tags (allergen keys) ----
    if (r.contains_tags !== undefined && r.contains_tags !== null) {
      if (!Array.isArray(r.contains_tags)) {
        errors.push(`${prefix}: contains_tags ist kein Array`);
      } else {
        for (const ak of r.contains_tags) {
          if (!isValidAllergenKey(ak)) {
            errors.push(`${prefix}: unbekannter Allergen-Key "${String(ak)}"`);
          }
        }
      }
    }

    // ---- servings ----
    if (typeof r.servings !== "number" || r.servings <= 0) {
      errors.push(`${prefix}: servings fehlt oder <= 0`);
    }

    // ---- ingredients ----
    if (r.ingredients !== undefined && r.ingredients !== null) {
      if (!Array.isArray(r.ingredients)) {
        errors.push(`${prefix}: ingredients ist kein Array`);
      } else {
        for (let j = 0; j < r.ingredients.length; j++) {
          const ing = r.ingredients[j];
          const iprefix = `${prefix}, Zutat #${j + 1}`;
          const missing = REQUIRED_INGREDIENT_FIELDS.filter(
            (f) =>
              ing[f] === undefined ||
              ing[f] === null ||
              (typeof ing[f] === "number" && Number.isNaN(ing[f])),
          );
          if (missing.length > 0) {
            errors.push(`${iprefix}: Pflichtfelder fehlen: ${missing.join(", ")}`);
          }
          // amount must be > 0 (positive)
          if (ing && typeof ing.amount === "number" && ing.amount <= 0) {
            errors.push(`${iprefix}: amount muss > 0 sein`);
          }
        }
      }
    }

    // ---- instructions ----
    if (r.instructions !== undefined && r.instructions !== null) {
      if (!Array.isArray(r.instructions)) {
        errors.push(`${prefix}: instructions ist kein Array`);
      } else {
        for (let j = 0; j < r.instructions.length; j++) {
          const instr = r.instructions[j];
          if (!instr || typeof instr.text !== "string" || instr.text.trim() === "") {
            errors.push(`${prefix}, Schritt #${j + 1}: text fehlt oder leer`);
          }
        }
      }
    }

    // ---- nutrition ----
    if (r.nutrition !== undefined && r.nutrition !== null) {
      if (!isValidNutrition(r.nutrition)) {
        errors.push(`${prefix}: nutrition ungültig (kcal/protein/carbs/fat müssen positive Zahlen sein)`);
      }
    } else {
      // Missing nutrition is accepted, with a warning
      warnings.push(`${prefix}: keine Nährwertangaben (nutrition fehlt)`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings: warnings.length > 0 ? warnings : undefined };
  }
  return { ok: true, warnings: warnings.length > 0 ? warnings : undefined };
}

/**
 * Erzeugt einen Slug aus einem Titel (für external_id).
 * @param {string} title
 * @returns {string}
 */
export function titleToSlug(title) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 100);
}

/** Gültige Quellen für den Seed (source = 'own'). */
export const SEED_SOURCE = "own";

/** Status für gepflanzte Rezepte. */
export const SEED_STATUS = "approved";