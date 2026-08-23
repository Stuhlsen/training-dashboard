/* ============================================================
   CORE/CONSISTENCY.JS — Wochen-Konsistenz (kein DOM)
   Konsistenz ist der am besten belegte Prädiktor für Langzeit-
   fortschritt im Ausdauersport. Statt eines dünn besetzten
   Jahreskalenders: ein Streifen mit EINER Zelle pro Woche ab der
   ersten aktiven Woche, gefüllt nach Trainingstagen/Woche (0–7).
   Liefert zusätzlich aktuelle & längste Serie für den Kopf.
   Athletenunabhängig — funktioniert für beide (kein Plan nötig).
   ============================================================ */

import { rideLoad } from "./loadguard.js";
import { mondayOf, weeklyStreak } from "./adherence.js";
import { addDaysISO, rideLabel } from "./format.js";

/**
 * Wochenweise Trainingskonsistenz ab der ersten aktiven Woche bis heute.
 * Leere Wochen zwischendrin bleiben erhalten (days=0) — Lücken sollen
 * sichtbar sein. Farbe/Anzeige der UI kodiert `days` (nicht die Last).
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {null | {
 *   weeks: Array<{monday: string, days: number, load: number, km: number,
 *     sessions: Array<{dateISO: string, label: string, km: number}>}>,
 *   streakCurrent: number, streakLongest: number,
 *   activeWeeks: number, totalWeeks: number, activeDays: number, avgDays: number
 * }} null wenn keine aktiven Tage
 */
export function weeklyConsistency(rides, todayISO) {
  // Tageslast/-km pro Kalendertag mit Aktivität + Fahrten-Namen für den
  // Tooltip (Review-Kommentar 23.08.2026: "was genau wurde dort gefahren"),
  // in einem Durchlauf statt zwei getrennten (Code-Review-Fund: eine zweite
  // Schleife über `rides` nur für die Sessions war unnötig — jede Fahrt
  // kennt ihre Woche unabhängig von der Tages-Aggregation unten). Eine
  // Session-Zeile je FAHRT, nicht je Tag, damit zwei Einheiten am selben
  // Tag beide auftauchen.
  const perDate = {};
  const byWeek = {};
  for (const r of rides || []) {
    const d = r.dateISO || r.date;
    if (!d) continue;
    if (!perDate[d]) perDate[d] = { load: 0, km: 0 };
    perDate[d].load += rideLoad(r);
    perDate[d].km += r.km || 0;

    const wk = mondayOf(d);
    if (!byWeek[wk]) byWeek[wk] = { days: 0, load: 0, km: 0, sessions: [] };
    const km = Math.round((r.km || 0) * 10) / 10;
    byWeek[wk].sessions.push({ dateISO: d, label: rideLabel(r, km), km });
  }
  const activeDates = Object.keys(perDate).sort();
  if (!activeDates.length) return null;

  // days/load/km je Woche aus den bereits aggregierten Tageswerten (erst
  // jetzt möglich — mehrere Fahrten am selben Tag müssen zuerst in perDate
  // zusammengeführt sein, bevor sie als EIN Trainingstag zählen).
  for (const d of activeDates) {
    const wk = mondayOf(d);
    byWeek[wk].days += 1;
    byWeek[wk].load += perDate[d].load;
    byWeek[wk].km += perDate[d].km;
  }
  for (const wk of Object.keys(byWeek)) {
    byWeek[wk].sessions.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  }

  // Lückenlose Wochenliste: erste aktive Woche → aktuelle Woche
  const firstMonday = mondayOf(activeDates[0]);
  const currentMonday = mondayOf(todayISO);
  const weeks = [];
  let cursor = firstMonday, guard = 0;
  while (cursor <= currentMonday && guard < 400) {
    const b = byWeek[cursor] || { days: 0, load: 0, km: 0, sessions: [] };
    weeks.push({
      monday: cursor,
      days: b.days,
      load: Math.round(b.load),
      km: Math.round(b.km * 10) / 10,
      sessions: b.sessions,
    });
    cursor = addDaysISO(cursor, 7);
    guard++;
  }

  // Längste Serie aufeinanderfolgender aktiver Wochen
  let longest = 0, run = 0;
  for (const w of weeks) {
    if (w.days > 0) { run++; if (run > longest) longest = run; }
    else run = 0;
  }

  const activeWeeks = weeks.filter((w) => w.days > 0).length;
  const activeDays = activeDates.length;
  const avgDays = weeks.length ? Math.round((activeDays / weeks.length) * 10) / 10 : 0;

  return {
    weeks,
    streakCurrent: weeklyStreak(rides, todayISO), // identisch zum Analyse-Tab
    streakLongest: longest,
    activeWeeks,
    totalWeeks: weeks.length,
    activeDays,
    avgDays,
  };
}
