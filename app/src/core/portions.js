/* ============================================================
   CORE/PORTIONS.JS — Portionen beim Kochen (Fahrplan 30, B2)

   Reine Berechnung, kein DOM/fetch. Ein Plan-Eintrag trägt zwei Zahlen:
     servings       eigene Portionen — nur sie zählen für kcal/Eiweiß
     extraServings  Gäste-Portionen — zählen für Kochmenge + Einkaufsliste
   Im Kochmodus wählt man die GESAMT-Portionen (eigene + Gäste) und
   splitPortions teilt sie wieder auf.
   ============================================================ */

/** Schrittweite des Steppers im Kochmodus */
export const COOK_PORTION_STEP = 0.5;
/** Untergrenze der Gesamt-Portionen */
export const COOK_PORTION_MIN = 0.5;
/** Obergrenze der Gesamt-Portionen (eigene + Gäste) */
export const COOK_PORTION_MAX = 12;
/** Eigener Anteil, wenn ein Rezept neu in den Plan kommt */
export const DEFAULT_OWN_SERVINGS = 1;

/** Auf halbe Portionen runden (Gleitkomma-Reste wie 2.5000000001 entfernen) */
function toHalf(n) {
  return Math.round(n / COOK_PORTION_STEP) * COOK_PORTION_STEP;
}

/**
 * Gesamt-Portionen in den erlaubten Bereich zwingen (0,5 … 12, Halbschritte).
 * Ungültige Eingaben (NaN, nicht endlich) fallen auf die Untergrenze.
 * @param {number} total
 * @returns {number}
 */
export function clampCookPortions(total) {
  if (typeof total !== "number" || !Number.isFinite(total)) return COOK_PORTION_MIN;
  return Math.min(COOK_PORTION_MAX, Math.max(COOK_PORTION_MIN, toHalf(total)));
}

/**
 * Einen Stepper-Schritt weiter (direction = 1) oder zurück (-1), geklemmt.
 * @param {number} total
 * @param {1|-1} direction
 * @returns {number}
 */
export function stepCookPortions(total, direction) {
  return clampCookPortions(clampCookPortions(total) + direction * COOK_PORTION_STEP);
}

/**
 * Gesamt-Portionen eines Plan-Eintrags (eigene + Gäste).
 * @param {{ servings: number, extraServings?: number }} entry
 * @returns {number}
 */
export function totalPortions(entry) {
  return entry.servings + (entry.extraServings ?? 0);
}

/**
 * Gesamt-Portionen auf eigene und Gäste-Portionen aufteilen. Der eigene Anteil
 * bleibt `ownServings`, höchstens aber das Ganze; alles darüber sind Gäste.
 * @param {number} total  Gesamt-Portionen (> 0)
 * @param {number} [ownServings]  bisheriger eigener Anteil
 * @returns {{ servings: number, extraServings: number }}
 */
export function splitPortions(total, ownServings = DEFAULT_OWN_SERVINGS) {
  const all = clampCookPortions(total);
  const own = Math.min(all, Math.max(COOK_PORTION_MIN, toHalf(ownServings)));
  return { servings: own, extraServings: all - own };
}

/**
 * Der Plan-Eintrag, auf den sich das Kochen eines Rezepts bezieht: der
 * früheste Eintrag ab heute (heute zuerst). Vergangene Einträge zählen nicht.
 * @template {{ recipeId: string, date: string }} E
 * @param {ReadonlyArray<E>} entries
 * @param {string} recipeId
 * @param {string} todayISO  YYYY-MM-DD
 * @returns {E | null}
 */
export function findPlanEntryForRecipe(entries, recipeId, todayISO) {
  const upcoming = entries
    .filter((e) => e.recipeId === recipeId && e.date >= todayISO)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}
