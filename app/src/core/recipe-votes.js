/* ============================================================
   CORE/RECIPE-VOTES.JS — Daumen für Rezepte in Prüfung (kein I/O)
   (Fahrplan 30, B4; Entscheidungen R-1, R-2)

   Daumen sind nur eine Meinung für den Admin — keine automatische Freigabe.
   Regeln, die auch die Datenbank erzwingt (Migration 0076): nur Rezepte in
   Prüfung, nicht das eigene. Hier stehen sie, damit die Oberfläche gar nicht
   erst einen Knopf anbietet, der ohnehin abgelehnt würde.
   Wer wie abgestimmt hat, sieht nur der Admin und auch er nicht in dieser
   Oberfläche; für alle gibt es nur Zahlen.
   ============================================================ */

export const VOTE_UP = "up";
export const VOTE_DOWN = "down";
/** Wählbare Werte in Anzeigereihenfolge. */
export const VOTE_VALUES = Object.freeze([VOTE_UP, VOTE_DOWN]);

/** @param {unknown} vote */
export function isValidVote(vote) {
  return vote === VOTE_UP || vote === VOTE_DOWN;
}

/**
 * Darf der Athlet auf dieses Rezept einen Daumen geben? Nur Rezepte in Prüfung,
 * nicht das eigene. Ohne Anmeldung (`userId` leer) nie.
 * @param {{status?: string | null, submittedBy?: string | null} | null | undefined} recipe
 * @param {string | null | undefined} userId
 */
export function canVoteRecipe(recipe, userId) {
  if (!recipe || !userId) return false;
  if (recipe.status !== "pending") return false;
  return recipe.submittedBy !== userId;
}

/**
 * "3 dafür · 1 dagegen"; ohne Daumen "noch keine Daumen".
 * @param {number | null | undefined} up
 * @param {number | null | undefined} down
 * @returns {string}
 */
export function formatVoteCounts(up, down) {
  const u = Number.isFinite(up) && up > 0 ? up : 0;
  const d = Number.isFinite(down) && down > 0 ? down : 0;
  if (u === 0 && d === 0) return "noch keine Daumen";
  return `${u} dafür · ${d} dagegen`;
}

/**
 * Hängt die Daumen-Zahlen an die Rezepte (neue Objekte, Eingabe bleibt unverändert).
 * Rezepte ohne Eintrag bekommen `voteUp: 0`, `voteDown: 0`.
 * @template {{id: string}} R
 * @param {R[]} recipes
 * @param {Array<{recipeId: string, up: number, down: number}>} stats
 * @returns {Array<R & {voteUp: number, voteDown: number}>}
 */
export function withVoteStats(recipes, stats) {
  const byId = new Map((Array.isArray(stats) ? stats : []).map((s) => [s.recipeId, s]));
  return (Array.isArray(recipes) ? recipes : []).map((recipe) => {
    const s = byId.get(recipe.id);
    return { ...recipe, voteUp: s?.up ?? 0, voteDown: s?.down ?? 0 };
  });
}
