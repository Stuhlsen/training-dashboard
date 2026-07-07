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

/** Lokales ISO-Datum ohne UTC-Verschiebung @param {Date} d */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Wochenweise Trainingskonsistenz ab der ersten aktiven Woche bis heute.
 * Leere Wochen zwischendrin bleiben erhalten (days=0) — Lücken sollen
 * sichtbar sein. Farbe/Anzeige der UI kodiert `days` (nicht die Last).
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {null | {
 *   weeks: Array<{monday: string, days: number, load: number, km: number}>,
 *   streakCurrent: number, streakLongest: number,
 *   activeWeeks: number, totalWeeks: number, activeDays: number, avgDays: number
 * }} null wenn keine aktiven Tage
 */
export function weeklyConsistency(rides, todayISO) {
  // Tageslast/-km pro Kalendertag mit Aktivität
  const perDate = {};
  for (const r of rides || []) {
    const d = r.dateISO || r.date;
    if (!d) continue;
    if (!perDate[d]) perDate[d] = { load: 0, km: 0 };
    perDate[d].load += rideLoad(r);
    perDate[d].km += r.km || 0;
  }
  const activeDates = Object.keys(perDate).sort();
  if (!activeDates.length) return null;

  // Wochen-Buckets (Montag-Schlüssel)
  const byWeek = {};
  for (const d of activeDates) {
    const wk = mondayOf(d);
    if (!byWeek[wk]) byWeek[wk] = { days: 0, load: 0, km: 0 };
    byWeek[wk].days += 1;
    byWeek[wk].load += perDate[d].load;
    byWeek[wk].km += perDate[d].km;
  }

  // Lückenlose Wochenliste: erste aktive Woche → aktuelle Woche
  const firstMonday = mondayOf(activeDates[0]);
  const currentMonday = mondayOf(todayISO);
  const weeks = [];
  let cursor = firstMonday, guard = 0;
  while (cursor <= currentMonday && guard < 400) {
    const b = byWeek[cursor] || { days: 0, load: 0, km: 0 };
    weeks.push({
      monday: cursor,
      days: b.days,
      load: Math.round(b.load),
      km: Math.round(b.km * 10) / 10,
    });
    const dt = new Date(cursor + "T00:00:00");
    dt.setDate(dt.getDate() + 7);
    cursor = isoLocal(dt);
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
