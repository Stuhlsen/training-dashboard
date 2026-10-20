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

/** Zeit-Filter der Rezeptliste: "bis N Min" (Fahrplan 30 B1, Z-3). */
export const PREP_FILTER_OPTIONS = Object.freeze([
  { value: 15, label: "bis 15 Min" },
  { value: 30, label: "bis 30 Min" },
  { value: 45, label: "bis 45 Min" },
]);

/** Sortierungen der Rezeptliste; "title" ist der Standard. */
export const RECIPE_SORT_OPTIONS = Object.freeze([
  { value: "title", label: "Titel A–Z" },
  { value: "fastest", label: "Schnellste" },
  { value: "best", label: "Beste Bewertung" },
]);

/** @typedef {"title"|"fastest"|"best"} RecipeSort */

/**
 * Zubereitungszeit als Text: "25 min", "1 h", "8 h 10 min". Ohne Wert (Bestand
 * ohne Schätzung) kommt null zurück, damit die Oberfläche nichts anzeigt.
 * @param {number | null | undefined} minutes
 * @returns {string | null}
 */
export function formatPrepTime(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

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
 * @typedef {{query?:string, mealType?:string|null, dietTag?:string|null, maxMinutes?:number|null}} RecipeFilters
 */

/** @param {RecipeFilters | null | undefined} filters */
export function hasActiveFilters(filters) {
  return normalizeSearch(filters?.query) !== "" || !!filters?.mealType || !!filters?.dietTag || !!filters?.maxMinutes;
}

const byTitle = (a, b) => String(a.title ?? "").localeCompare(String(b.title ?? ""), "de") || (a.id < b.id ? -1 : 1);

/** Bewertet = Anzahl > 0 und ein endlicher Schnitt; alles andere zählt als unbewertet. */
const isRated = (r) => r.ratingCount > 0 && Number.isFinite(r.ratingAvg);

/**
 * "fastest": kürzeste Zeit zuerst, Rezepte ohne Zeit zuletzt.
 * "best": höchster Schnitt zuerst, bei gleichem Schnitt mehr Bewertungen zuerst,
 * unbewertete zuletzt. Gleichstand jeweils nach Titel.
 */
function compareRecipes(a, b, sort) {
  if (sort === "fastest") {
    const am = typeof a.prepMinutes === "number" ? a.prepMinutes : Infinity;
    const bm = typeof b.prepMinutes === "number" ? b.prepMinutes : Infinity;
    if (am !== bm) return am < bm ? -1 : 1;
  }
  if (sort === "best") {
    const ar = isRated(a);
    const br = isRated(b);
    if (ar !== br) return ar ? -1 : 1;
    if (ar && a.ratingAvg !== b.ratingAvg) return b.ratingAvg - a.ratingAvg;
    if (ar && a.ratingCount !== b.ratingCount) return b.ratingCount - a.ratingCount;
  }
  return byTitle(a, b);
}

/**
 * @param {Array<object>} recipes  genehmigter Pool (ungefiltert)
 * @param {{filters?:RecipeFilters, intolerances?:string[], sort?:RecipeSort}} [params]
 * @returns {{visible:Array<object>, hiddenByIntolerance:number, available:number}}
 *   `available`: Rezepte nach den Unverträglichkeiten, vor Suche/Filter.
 */
export function browseRecipes(recipes, params = {}) {
  const { filters, intolerances, sort } = params;
  const approved = (Array.isArray(recipes) ? recipes : []).filter(
    (r) => r && (r.status == null || r.status === "approved"),
  );
  const safe = filterByIntolerances(approved, intolerances ?? []);

  const words = normalizeSearch(filters?.query).split(" ").filter(Boolean);
  const visible = safe
    .filter((r) => {
      if (filters?.mealType && !(Array.isArray(r.mealType) && r.mealType.includes(filters.mealType))) return false;
      if (filters?.dietTag && !(Array.isArray(r.dietTags) && r.dietTags.includes(filters.dietTag))) return false;
      // Rezepte ohne Zeit (Bestand ohne Schätzung) passen zu keinem "bis N Min"
      if (filters?.maxMinutes && !(typeof r.prepMinutes === "number" && r.prepMinutes <= filters.maxMinutes)) return false;
      if (words.length === 0) return true;
      const title = normalizeSearch(r.title);
      return words.every((w) => title.includes(w));
    })
    .sort((a, b) => compareRecipes(a, b, sort));

  return { visible, hiddenByIntolerance: approved.length - safe.length, available: safe.length };
}
