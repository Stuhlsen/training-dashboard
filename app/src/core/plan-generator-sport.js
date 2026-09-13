/* ============================================================
   CORE/PLAN-GENERATOR-SPORT.JS — Sport-Strategie-Tabelle für generatePlan()
   (kein DOM, kein I/O, kein React)

   Fahrplan 14 E1 (planning/fahrplan-14-plan-generator-multisport.md, Vertrag
   V1). Kapselt alles, was zwischen Rad/Lauf/Schwimm variiert (Workout-Band-
   Funktion, Testtag-Regel + -Karte, Quality-Day-Auswahl), damit
   plan-generator.js selbst sportagnostisch bleibt.

   `RIDE_STRATEGY` ist 1:1 das bisherige Rad-Verhalten aus plan-generator.js
   (vor E1 hart im Modul) — nur hinter dieser Tabelle statt hart im Code.
   `RUN_STRATEGY`/`SWIM_STRATEGY` sind Platzhalter (`null`): E2/E3 befüllen
   sie mit den analogen Speed-Band-/Quality-Day-Strategien aus
   `sports/running/`/`sports/swimming/`. `getSportStrategy()` wirft für sie
   bewusst, statt still auf Rad zurückzufallen — ein Aufruf mit
   `sport: "run"|"swim"` vor E2/E3 ist ein Programmierfehler, kein
   Laufzeit-Sonderfall.
   ============================================================ */

import { diffDays } from "./format.js";
import { TYPE_DEFAULT_TSS } from "../sports/cycling/session-types.js";
import { selectWorkout } from "./plan-workout-select.js";

/** Zwei Nachkommastellen als [lo,hi]-Watt-Band aus einem %-Band.
 *  @param {[number,number]} pct @param {number|null} ftp @returns {[number,number]|undefined} */
function wattBand(pct, ftp) {
  if (ftp == null) return undefined;
  return [Math.round((pct[0] / 100) * ftp), Math.round((pct[1] / 100) * ftp)];
}

/** Wochen-Indizes mit FTP-Testtag (Fahrplan 8, Entscheidung 23): Start bei
 *  veralteter/fehlender FTP, danach alle 7 Wochen, plus die letzte Woche.
 *  @param {number} totalWeeks @param {string} startDate @param {string|null} measuredDate
 *  @param {number} [fromIndex]  E13: in der Restberechnung keine Testtage vor dieser Woche
 *  @returns {Set<number>} */
function ftpTestWeeks(totalWeeks, startDate, measuredDate, fromIndex = 0) {
  const set = new Set();
  if (!measuredDate || diffDays(startDate, measuredDate) > 42) set.add(0);
  for (let i = 7; i < totalWeeks; i += 7) set.add(i);
  set.add(totalWeeks - 1);
  if (fromIndex > 0) for (const i of [...set]) if (i < fromIndex) set.delete(i);
  return set;
}

/** Rad-Strategie — funktional unverändert gegenüber dem Vor-E1-Verhalten von
 *  plan-generator.js. `testCard` ist die feste Kartenvorlage für den
 *  FTP-Testtag (`workout`/`workoutStructure` setzt der Aufrufer auf `null`). */
export const RIDE_STRATEGY = Object.freeze({
  sport: "ride",
  wattBand,
  selectWorkout,
  testWeeks: ftpTestWeeks,
  testCard: Object.freeze({
    name: "FTP-Test (20 min)",
    typ: "FTP-Test",
    tssPlanned: TYPE_DEFAULT_TSS["FTP-Test"],
    durationMin: 55,
  }),
});

/** Platzhalter — E2 befüllt die Lauf-Strategie (Speed-Band, `selectGenericWorkout()`,
 *  keine Testtage, `sports/running/*`). */
export const RUN_STRATEGY = null;

/** Platzhalter — E3 befüllt die Schwimm-Strategie (analog `RUN_STRATEGY`,
 *  `sports/swimming/*`). */
export const SWIM_STRATEGY = null;

/** @type {Record<"ride"|"run"|"swim", object|null>} */
const SPORT_STRATEGIES = Object.freeze({
  ride: RIDE_STRATEGY,
  run: RUN_STRATEGY,
  swim: SWIM_STRATEGY,
});

/**
 * Sport-Strategie nachschlagen. Wirft für noch nicht implementierte
 * Sportarten (Platzhalter `null`) statt still zu degradieren.
 * @param {"ride"|"run"|"swim"} sport
 * @returns {object}
 */
export function getSportStrategy(sport) {
  const strategy = SPORT_STRATEGIES[sport];
  if (!strategy) {
    throw new Error(
      `plan-generator: sport "${sport}" ist noch nicht implementiert (Fahrplan 14 E2/E3).`
    );
  }
  return strategy;
}
