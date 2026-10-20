/* ============================================================
   CORE/RECIPE-RATING.JS — Sterne-Bewertung freigegebener Rezepte (kein I/O)
   (Fahrplan 30, B3; Entscheidungen R-1, R-3, R-4)

   Anzeige: "4,3 ★ (7)"; ohne Bewertung "noch nicht bewertet" (keine Null).
   Regeln, die auch die Datenbank erzwingt (Migration 0075): 1–5 Sterne,
   nur freigegebene Rezepte, nicht das eigene. Hier stehen sie, damit die
   Oberfläche gar nicht erst einen Knopf anbietet, der ohnehin abgelehnt würde.
   ============================================================ */

export const RATING_MIN = 1;
export const RATING_MAX = 5;
/** Wählbare Sternwerte in Anzeigereihenfolge. */
export const RATING_VALUES = Object.freeze([1, 2, 3, 4, 5]);
export const RATING_EMPTY_TEXT = "noch nicht bewertet";

/** @param {unknown} stars */
export function isValidStars(stars) {
  return Number.isInteger(stars) && stars >= RATING_MIN && stars <= RATING_MAX;
}

/**
 * "4,3 ★ (7)" — Schnitt auf eine Nachkommastelle, deutsches Komma, dahinter die
 * Anzahl. Ohne Bewertung (Anzahl 0, kein Schnitt) der Leer-Text.
 * @param {number | null | undefined} avg
 * @param {number | null | undefined} count
 * @returns {string}
 */
export function formatRating(avg, count) {
  if (!Number.isFinite(avg) || !Number.isFinite(count) || count <= 0) return RATING_EMPTY_TEXT;
  const rounded = (Math.round(avg * 10) / 10).toFixed(1).replace(".", ",");
  return `${rounded} ★ (${count})`;
}

/**
 * Darf der Athlet dieses Rezept bewerten? Nur freigegeben, nicht das eigene.
 * Ohne Anmeldung (`userId` leer) nie.
 * @param {{status?: string | null, submittedBy?: string | null} | null | undefined} recipe
 * @param {string | null | undefined} userId
 */
export function canRateRecipe(recipe, userId) {
  if (!recipe || !userId) return false;
  if (recipe.status !== "approved") return false;
  return recipe.submittedBy !== userId;
}

/**
 * Hängt Schnitt und Anzahl an die Rezepte (neue Objekte, Eingabe bleibt unverändert).
 * Rezepte ohne Eintrag bekommen `ratingAvg: null`, `ratingCount: 0`.
 * @template {{id: string}} R
 * @param {R[]} recipes
 * @param {Array<{recipeId: string, avg: number, count: number}>} stats
 * @returns {Array<R & {ratingAvg: number | null, ratingCount: number}>}
 */
export function withRatingStats(recipes, stats) {
  const byId = new Map((Array.isArray(stats) ? stats : []).map((s) => [s.recipeId, s]));
  return (Array.isArray(recipes) ? recipes : []).map((recipe) => {
    const s = byId.get(recipe.id);
    return s && s.count > 0
      ? { ...recipe, ratingAvg: s.avg, ratingCount: s.count }
      : { ...recipe, ratingAvg: null, ratingCount: 0 };
  });
}
