/* ============================================================
   CORE/RECIPE-BROWSE.JS — Suche + Filter der Rezeptliste (kein I/O)
   (Fahrplan 25, R2; Entscheidungen Q5, E19)

   Reihenfolge: genehmigt → eigene Unverträglichkeiten (hart, dieselbe
   Funktion wie im Vorschlagspool: filterByIntolerances) → Suche und
   Filter. Der Rückgabewert trennt "durch Unverträglichkeiten
   ausgeblendet" von "durch Suche/Filter ausgeblendet", damit die
   Oberfläche den richtigen Leerzustand zeigen kann.
   ============================================================ */

import { filterByIntolerances } from "./nutrition.js";

/** Ernährungsformen der Rezept-Tags (DietTag) mit Anzeigetext. */
export const DIET_FILTER_OPTIONS = Object.freeze([
  { value: "veg", label: "Vegetarisch" },
  { value: "vegan", label: "Vegan" },
  { value: "glutenfrei", label: "Glutenfrei" },
  { value: "omnivor", label: "Mit Fleisch oder Fisch" },
]);

/** Kleinbuchstaben, ohne Akzente (ä → a, ß → ss), Leerraum zusammengezogen. */
export function normalizeSearch(text) {
  return String(text ?? "")
    .toLocaleLowerCase("de")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @typedef {{query?:string, mealType?:string|null, dietTag?:string|null}} RecipeFilters
 */

/** @param {RecipeFilters | null | undefined} filters */
export function hasActiveFilters(filters) {
  return normalizeSearch(filters?.query) !== "" || !!filters?.mealType || !!filters?.dietTag;
}

/**
 * @param {Array<object>} recipes  genehmigter Pool (ungefiltert)
 * @param {{filters?:RecipeFilters, intolerances?:string[]}} [params]
 * @returns {{visible:Array<object>, hiddenByIntolerance:number, available:number}}
 *   `available`: Rezepte nach den Unverträglichkeiten, vor Suche/Filter.
 */
export function browseRecipes(recipes, params = {}) {
  const { filters, intolerances } = params;
  const approved = (Array.isArray(recipes) ? recipes : []).filter(
    (r) => r && (r.status == null || r.status === "approved"),
  );
  const safe = filterByIntolerances(approved, intolerances ?? []);

  const words = normalizeSearch(filters?.query).split(" ").filter(Boolean);
  const visible = safe
    .filter((r) => {
      if (filters?.mealType && !(Array.isArray(r.mealType) && r.mealType.includes(filters.mealType))) return false;
      if (filters?.dietTag && !(Array.isArray(r.dietTags) && r.dietTags.includes(filters.dietTag))) return false;
      if (words.length === 0) return true;
      const title = normalizeSearch(r.title);
      return words.every((w) => title.includes(w));
    })
    .sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "de") || (a.id < b.id ? -1 : 1));

  return { visible, hiddenByIntolerance: approved.length - safe.length, available: safe.length };
}
