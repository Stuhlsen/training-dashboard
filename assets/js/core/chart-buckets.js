/* ============================================================
   CORE/CHART-BUCKETS.JS — Tag → Wochen-Bucket-Abbildung
   (Phase 5, Schritt 6, Teil B — docs/chart-grundlagen.md §7.3,
   docs/phase-5-konzept-explorer.md §2.4)

   Familie-3-Balkencharts (Wochenvolumen, wochenweises Wetter) koppeln am
   Fadenkreuz nicht tagesgenau, sondern über eine Abbildung Tag → Bucket:
   ein gehovertes Kalenderdatum trifft auf die ganze Woche, die es enthält.
   Diese Abbildung ist reine Arithmetik (kein DOM) und lebt deshalb hier,
   nicht in ui/charts/training.js.

   Bucket-Konvention (konsistent mit core/aggregate.js::weeklyByCalendar):
   die ISO-Kalenderwoche des Datums (core/aggregate.js::isoWeekKey) —
   einheitlich für beide Athleten seit dem Umbau "Plan 1/2 → Kalenderwoche"
   (dashboard-2.0). Nur die Wochen-Periode wird unterstützt — der
   Monats-Toggle von renderWeeklyVolume/renderWeatherWeekly nutzt zwei
   zueinander inkonsistente Konventionen (lokalisierter Anzeige-String bzw.
   roher "YYYY-MM"-Schlüssel, s. Kopfkommentar ui/charts/training.js) und
   bleibt bewusst außen vor (docs/offene-punkte.md).
   ============================================================ */

import { addDaysISO } from "./format.js";
import { isoWeekKey } from "./aggregate.js";

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
 * verwenden (core/aggregate.js::weeklyByCalendar). Reine ISO-Kalenderwoche,
 * kein Fahrt-Lookup mehr nötig (`rides` bleibt im Signatur-Parameter für
 * API-Stabilität der Aufrufer, wird hier aber nicht mehr gebraucht).
 * @param {string} dateISO
 * @param {import("../types.js").Ride[]} [rides] ungenutzt, s.o.
 * @returns {string}
 */
export function dateToWeekBucket(dateISO, rides) {
  return isoWeekKey(dateISO);
}

/**
 * Kehrfunktion zu dateToWeekBucket(): die Montag–Sonntag-Kalenderwoche zu
 * einem Bucket-Schlüssel, anhand irgendeiner Fahrt mit demselben
 * isoWeekKey(). Für den Brush-Klick (Teil D) — dort ist der Bucket-
 * Schlüssel bereits bekannt (Balken-Datum `d.week`), gebraucht wird die
 * zugehörige Kalenderwoche als Datumsspanne.
 * @param {string} weekKey
 * @param {import("../types.js").Ride[]} rides
 * @returns {{from: string, to: string}|null} `null`, wenn keine Fahrt passt
 */
export function weekBucketDateRange(weekKey, rides) {
  const match = (rides || []).find((r) => isoWeekKey(r.dateISO) === weekKey);
  if (!match) return null;
  const monday = mondayOf(match.dateISO);
  return { from: monday, to: addDaysISO(monday, 6) };
}
