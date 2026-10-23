/* ============================================================
   CORE/SESSION-GUIDE-KEY.JS — Welcher Guide-Text passt zu einer
   Trainingskarte? (rein, kein DOM, kein I/O)
   (Fahrplan 34, Etappe E1, Vertrag V2)

   Plankarten tragen nur `typ` + `workoutStructure`, keine `formatId`.
   Die Format-Familie wird darum hier abgeleitet statt gespeichert — das
   gilt sofort auch für schon gespeicherte Karten und braucht keine
   Migration. Unbekannter Typ → `null` = kein Guide (die Karte bleibt
   unverändert).

   Rad (`sport` fehlt oder `ride`) wird über Typ + Struktur abgeleitet, Lauf
   und Schwimmen (E6) nur über den Typ: ihre Karten tragen keine
   `workoutStructure` im Rad-Format. Ein Typ gilt nur für seine Sportart.

   Die `typ`-Strings sind gegen sports/cycling/session-types.ts
   (KNOWN_PLAN_TYPES), plan-workout-select.js::PHASE_PLAN,
   plan-generator-sport.js und die Demo-Daten geprüft. Typen ohne
   Guide-Text bleiben bewusst `null` (nicht raten): Z2 Kadenz,
   Z2 Erholung, Z2, Tempo, Ausrollen, Einrollen, Gruppenfahrt, Etappe,
   Rennen, Race, Freestyle, Ausserplanmaessig/Außerplanmäßig.
   ============================================================ */

import { usableStructure } from "./workout-structure-format.js";

/** Normalisierter Typ (klein, Leerraum gekappt) → Schlüssel ohne Struktur-Unterscheidung,
 *  je Sportart. Lauf-/Schwimm-Typen stehen in sports/{running,swimming}/session-types.ts;
 *  "Rekom" bekommt bewusst keinen Guide (nicht raten). */
const KEY_BY_TYP = Object.freeze({
  ride: Object.freeze({
    "sweet spot": "ride:sweetspot-long",
    schwelle: "ride:threshold-long",
    vo2max: "ride:vo2-long",
    "ftp-test": "ride:ftp-test",
    "z2 lang": "ride:z2-lang",
    "z2 dauer": "ride:z2-dauer",
    "z1 recovery": "ride:z1-recovery",
  }),
  run: Object.freeze({
    dauerlauf: "run:dauerlauf",
    longrun: "run:longrun",
    tempolauf: "run:tempolauf",
    intervalle: "run:intervalle",
  }),
  swim: Object.freeze({
    longswim: "swim:longswim",
    technik: "swim:technik",
    intervalle: "swim:intervalle",
  }),
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
  const sport = card.sport == null ? "ride" : card.sport;
  if (typeof sport !== "string" || !Object.hasOwn(KEY_BY_TYP, sport)) return null;
  const typ = card.typ.trim().toLowerCase();
  const table = KEY_BY_TYP[/** @type {keyof typeof KEY_BY_TYP} */ (sport)];
  const base = Object.hasOwn(table, typ) ? table[/** @type {keyof typeof table} */ (typ)] : null;
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
