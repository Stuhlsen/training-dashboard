/* ============================================================
   CORE/PLAN-GENERATOR-SPORT.JS — Sport-Strategie-Tabelle für generatePlan()
   (kein DOM, kein I/O, kein React)

   Fahrplan 14 E1 (planning/fahrplan-14-plan-generator-multisport.md, Vertrag
   V1). Kapselt alles, was zwischen Rad/Lauf/Schwimm variiert (Workout-Band-
   Funktion, Testtag-Regel + -Karte, Quality-Day-Auswahl), damit
   plan-generator.js selbst sportagnostisch bleibt.

   `RIDE_STRATEGY` ist 1:1 das bisherige Rad-Verhalten aus plan-generator.js
   (vor E1 hart im Modul) — nur hinter dieser Tabelle statt hart im Code.
   `SWIM_STRATEGY` ist seit E3 befüllt (Speed-Band + `selectGenericWorkout()`
   aus `plan-workout-select-generic.js`, Zonen/Session-Typen aus
   `sports/swimming/`). `RUN_STRATEGY` bleibt Platzhalter (`null`) — E2
   befüllt sie analog aus `sports/running/`, auf demselben geteilten
   `plan-workout-select-generic.js`-Baustein. `getSportStrategy()` wirft für
   `RUN_STRATEGY` weiter bewusst, statt still auf Rad zurückzufallen — ein
   Aufruf mit `sport: "run"` vor E2 ist ein Programmierfehler, kein
   Laufzeit-Sonderfall.
   ============================================================ */

import { diffDays } from "./format.js";
import { estimateSessionTSS } from "./ftp-progress.js";
import { TYPE_DEFAULT_TSS } from "../sports/cycling/session-types.js";
import { selectWorkout } from "./plan-workout-select.js";
import { selectGenericWorkout, speedBand } from "./plan-workout-select-generic.js";
import { swimmingSessionTypes } from "../sports/swimming/session-types.js";
import { swimmingZones } from "../sports/swimming/zones.js";
import { GENERIC_BUILD_PHASES } from "./plan-generator-blocks.js";

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

/**
 * Lockerer Z2-Dauerblock über `minutes` Minuten — Rad, FTP-Watt-Band.
 * `strategy.looseWorkout()`-Implementierung von RIDE_STRATEGY (Fahrplan-14-
 * Review: plan-generator.js soll keine Sport-Fallunterscheidung mehr
 * enthalten, jede Strategie bringt ihren eigenen lockeren Baustein mit).
 * @param {number} minutes @param {number|null} ftp @param {object} strategy  Sport-Strategie (`wattBand`)
 * @returns {{name:string, typ:string, workout:object, workoutStructure:object, tssPlanned:number, durationMin:number}}
 */
function z2Workout(minutes, ftp, strategy) {
  const min = Math.max(20, Math.round(minutes));
  const pct = /** @type {[number,number]} */ ([60, 70]);
  const isLong = min >= 150;
  const band = strategy.wattBand(pct, ftp);
  const workout = {
    warmup: 0,
    intervals: 1,
    duration: min,
    rest: 0,
    cooldown: 0,
    zone: "Z2",
    pct,
    ...(band ? { watts: band } : {}),
    label: isLong ? "Z2 Lang" : "Z2 Dauer",
  };
  const workoutStructure = {
    version: 1,
    steps: [{ kind: "steady", duration_s: min * 60, target_pct_ftp: 65 }],
  };
  return {
    name: isLong ? "Z2 Lang" : "Z2 Dauer",
    typ: isLong ? "Z2 Lang" : "Z2 Dauer",
    workout,
    workoutStructure,
    tssPlanned: estimateSessionTSS(workout, ftp ?? undefined),
    durationMin: min,
  };
}

/** Rad-Strategie — funktional unverändert gegenüber dem Vor-E1-Verhalten von
 *  plan-generator.js. `testCard` ist die feste Kartenvorlage für den
 *  FTP-Testtag (`workout`/`workoutStructure` setzt der Aufrufer auf `null`).
 *  `looseWorkout(minutes, ftp, _thresholdSpeed, strategy)`: einheitliche
 *  Signatur über alle Strategien, Rad ignoriert `thresholdSpeed`. */
export const RIDE_STRATEGY = Object.freeze({
  sport: "ride",
  wattBand,
  selectWorkout,
  looseWorkout: (minutes, ftp, _thresholdSpeed, strategy) => z2Workout(minutes, ftp, strategy),
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

/** `strategy.selectWorkout()`-Adapter für Schwimmen: `buildWeekCards()`
 *  reicht dieselbe (Rad-geprägte) Argument-Form durch wie an `selectWorkout()`
 *  — Schwimmen braucht nur eine Teilmenge (V4-Vertrag: keine Ladder-Stufe,
 *  kein `formats`-Katalog). */
function swimSelectWorkout({ phase, qualitySlot, currentThresholdSpeed, targetDurationMin, targetTss }) {
  return selectGenericWorkout({ sport: "swim", phase, qualitySlot, currentThresholdSpeed, targetDurationMin, targetTss });
}

/**
 * Lockerer Grundlagenblock — Schwimmen, Speed-Band. `strategy.looseWorkout()`-
 * Implementierung von SWIM_STRATEGY (Pendant zu `z2Workout()`). Kein FTP/
 * `estimateSessionTSS`: die TRIMP-Schätzung skaliert linear über den
 * "Grundlage"-Leittyp aus `sessionTypes.phaseSignatures` (für Schwimmen
 * "Longswim" — der erste gelistete Typ), unter der UNKALIBRIERTEN Annahme,
 * dass `defaultLoad` für ~45 min gilt. Die feinere Skalierung übernimmt
 * ohnehin `scaleLooseCardsToTarget()` im Aufrufer, die jede Karte am Ende auf
 * die echte Wochen-TSS-Vorgabe reskaliert — dieser Näherungswert ist nur der
 * Startpunkt.
 * @param {number} minutes @param {number|null} thresholdSpeed km/h
 * @param {object} strategy  Sport-Strategie (`sessionTypes`, `speedBand`)
 * @returns {{name:string, typ:string, workout:object, workoutStructure:null, tssPlanned:number, durationMin:number}}
 */
function genericZ2Workout(minutes, thresholdSpeed, strategy) {
  const min = Math.max(20, Math.round(minutes));
  // 60–75 % der Schwellengeschwindigkeit — bewusst UNTER dem Qualitätstag-
  // Grundlage-Band (70–85 %, plan-workout-select-generic.js::PHASE_PCT_BAND),
  // dieselbe Beziehung wie beim Rad: z2Workout()s lockere 60–70 % FTP liegen
  // ebenfalls unter dem Grundlage-Qualitätstag (sweetspot-long, ~85–91 % FTP,
  // plan-workout-select.js::PHASE_PLAN). Kein Zahlendreher — der lockere Tag
  // ist innerhalb derselben Phase immer die leichtere Einheit.
  const pct = /** @type {[number,number]} */ ([60, 75]);
  const typ = strategy.sessionTypes.phaseSignatures.Grundlage.types[0];
  const refLoad = strategy.sessionTypes.defaultLoad[typ] ?? 30;
  const tssPlanned = Math.max(1, Math.round((refLoad / 45) * min));
  const band = strategy.speedBand(pct, thresholdSpeed);
  const workout = {
    duration: min,
    zone: "Grundlage",
    pct,
    ...(band ? { speedTarget: band } : {}),
    label: typ,
  };
  return { name: typ, typ, workout, workoutStructure: null, tssPlanned, durationMin: min };
}

/** Schwimm-Strategie (Fahrplan 14 E3). Kein Testtag (Entscheidung 7 —
 *  `testWeeks` liefert immer eine leere Menge, `testCard` wird darum nie
 *  gebraucht). `phases`: 3-Phasen-Vokabular ohne Sweet Spot
 *  (GENERIC_BUILD_PHASES), an `buildPhaseSequence()` durchgereicht.
 *  `looseWorkout(minutes, _ftp, thresholdSpeed, strategy)`: einheitliche
 *  Signatur über alle Strategien, Schwimmen ignoriert `ftp`. */
export const SWIM_STRATEGY = Object.freeze({
  sport: "swim",
  phases: GENERIC_BUILD_PHASES,
  sessionTypes: swimmingSessionTypes,
  zones: swimmingZones,
  speedBand,
  selectWorkout: swimSelectWorkout,
  looseWorkout: (minutes, _ftp, thresholdSpeed, strategy) => genericZ2Workout(minutes, thresholdSpeed, strategy),
  testWeeks: () => new Set(),
});

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
      `plan-generator: sport "${sport}" ist noch nicht implementiert (Fahrplan 14 E2).`
    );
  }
  return strategy;
}
