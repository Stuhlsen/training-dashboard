/* ============================================================
   SCRIPTS/LIB/RECIPE-COVERAGE.JS — Abdeckung und Mischung des Rezept-Bestands
   (Fahrplan 23, Etappe E3c, Entscheidung E27; kein I/O)

   Prüft, ob der Bestand für jeden Slot genug Auswahl lässt, auch wenn
   ein Allergen ausgeschlossen wird. Gefiltert wird mit der echten
   App-Funktion filterByIntolerances (app/src/core/nutrition.js), nicht
   mit einer Nachbildung — so kann die Prüfung nicht von der App abdriften.
   ============================================================ */

import { filterByIntolerances } from "../../app/src/core/nutrition.js";
import { ALLERGEN_TAXONOMY } from "./core/nutrition-taxonomy.js";

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"];
/** Mindestanzahl Rezepte je Slot nach dem Allergen-Filter (E27). */
export const MIN_PER_SLOT = 3;

/** Die 14 EU-Hauptallergene (ohne den Freitext-Marker). */
export const EU_ALLERGENS = ALLERGEN_TAXONOMY.filter((e) => !e.isFreetext).map((e) => e.key);

/** Zählt Rezepte je Slot. */
function countBySlot(recipes) {
  const counts = Object.fromEntries(SLOTS.map((s) => [s, 0]));
  for (const r of recipes) for (const s of r.meal_type) if (s in counts) counts[s] += 1;
  return counts;
}

/**
 * Anzahl verbleibender Rezepte je Slot, wenn ein Allergen ausgeschlossen wird.
 * @param {Array<{meal_type:string[], contains_tags:string[]}>} recipes
 * @param {string[]} [excluded]  Allergen-Schlüssel (leer = Gesamtbestand)
 * @returns {Record<string, number>}
 */
export function slotCounts(recipes, excluded = []) {
  const adapted = recipes.map((r) => ({ ...r, containsTags: r.contains_tags }));
  return countBySlot(filterByIntolerances(adapted, excluded));
}

/**
 * Abdeckung je Allergen und Slot.
 * @param {Array<{meal_type:string[], contains_tags:string[]}>} recipes
 * @returns {{ total: Record<string, number>, perAllergen: Record<string, Record<string, number>>, shortfalls: string[] }}
 */
export function coverageReport(recipes) {
  const perAllergen = {};
  const shortfalls = [];
  for (const key of EU_ALLERGENS) {
    perAllergen[key] = slotCounts(recipes, [key]);
    for (const slot of SLOTS) {
      if (perAllergen[key][slot] < MIN_PER_SLOT) {
        shortfalls.push(`${key} / ${slot}: ${perAllergen[key][slot]} (< ${MIN_PER_SLOT})`);
      }
    }
  }
  return { total: slotCounts(recipes), perAllergen, shortfalls };
}

const share = (n, total) => (total === 0 ? 0 : n / total);

/**
 * Mischungs-Kennzahlen nach E27 (Anteile 0..1).
 * @param {Array<any>} recipes  Seed-Rezepte
 * @param {Map<string, {minutes?:number, cycling?:boolean}>} meta  Titel → Zusatzdaten
 */
export function mixReport(recipes, meta) {
  const n = recipes.length;
  const has = (r, tag) => r.diet_tags.includes(tag);
  const quick = recipes.filter((r) => (meta.get(r.title)?.minutes ?? Infinity) <= 30).length;
  return {
    count: n,
    vegOrVegan: share(recipes.filter((r) => has(r, "veg")).length, n),
    glutenFree: share(recipes.filter((r) => !r.contains_tags.includes("gluten")).length, n),
    lactoseFree: share(recipes.filter((r) => !r.contains_tags.includes("milk")).length, n),
    quick30: share(quick, n),
    cycling: share(recipes.filter((r) => meta.get(r.title)?.cycling).length, n),
    slots: countBySlot(recipes),
  };
}
