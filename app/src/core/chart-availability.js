/* ============================================================
   CORE/CHART-AVAILABILITY.JS — datengetriebene Chart-Sichtbarkeit
   (kein DOM). Port von assets/js/ui/chart-visibility.js::AVAILABILITY,
   pro React-Chart-Komponente statt pro Vanilla-SVG-ID benannt — einige
   Vanilla-IDs sind im React-Redesign zusammengelegt (chart-hrv-p1 +
   chart-rhf-p1 → WellnessChart mit Metrik-Umschalter). FtpForecastChart
   und die Belastung-Karte (Brush/PmcChart/WhatIfPanel/ComparePanel)
   haben bewusst kein Prädikat, s. features/explorer/ExplorerPage.tsx.

   Reine Prädikate über die Rohdaten, die ein Chart braucht — fail-open
   im Aufrufer (unbekannt/kein Prädikat → sichtbar), nicht hier.
   ============================================================ */

import { energyView, hydrationSeries } from "./body.js";

/** @param {import("../types.js").Ride[]} rides */
export function weeklyVolumeAvailable(rides) {
  return rides.length > 0;
}

/** @param {import("../types.js").Ride[]} rides */
export function zoneWeeklyAvailable(rides) {
  return rides.some((r) => r.np != null);
}

/** @param {*} powerCurves */
export function powerCurveAvailable(powerCurves) {
  return !!powerCurves;
}

/** @param {import("../types.js").Ride[]} rides */
export function efficiencyAvailable(rides) {
  return rides.filter((r) => r.watt && r.hf && (r.min || 0) >= 60).length >= 2;
}

/** @param {import("../types.js").Ride[]} rides */
export function speedHrScatterAvailable(rides) {
  return rides.some((r) => r.hf && r.kmh);
}

/** @param {import("../types.js").Ride[]} rides */
export function cadenceAvailable(rides) {
  return rides.some((r) => r.kad);
}

/** @param {import("../types.js").Ride[]} rides */
export function hrTrendAvailable(rides) {
  return rides.some((r) => r.hf);
}

/** @param {import("../types.js").Ride[]} rides */
export function decouplingAvailable(rides) {
  return rides.some((r) => r.decoupling != null);
}

/** @param {import("../types.js").WellnessDay[]} wellness */
export function wellnessChartAvailable(wellness) {
  return wellness.some((w) => w.hrv != null || w.restingHR != null);
}

/** @param {import("../types.js").WellnessDay[]} wellness */
export function sleepAvailable(wellness) {
  return wellness.some((w) => w.sleepHours != null);
}

/** @param {import("../types.js").Ride[]} rides */
export function weatherWeeklyAvailable(rides) {
  return rides.some((r) => r.weather);
}

/** @param {import("../types.js").WellnessDay[]} wellness */
export function energyWeightAvailable(wellness) {
  return energyView(wellness) !== null;
}

/** @param {import("../types.js").Ride[]} rides */
export function tempoAvailable(rides) {
  return rides.some((r) => r.kmh);
}

/** @param {import("../types.js").Ride[]} rides */
export function trimpAvailable(rides) {
  return rides.some((r) => r.trimp || r.tss);
}

/** @param {import("../types.js").WellnessDay[]} wellness */
export function hydrationAvailable(wellness) {
  return hydrationSeries(wellness) !== null;
}

/** Zählt leere Charts aus denselben Verfügbarkeits-Flags, die der
 *  Umschalter-Badge anzeigt — reine Funktion, damit Badge und
 *  Ausblend-Logik nie auseinanderlaufen können.
 *  @param {boolean[]} availableFlags @returns {number} */
export function countEmpty(availableFlags) {
  return availableFlags.filter((available) => !available).length;
}
