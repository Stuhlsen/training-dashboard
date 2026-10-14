/* ============================================================
   SCRIPTS/LIB/RECIPE-NUTRITION.JS — Nährwerte und Tags aus Zutaten (kein I/O)
   (Fahrplan 23, Etappe E3c, Entscheidungen E24/E26)

   Reine Funktionen: Aus einem Quellrezept und der Zutatentabelle
   (scripts/lib/ingredient-nutrition.json) werden
     - nutrition pro Portion (kcal, protein, carbs, fat),
     - contains_tags (Vereinigung der Allergen-Schlüssel aller Zutaten),
     - diet_tags (veg / vegan / glutenfrei / omnivor)
   abgeleitet. Nichts davon wird von Hand gesetzt (E26): Eine Zutat, die
   nicht in der Tabelle steht oder deren Einheit nicht umgerechnet werden
   kann, ist ein Fehler — kein stilles Raten.

   Quellrezept (Eingabe):
   {
     title, meal_type[], servings, minutes?, cycling?,
     ingredients: [[name, amount, unit, category?]],
     instructions: [string | [string, timerSeconds]],
     image_url?
   }
   Seed-Rezept (Ausgabe, snake_case = DB-Spaltennamen): siehe
   scripts/lib/validate-recipe.js.
   ============================================================ */

import { ALLERGEN_TAXONOMY, isValidAllergenKey } from "./core/nutrition-taxonomy.js";

/** Tiers, die ein Rezept nicht-vegetarisch machen. */
const NON_VEG_TIERS = new Set(["meat", "fish"]);
/** Tiers, die ein vegetarisches Rezept nicht vegan machen. */
const NON_VEGAN_TIERS = new Set(["dairy", "egg", "honey"]);
const MACROS = ["kcal", "protein", "carbs", "fat"];

/**
 * Prüft die Zutatentabelle auf Pflichtfelder und gültige Allergen-Schlüssel.
 * @param {{zutaten?: Record<string, any>}} table
 * @returns {string[]} Fehlerliste (leer = in Ordnung)
 */
export function validateIngredientTable(table) {
  const errors = [];
  const zutaten = table?.zutaten;
  if (!zutaten || typeof zutaten !== "object") return ["Tabelle ohne 'zutaten'"];
  for (const [name, z] of Object.entries(zutaten)) {
    for (const m of MACROS) {
      if (typeof z[m] !== "number" || Number.isNaN(z[m]) || z[m] < 0) {
        errors.push(`${name}: ${m} fehlt oder ungültig`);
      }
    }
    if (!Array.isArray(z.allergene) || !z.allergene.every(isValidAllergenKey)) {
      errors.push(`${name}: allergene fehlt oder enthält ungültigen Schlüssel`);
    }
    if (typeof z.quelle !== "string" || !/^(BLS|USDA-FDC):/.test(z.quelle)) {
      errors.push(`${name}: quelle fehlt (BLS:<Code> oder USDA-FDC:<Id>)`);
    }
    if (typeof z.kategorie !== "string" || z.kategorie === "") {
      errors.push(`${name}: kategorie fehlt`);
    }
  }
  return errors;
}

/**
 * Rechnet eine Menge in Gramm um.
 * @param {number} amount
 * @param {string} unit
 * @param {{einheiten?: Record<string, number>}} entry
 * @returns {number|null} Gramm, oder null wenn die Einheit unbekannt ist
 */
export function toGrams(amount, unit, entry) {
  if (unit === "g") return amount;
  const factors = entry.einheiten ?? {};
  if (unit === "ml") return amount * (factors.ml ?? 1);
  return typeof factors[unit] === "number" ? amount * factors[unit] : null;
}

/** Sortiert Allergen-Schlüssel in Taxonomie-Reihenfolge (deterministisch). */
function sortByTaxonomy(keys) {
  return ALLERGEN_TAXONOMY.map((e) => e.key).filter((k) => keys.has(k));
}

/**
 * Leitet die Diät-Tags aus Tiers und Gluten-Allergen ab.
 * Konvention wie im bestehenden Bestand: vegan = ["veg","vegan"],
 * Fleisch/Fisch = ["omnivor"].
 * @param {Set<string>} tiers
 * @param {Set<string>} allergens
 * @returns {string[]}
 */
export function deriveDietTags(tiers, allergens) {
  const tags = [];
  const isVeg = ![...tiers].some((t) => NON_VEG_TIERS.has(t));
  if (!isVeg) tags.push("omnivor");
  else {
    tags.push("veg");
    if (![...tiers].some((t) => NON_VEGAN_TIERS.has(t))) tags.push("vegan");
  }
  if (!allergens.has("gluten")) tags.push("glutenfrei");
  return tags;
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Berechnet ein Seed-Rezept aus einem Quellrezept.
 * @param {any} src
 * @param {{zutaten: Record<string, any>}} table
 * @returns {{ ok: true, recipe: any } | { ok: false, errors: string[] }}
 */
export function buildRecipe(src, table) {
  const errors = [];
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const allergens = new Set();
  const tiers = new Set();
  const ingredients = [];

  for (const [name, amount, unit, givenCategory] of src.ingredients ?? []) {
    const entry = table.zutaten[name];
    if (!entry) {
      errors.push(`${src.title}: Zutat "${name}" nicht in der Tabelle`);
      continue;
    }
    const grams = toGrams(amount, unit, entry);
    if (grams === null) {
      errors.push(`${src.title}: Einheit "${unit}" für "${name}" nicht umrechenbar`);
      continue;
    }
    if (givenCategory && givenCategory !== entry.kategorie) {
      errors.push(
        `${src.title}: Kategorie "${givenCategory}" ≠ Tabelle "${entry.kategorie}" bei "${name}"`
      );
    }
    for (const m of MACROS) totals[m] += (grams / 100) * entry[m];
    entry.allergene.forEach((a) => allergens.add(a));
    if (entry.tier) tiers.add(entry.tier);
    ingredients.push({ name, amount, unit, category: entry.kategorie });
  }
  if (errors.length > 0) return { ok: false, errors };

  const perServing = (v) => v / src.servings;
  return {
    ok: true,
    recipe: {
      title: src.title,
      meal_type: src.meal_type,
      diet_tags: deriveDietTags(tiers, allergens),
      contains_tags: sortByTaxonomy(allergens),
      servings: src.servings,
      ingredients,
      instructions: (src.instructions ?? []).map(toInstruction),
      nutrition: {
        kcal: Math.round(perServing(totals.kcal)),
        protein: round1(perServing(totals.protein)),
        carbs: round1(perServing(totals.carbs)),
        fat: round1(perServing(totals.fat)),
      },
      ...(src.image_url ? { image_url: src.image_url } : {}),
    },
  };
}

function toInstruction(step) {
  if (typeof step === "string") return { text: step };
  const [text, timerSeconds] = step;
  return { text, timerSeconds };
}

/**
 * Aufschlüsselung je Zutat (für die Stichproben-Prüfung durch Menschen):
 * Gramm, kcal-Anteil für das ganze Rezept, Quelle und Allergene.
 * @param {any} src  Quellrezept
 * @param {{zutaten: Record<string, any>}} table
 * @returns {Array<{name:string, amount:number, unit:string, grams:number, kcal:number, quelle:string, allergene:string[], tier?:string}>}
 */
export function explainIngredients(src, table) {
  return (src.ingredients ?? []).map(([name, amount, unit]) => {
    const entry = table.zutaten[name];
    const grams = toGrams(amount, unit, entry);
    return {
      name,
      amount,
      unit,
      grams: Math.round(grams * 10) / 10,
      kcal: Math.round((grams / 100) * entry.kcal),
      quelle: entry.quelle,
      allergene: entry.allergene,
      ...(entry.tier ? { tier: entry.tier } : {}),
    };
  });
}

/**
 * Baut alle Rezepte; sammelt Fehler statt beim ersten abzubrechen.
 * @param {any[]} sources
 * @param {{zutaten: Record<string, any>}} table
 * @returns {{ recipes: any[], errors: string[] }}
 */
export function buildAll(sources, table) {
  const recipes = [];
  const errors = [];
  for (const src of sources) {
    const res = buildRecipe(src, table);
    if (res.ok) recipes.push(res.recipe);
    else errors.push(...res.errors);
  }
  return { recipes, errors };
}
