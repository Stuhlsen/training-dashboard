/* ============================================================
   SCRIPTS/LIB/VALIDATE-RECIPE.JS — Reine Rezept-Validierung (kein I/O)
   (Fahrplan 23, Etappe E3 — V3/V4/V5/V7)

   Reine Funktion, die ein Array von Rezept-Objekten (aus einer
   JSON-Datei) gegen die Validitätsregeln prüft. Keine Nebenwirkungen,
   kein I/O — getestet mit node:test + dem gemockten Supabase-Client.

   Validierung startet mit einem leeren Fehler-Array und sammelt
   alle Verstöße, nie nur den ersten. Rückgabe: { ok, errors } mit
   detaillierten Fehlermeldungen — kein Wurf.

   Erwartetes Eingabeformat (pro Rezept):
   {
     title: string,               // Pflicht, nicht leer
     mealType: string[],          // Pflicht, nur "breakfast"/"lunch"/"dinner"/"snack"
     dietTags: string[],          // Optional, nur "veg"/"vegan"/"glutenfrei"/"omnivor"
     containsTags: string[],      // Optional, nur gültige AllergenKeys aus nutrition-taxonomy.js
     servings: number,            // Pflicht, > 0
     ingredients: [{              // Optional, wenn vorhanden:
       name: string,              //   Pflicht
       amount: number,            //   Pflicht
       unit: string,              //   Pflicht
       category: string           //   Pflicht
     }],
     instructions: [{             // Optional, wenn vorhanden:
       text: string,              //   Pflicht
       timerSeconds: number       //   Optional
     }],
     nutrition: {                 // Optional
       kcal: number, protein: number, carbs: number, fat: number
     },
     imageUrl: string             // Optional
   }
   ============================================================ */

import { isValidAllergenKey } from "./core/nutrition-taxonomy.js";

const VALID_MEAL_TYPES = new Set(["breakfast", "lunch", "dinner", "snack"]);
const VALID_DIET_TAGS = new Set(["veg", "vegan", "glutenfrei", "omnivor"]);
const REQUIRED_INGREDIENT_FIELDS = ["name", "amount", "unit", "category"];

/**
 * Prüft, ob ein Wert ein gültiger MealType ist.
 * @param {unknown} val
 * @returns {val is "breakfast"|"lunch"|"dinner"|"snack"}
 */
function isValidMealType(val) {
  return typeof val === "string" && VALID_MEAL_TYPES.has(val);
}

/**
 * Prüft, ob ein Wert ein gültiger DietTag ist.
 * @param {unknown} val
 * @returns {val is "veg"|"vegan"|"glutenfrei"|"omnivor"}
 */
function isValidDietTag(val) {
  return typeof val === "string" && VALID_DIET_TAGS.has(val);
}

/**
 * Validiert ein Array von Rezept-Objekten.
 * @param {unknown[]} recipes  Roh-Array aus der JSON-Datei
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function validateRecipes(recipes) {
  if (!Array.isArray(recipes)) {
    return { ok: false, errors: ["Eingabe ist kein Array"] };
  }

  /** @type {string[]} */
  const errors = [];
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

    // ---- mealType ----
    const mealType = r.mealType;
    if (!Array.isArray(mealType) || mealType.length === 0) {
      errors.push(`${prefix}: mealType fehlt oder leer`);
    } else {
      for (const mt of mealType) {
        if (!isValidMealType(mt)) {
          errors.push(`${prefix}: unbekannter meal_type "${String(mt)}"`);
        }
      }
    }

    // ---- dietTags ----
    if (r.dietTags !== undefined && r.dietTags !== null) {
      if (!Array.isArray(r.dietTags)) {
        errors.push(`${prefix}: dietTags ist kein Array`);
      } else {
        for (const dt of r.dietTags) {
          if (!isValidDietTag(dt)) {
            errors.push(`${prefix}: unbekannter diet_tag "${String(dt)}"`);
          }
        }
      }
    }

    // ---- containsTags (allergen keys) ----
    if (r.containsTags !== undefined && r.containsTags !== null) {
      if (!Array.isArray(r.containsTags)) {
        errors.push(`${prefix}: containsTags ist kein Array`);
      } else {
        for (const ak of r.containsTags) {
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
            (f) => ing[f] === undefined || ing[f] === null || (typeof ing[f] === "number" && Number.isNaN(ing[f]))
          );
          if (missing.length > 0) {
            errors.push(`${iprefix}: Pflichtfelder fehlen: ${missing.join(", ")}`);
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
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true };
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