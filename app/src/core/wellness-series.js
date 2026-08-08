/* ============================================================
   CORE/WELLNESS-SERIES.JS — HRV/RHF-Merge für den Eigenplan-Athleten
   (kein DOM). Port von assets/js/ui/charts/wellness.js::_mergedOwnPlanSeries.

   Vor Mitte Juni (Notion-Ära) trägt nur `rides` HRV/Ruhepuls-Werte (RMSSD,
   via Apple Health), erst danach `wellness` (intervals.icu, SDNN). Ohne
   diesen Merge fehlt die komplette Frühgeschichte des Eigenplan-Athleten
   (Athlet 1) — ein reiner Wechsel auf `wellness` würde sie stillschweigend
   löschen. `wellness` überschreibt `rides` bei überlappendem Datum (gleiche
   Priorität wie im Vanilla-Original).

   `hrvMethod` markiert NUR, ob am jeweiligen Datum eine PLAN2_SCHEDULE-Woche
   existiert (= intervals.icu-Ära) — unabhängig davon, welche Quelle den
   Wert tatsächlich lieferte (core/plan2-schedule.js ist ein reines
   Datumsraster, athletenunabhängig).
   ============================================================ */

import { getPlan2WeekPhase } from "./plan2-schedule.js";

/**
 * @param {import("../types.js").Ride[]} rides
 * @param {import("../types.js").WellnessDay[]} wellness
 * @param {string} rideField z.B. "hrv" oder "ruhepuls"
 * @param {string} wellnessField z.B. "hrv" oder "restingHR"
 * @returns {Array<{dateISO: string, value: number, hrvMethod: "sdnn"|"rmssd"}>}
 */
export function mergedOwnPlanSeries(rides, wellness, rideField, wellnessField) {
  const byDate = new Map();
  for (const r of rides || []) {
    if (r[rideField] != null) byDate.set(r.dateISO, r[rideField]);
  }
  for (const w of wellness || []) {
    const dateISO = w.dateISO || w.date;
    if (w[wellnessField] != null) byDate.set(dateISO, w[wellnessField]);
  }
  return [...byDate.entries()]
    .map(([dateISO, value]) => ({
      dateISO,
      value,
      hrvMethod: getPlan2WeekPhase(dateISO).week ? "sdnn" : "rmssd",
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}
