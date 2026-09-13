/* ============================================================
   CORE/PLAN-WORKOUT-SELECT-GENERIC.JS — Qualitätstag-Workout Lauf/Schwimm
   (kein DOM, kein I/O, kein React)

   Fahrplan 14 E2/E3 (planning/fahrplan-14-plan-generator-multisport.md,
   Vertrag V4). Pendant zu plan-workout-select.js::selectWorkout() für
   Nicht-Rad-Sportarten — bewusst OHNE session_formats-/Ladder-Maschinerie
   (Nicht-Ziel: keine Wochen-für-Wochen-Progressionsstufen für Lauf/Schwimm).
   Wählt nur einen zur Periodisierungsphase passenden Typ aus
   RUNNING_PHASE_SIGNATURES/SWIMMING_PHASE_SIGNATURES und skaliert Dauer/TRIMP
   auf die vom Aufrufer vorgegebenen Zielwerte. `workoutStructure` bleibt
   immer `null` (kein .zwo-Export für Lauf/Schwimm in v1).

   Sowohl von SWIM_STRATEGY (Fahrplan 14 E3) als auch künftig von
   RUN_STRATEGY (E2) genutzt — EIN geteiltes Modul statt einer Kopie je
   Sportart (Vertrag V4, s. Fahrplan-Etappengraph).
   ============================================================ */

import { runningSessionTypes } from "../sports/running/session-types.js";
import { swimmingSessionTypes } from "../sports/swimming/session-types.js";

/** @type {Record<"run"|"swim", object>} */
const SESSION_TYPES = { run: runningSessionTypes, swim: swimmingSessionTypes };

/** Intensitätsband je Phase, als Anteil der Schwellengeschwindigkeit (1,0 =
 *  Schwelle — dieselbe Anker-Konvention wie runningZones/swimmingZones).
 *  UNKALIBRIERT wie das gesamte Lauf-/Schwimm-Zonen-Gerüst (Fahrplan 10) —
 *  grober, dreistufiger Korridor, keine neue Kalibrierung (Fahrplan-14-
 *  Nicht-Ziel). Unbekannte Phase (z. B. "Taper", für Lauf/Schwimm derzeit
 *  ungenutzt) fällt auf "Grundlage" zurück. */
const PHASE_PCT_BAND = Object.freeze({
  Grundlage: /** @type {[number,number]} */ ([70, 85]),
  Schwelle: /** @type {[number,number]} */ ([95, 103]),
  VO2max: /** @type {[number,number]} */ ([104, 115]),
  // Taper hat kein eigenes Lauf-/Schwimm-Vokabular (anders als Rad, s.
  // plan-workout-select.js::PHASE_PLAN.Taper) — bewusste v1-Vereinfachung,
  // kein Versehen: die Lastreduktion im Taper passiert bereits generisch
  // über computeWeekTargets() (plan-generator.js, targetTss sinkt), ein
  // eigenes Taper-Typvokabular für Lauf/Schwimm wäre echte Kalibrierung
  // (Fahrplan-14-Nicht-Ziel). Explizit auf Grundlage-Intensität gemappt,
  // NICHT über den generischen "unbekannte Phase"-Fallback in pickType().
  Taper: /** @type {[number,number]} */ ([70, 85]),
});

/** [lo,hi] km/h-Band aus einem %-Band der Schwellengeschwindigkeit — Pendant
 *  zu wattBand() (plan-generator-sport.js) für Rad.
 *  @param {[number,number]} pct @param {number|null} thresholdSpeed km/h
 *  @returns {[number,number]|undefined} */
export function speedBand(pct, thresholdSpeed) {
  if (thresholdSpeed == null) return undefined;
  return [
    Math.round((pct[0] / 100) * thresholdSpeed * 100) / 100,
    Math.round((pct[1] / 100) * thresholdSpeed * 100) / 100,
  ];
}

/** Zur Phase passender Typ: `qualitySlot` 1 → erster in
 *  `phaseSignatures[phase].types`, 2 → zweiter (wenn vorhanden, sonst wieder
 *  der erste). "Taper" hat wie in PHASE_PCT_BAND kein eigenes Vokabular und
 *  fällt bewusst auf "Grundlage" zurück (dieselbe v1-Vereinfachung).
 *  @param {object} sessionTypes @param {string} phase @param {1|2} qualitySlot
 *  @returns {string} */
function pickType(sessionTypes, phase, qualitySlot) {
  const sig = sessionTypes.phaseSignatures[phase] || sessionTypes.phaseSignatures.Grundlage;
  const types = (sig && sig.types) || sessionTypes.known;
  const idx = qualitySlot === 2 && types.length > 1 ? 1 : 0;
  return types[idx] ?? types[0] ?? sessionTypes.known[0];
}

/**
 * Wählt das Qualitätstag-Workout für eine Plan-Woche — Lauf/Schwimm-Pendant
 * zu plan-workout-select.js::selectWorkout(). Rein deterministisch, keine
 * Ladder-Stufe (V4-Vertrag).
 * @param {Object} args
 * @param {"run"|"swim"} args.sport
 * @param {string} args.phase  "Grundlage" | "Schwelle" | "VO2max" (Fahrplan-14-Vokabular)
 * @param {1|2} [args.qualitySlot]  erster / zweiter Qualitätstag der Woche
 * @param {number|null} [args.currentThresholdSpeed]  km/h
 * @param {number} [args.targetDurationMin]
 * @param {number} [args.targetTss]  TRIMP-Zielwert der Karte
 * @returns {{name:string, typ:string, workout:object, workoutStructure:null, tssPlanned:number, durationMin:number}}
 */
export function selectGenericWorkout({
  sport,
  phase,
  qualitySlot = 1,
  currentThresholdSpeed = null,
  targetDurationMin = 0,
  targetTss = 0,
} = {}) {
  const sessionTypes = SESSION_TYPES[sport];
  if (!sessionTypes) {
    throw new Error(`selectGenericWorkout: unbekannte Sportart "${sport}" (nur "run"/"swim").`);
  }
  const typ = pickType(sessionTypes, phase, qualitySlot);
  const durationMin = Math.max(15, Math.round(targetDurationMin));
  const tssPlanned = Math.max(1, Math.round(targetTss));
  const pct = PHASE_PCT_BAND[phase] || PHASE_PCT_BAND.Grundlage;
  const band = speedBand(pct, currentThresholdSpeed);

  const workout = {
    duration: durationMin,
    zone: phase,
    pct,
    ...(band ? { speedTarget: band } : {}),
    label: typ,
  };

  return {
    name: typ,
    typ,
    workout,
    workoutStructure: null,
    tssPlanned,
    durationMin,
  };
}
