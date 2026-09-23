/* ============================================================
   CORE/WEEK-LABELS.JS — Wochen-/Monats-Bucket-Schlüssel kürzen (kein DOM).

   Port von ui/charts/base.js::weekDisplayLabels() (Vanilla) — dort nur für
   Charts gedacht, wird aber unverändert vom Planungstab (Etappe 6a,
   Wochen-Badges) gebraucht und später auch von Etappe 8 (Charts). Gehört
   deshalb nach core/ statt (wieder) in eine UI-Datei dupliziert zu werden.
   ============================================================ */

import { isoWeekKey } from "./aggregate.js";

/**
 * Kürzt ISO-Kalenderwochen ("2026-KW27" → "KW27") und Monats-Buckets
 * ("2026-07" → "07/26") für die Anzeige. Markiert einen Jahreswechsel
 * innerhalb der übergebenen Liste ("KW1 '27") statt ihn stillschweigend zu
 * verschlucken. Unbekannte Formate werden unverändert durchgereicht.
 * @param {(string|null|undefined)[]} weeks
 * @returns {string[]}
 */
export function weekDisplayLabels(weeks) {
  let prevYear = null;
  return (weeks || []).map((w) => {
    const kw = /^(\d{4})-KW(\d{2})$/.exec(w || "");
    if (kw) {
      const [, year, num] = kw;
      const label = prevYear && year !== prevYear ? `KW${num} '${year.slice(2)}` : `KW${num}`;
      prevYear = year;
      return label;
    }
    const mo = /^(\d{4})-(\d{2})$/.exec(w || "");
    if (mo) return `${mo[2]}/${mo[1].slice(2)}`;
    return w;
  });
}

/**
 * Wochen-Schlüssel einer Fahrt fürs Fahrtenbuch: die Plan-Woche, wenn die
 * Fahrt eine trägt ("W3", "2026-KW38"), sonst die ISO-Kalenderwoche des
 * Datums — Fahrten außerhalb eines Plans (nach Plan-2-Ende, Athlet 2/4
 * mit `week: null`) liegen trotzdem in einer Kalenderwoche.
 * @param {{ week?: string|null, dateISO?: string|null }} ride
 * @returns {string|null}
 */
export function rideWeekKey(ride) {
  if (ride.week) return ride.week;
  return ride.dateISO ? isoWeekKey(ride.dateISO) : null;
}
