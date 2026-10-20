/* ============================================================
   DEMO/LIB/EPOCH.JS — Epoche der Saison-Zyklen aus dem Startwert
   (Fahrplan 31 E3, Grilling 2026-10-20: Option A)
   Q19: ein anderer Startwert verschiebt die Epoche und damit den Abstand
   zum nächsten Rennen. Basis-Montag + (hash(seed) mod 12) Wochen — so
   ergibt jeder Startwert einen der 12 möglichen Rennabstände. Gemeinsam
   genutzt von demo:generate (E3) und demo:seed/demo:reset (E4).
   Reines Rechnen, kein Import aus app/.
   ============================================================ */

import { hashString } from "./prng.js";

/** Fester Basis-Montag. */
export const EPOCH_BASE = "2025-01-06";

const WEEKS_PER_CYCLE = 12;
const DAY_MS = 86_400_000;

/**
 * @param {string|number} seed
 * @returns {string} ISO-Datum (Montag)
 */
export function epochForSeed(seed) {
  const offsetWeeks = hashString(`epoch|${seed}`) % WEEKS_PER_CYCLE;
  const base = Date.parse(`${EPOCH_BASE}T00:00:00Z`);
  return new Date(base + offsetWeeks * 7 * DAY_MS).toISOString().slice(0, 10);
}
