/* ============================================================
   CORE/SESSION-GUIDE-KEY.JS — Welcher Guide-Text passt zu einer
   Trainingskarte? (rein, kein DOM, kein I/O)
   (Fahrplan 34, Etappe E1, Vertrag V2)

   Plankarten tragen nur `typ` + `workoutStructure`, keine `formatId`.
   Die Format-Familie wird darum hier abgeleitet statt gespeichert — das
   gilt sofort auch für schon gespeicherte Karten und braucht keine
   Migration. Unbekannter Typ → `null` = kein Guide (die Karte bleibt
   unverändert).

   E1 kennt nur Rad (`sport` fehlt oder `ride`). Lauf/Schwimmen: E6.

   Die `typ`-Strings sind gegen sports/cycling/session-types.ts
   (KNOWN_PLAN_TYPES), plan-workout-select.js::PHASE_PLAN,
   plan-generator-sport.js und die Demo-Daten geprüft. Typen ohne
   Guide-Text bleiben bewusst `null` (nicht raten): Z2 Kadenz,
   Z2 Erholung, Z2, Tempo, Ausrollen, Einrollen, Gruppenfahrt, Etappe,
   Rennen, Race, Freestyle, Ausserplanmaessig/Außerplanmäßig.
   ============================================================ */

import { usableStructure } from "./workout-structure-format.js";

/** Normalisierter Typ (klein, Leerraum gekappt) → Schlüssel ohne Struktur-Unterscheidung. */
const KEY_BY_TYP = Object.freeze({
  "sweet spot": "ride:sweetspot-long",
  schwelle: "ride:threshold-long",
  vo2max: "ride:vo2-long",
  "ftp-test": "ride:ftp-test",
  "z2 lang": "ride:z2-lang",
  "z2 dauer": "ride:z2-dauer",
  "z1 recovery": "ride:z1-recovery",
});

/** Typen, bei denen ein `alternating`-Schritt die Familie wechselt. */
const ALTERNATING_KEY = Object.freeze({
  "ride:threshold-long": "ride:over-under",
  "ride:vo2-long": "ride:vo2-short",
});

/** @param {unknown} card */
function stepsOf(card) {
  const structure = usableStructure(/** @type {any} */ (card));
  return structure && Array.isArray(structure.steps) ? structure.steps : [];
}

/**
 * Schlüssel `${sport}:${familie|typ}` der Karte oder `null`.
 * @param {{typ?: unknown, sport?: unknown, workout?: unknown, workoutStructure?: unknown}|null|undefined} card
 * @returns {string|null}
 */
export function guideKeyFor(card) {
  if (!card || typeof card.typ !== "string") return null;
  if (card.sport != null && card.sport !== "ride") return null;
  const base = KEY_BY_TYP[/** @type {keyof typeof KEY_BY_TYP} */ (card.typ.trim().toLowerCase())];
  if (!base) return null;
  const alternatingKey = ALTERNATING_KEY[/** @type {keyof typeof ALTERNATING_KEY} */ (base)];
  if (alternatingKey && stepsOf(card).some((s) => s.kind === "alternating")) return alternatingKey;
  return base;
}

/** Enthält die Karte einen Sprint-Schritt (`target: "max"`)? Dann kommt
 *  zusätzlich die Cue-Zeile aus `ride:sprint-accessory` dazu.
 *  @param {{workout?: unknown, workoutStructure?: unknown}|null|undefined} card
 *  @returns {boolean} */
export function hasSprintStep(card) {
  return stepsOf(card).some((s) => s.work?.target === "max");
}
