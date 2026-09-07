/* ============================================================
   CORE/ACTIVITY-SPORT.JS — Sportart einer Aktivität (Fahrplan 10, E1)

   Ein Aktivitätsobjekt trägt seit Fahrplan 10 ein optionales `sport`-Feld
   ("ride" | "run" | "swim" | "other", Vertrag V1/V2). Dieses Modul ist die
   EINE Stelle, an der das Feld gelesen und die Rad-Auswertung darauf
   eingegrenzt wird — kein DOM, kein I/O.

   Non-breaking: ein fehlendes `sport` zählt als "ride". Damit ändert sich
   für die Bestandsathleten 1/2/4 (deren Zeilen alle "ride" tragen) nichts.

   `onlyCyclingRides()` sitzt heute an genau einem Eingang (api/pipeline.ts).
   Fahrplan 10 E8 öffnet diesen Helfer gezielt: dann bestimmt die im
   Frontend aktive Sportart, welche Aktivitäten in Aggregation / PMC /
   Charts / Fahrtenbuch eintreten — bis dahin ist es fest "ride".
   ============================================================ */

/** @typedef {import("../types.js").Ride} Ride */

/** Effektive Sportart einer Aktivität — fehlendes/leeres Feld ⇒ "ride".
 *  @param {{sport?: string|null}} activity
 *  @returns {"ride"|"run"|"swim"|"other"} */
export function activitySport(activity) {
  const s = activity && activity.sport;
  return s === "run" || s === "swim" || s === "other" ? s : "ride";
}

/** Ist die Aktivität eine Radfahrt (inkl. Alt-Payload ohne `sport`)?
 *  @param {{sport?: string|null}} activity @returns {boolean} */
export function isCyclingActivity(activity) {
  return activitySport(activity) === "ride";
}

/** Filtert eine Aktivitätsliste auf Radfahrten.
 *  @template {{sport?: string|null}} T
 *  @param {T[]} rides @returns {T[]} */
export function onlyCyclingRides(rides) {
  return (rides || []).filter(isCyclingActivity);
}
