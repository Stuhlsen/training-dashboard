/* ============================================================
   CORE/CHART-BUCKETS.JS — Tag → Wochen-Bucket-Abbildung
   (Phase 5, Schritt 6, Teil B — docs/chart-grundlagen.md §7.3,
   docs/phase-5-konzept-explorer.md §2.4)

   Familie-3-Balkencharts (Wochenvolumen, wochenweises Wetter) koppeln am
   Fadenkreuz nicht tagesgenau, sondern über eine Abbildung Tag → Bucket:
   ein gehovertes Kalenderdatum trifft auf die ganze Woche, die es enthält.
   Diese Abbildung ist reine Arithmetik (kein DOM) und lebt deshalb hier,
   nicht in ui/charts/training.js.

   Bucket-Konvention (konsistent mit core/aggregate.js::rideWeekKey): die
   Plan-Woche einer Fahrt (r.week), falls für die Kalenderwoche gesetzt,
   sonst die ISO-Kalenderwoche. Nur die Wochen-Periode wird unterstützt —
   der Monats-Toggle von renderWeeklyVolume/renderWeatherWeekly nutzt zwei
   zueinander inkonsistente Konventionen (lokalisierter Anzeige-String bzw.
   roher "YYYY-MM"-Schlüssel, s. Kopfkommentar ui/charts/training.js) und
   bleibt bewusst außen vor (docs/offene-punkte.md).
   ============================================================ */

import { addDaysISO } from "./format.js";
import { rideWeekKey, isoWeekKey } from "./aggregate.js";

/** Montag (lokal, kein UTC — wie core/days.js/core/format.js überall sonst)
 *  der Kalenderwoche eines ISO-Datums.
 *  @param {string} dateISO @returns {string} */
function mondayOf(dateISO) {
  const d = new Date(`${dateISO}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // 0 = Montag … 6 = Sonntag
  return addDaysISO(dateISO, -dow);
}

/**
 * Wochen-Bucket-Schlüssel für ein beliebiges Kalenderdatum — konsistent mit
 * dem, was renderWeeklyVolume/renderWeatherWeekly als Bucket-Schlüssel
 * verwenden (core/aggregate.js::rideWeekKey). Sucht dazu irgendeine Fahrt in
 * derselben Kalenderwoche (Montag–Sonntag) und übernimmt deren Wochen-
 * Schlüssel; ohne Treffer (z.B. eine Woche ganz ohne Fahrt) Fallback auf die
 * reine ISO-Kalenderwoche — liefert dann zwar einen Schlüssel, der in
 * keinem vorhandenen Balken auftaucht (kein Treffer beim Hervorheben), aber
 * nie `null`/einen Absturz.
 * @param {string} dateISO
 * @param {import("../types.js").Ride[]} rides
 * @returns {string}
 */
export function dateToWeekBucket(dateISO, rides) {
  const monday = mondayOf(dateISO);
  const sunday = addDaysISO(monday, 6);
  const match = (rides || []).find((r) => r.dateISO >= monday && r.dateISO <= sunday);
  return match ? rideWeekKey(match) : isoWeekKey(dateISO);
}

/**
 * Kehrfunktion zu dateToWeekBucket(): die Montag–Sonntag-Kalenderwoche zu
 * einem Bucket-Schlüssel, anhand irgendeiner Fahrt mit demselben
 * rideWeekKey(). Für den Brush-Klick (Teil D) — dort ist der Bucket-
 * Schlüssel bereits bekannt (Balken-Datum `d.week`), gebraucht wird die
 * zugehörige Kalenderwoche als Datumsspanne.
 * @param {string} weekKey
 * @param {import("../types.js").Ride[]} rides
 * @returns {{from: string, to: string}|null} `null`, wenn keine Fahrt passt
 */
export function weekBucketDateRange(weekKey, rides) {
  const match = (rides || []).find((r) => rideWeekKey(r) === weekKey);
  if (!match) return null;
  const monday = mondayOf(match.dateISO);
  return { from: monday, to: addDaysISO(monday, 6) };
}
