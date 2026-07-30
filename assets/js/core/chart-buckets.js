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
   (dashboard-2.0). Seit der Monats-Bucket-Vereinheitlichung (s.
   docs/offene-punkte.md) unterstützen beide Funktionen optional auch
   period === "month": Bucket-Schlüssel dann der rohe "YYYY-MM"-String
   (konsistent mit core/aggregate.js::monthlyFromRides), rein arithmetisch
   berechnet (kein Fahrt-Lookup nötig, anders als bei der Wochen-Periode).
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
 * Bucket-Schlüssel für ein beliebiges Kalenderdatum — konsistent mit dem,
 * was renderWeeklyVolume/renderWeatherWeekly/renderZoneWeekly als Bucket-
 * Schlüssel verwenden (core/aggregate.js::weeklyByCalendar/monthlyFromRides).
 * Reine Arithmetik, kein Fahrt-Lookup nötig (`rides` bleibt im Signatur-
 * Parameter für API-Stabilität der Aufrufer, wird hier nicht gebraucht).
 * @param {string} dateISO
 * @param {import("../types.js").Ride[]} [rides] ungenutzt, s.o.
 * @param {"week"|"month"} [period]
 * @returns {string}
 */
export function dateToWeekBucket(dateISO, rides, period = "week") {
  return period === "month" ? dateISO.slice(0, 7) : isoWeekKey(dateISO);
}

/**
 * Kehrfunktion zu dateToWeekBucket(): die Datumsspanne zu einem Bucket-
 * Schlüssel. Für den Brush-Klick (Teil D) — dort ist der Bucket-Schlüssel
 * bereits bekannt (Balken-Datum `d.week`), gebraucht wird die zugehörige
 * Spanne. Wochen-Periode braucht dafür eine Fahrt mit demselben isoWeekKey()
 * (der Wochenschlüssel selbst trägt keine Datumsinformation); Monats-Periode
 * ist rein arithmetisch aus dem "YYYY-MM"-Schlüssel ableitbar.
 * @param {string} bucketKey
 * @param {import("../types.js").Ride[]} rides
 * @param {"week"|"month"} [period]
 * @returns {{from: string, to: string}|null} `null` bei unbekanntem/ungültigem Schlüssel
 */
export function weekBucketDateRange(bucketKey, rides, period = "week") {
  if (period === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(bucketKey || "");
    if (!m) return null;
    const [, y, mo] = m;
    const lastDay = new Date(Number(y), Number(mo), 0).getDate(); // Tag 0 des Folgemonats
    return { from: `${y}-${mo}-01`, to: `${y}-${mo}-${String(lastDay).padStart(2, "0")}` };
  }
  const match = (rides || []).find((r) => isoWeekKey(r.dateISO) === bucketKey);
  if (!match) return null;
  const monday = mondayOf(match.dateISO);
  return { from: monday, to: addDaysISO(monday, 6) };
}
