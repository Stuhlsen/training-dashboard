/* ============================================================
   CORE/GOAL-HOURS.JS — Stunden-Vorschlag für eine dazukommende Sportart
   (Fahrplan 44 E7, Entscheidungen M2/M3)

   Reine Berechnung (kein I/O). Nimmt die aktiven Ziele und liefert die
   Vorbelegung der Wochenstunden. Nur ein VORSCHLAG: der Nutzer ändert die
   Zahl frei. Rad bleibt immer unberührt (M3), der Sportfilter aus Fahrplan 43
   (`goalsForSport`) gilt auch hier — ein Ziel wirkt nur auf passende Sportarten.
   ============================================================ */

import { goalPlanProfile, goalsForSport } from "./goals.js";

/** Niedriger Start in Stunden pro Woche, wenn das Ziel einen niedrigen
 *  Startumfang vorsieht (`lowStartVolume`). Nur Laufen hat heute so ein Ziel
 *  („Laufen starten"). eigene Festlegung, nicht belegt */
export const LOW_START_HOURS = Object.freeze({ run: 2 });

/**
 * @typedef {Object} HoursSuggestion
 * @property {number} hours       vorgeschlagene Wochenstunden
 * @property {boolean} fromGoal   true, wenn ein Ziel den Wert geändert hat
 * @property {string|null} goalKey  das Ziel, das ihn geändert hat
 */

/**
 * @param {Object} args
 * @param {"ride"|"run"|"swim"} args.sport
 * @param {number} args.defaultHours  heutige Vorbelegung
 * @param {{goalKey?: string|null}|null} [args.main]
 * @param {{goalKey?: string|null}|null} [args.side]
 * @returns {HoursSuggestion}
 */
export function suggestSportHours({ sport, defaultHours, main, side }) {
  const unchanged = { hours: defaultHours, fromGoal: false, goalKey: null };
  if (sport === "ride") return unchanged;

  const cap = LOW_START_HOURS[sport];
  if (cap == null || cap >= defaultHours) return unchanged;

  const fit = goalsForSport({ main, side }, sport);
  const cause = [fit.main, fit.side].find((goal) => goal && goalPlanProfile(goal, null).lowStartVolume);
  if (!cause) return unchanged;
  return { hours: cap, fromGoal: true, goalKey: cause.goalKey ?? null };
}
