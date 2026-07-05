/* ============================================================
   CORE/CONSISTENCY.JS — Jahres-Konsistenzkalender (kein DOM)
   Konsistenz ist der am besten belegte Prädiktor für Langzeit-
   fortschritt im Ausdauersport. GitHub-artiger Jahreskalender:
   Zeilen = Wochentage (Mo–So), Spalten = Kalenderwochen —
   damit ersetzt er auch die alte Wochentags-Heatmap.
   ============================================================ */

import { rideLoad } from "./loadguard.js";

/**
 * Kalenderdaten fürs laufende Jahr (bis todayISO).
 * Level 0–4 aus der Tageslast relativ zu den eigenen Quantilen.
 * @param {import("../types.js").Ride[]} rides
 * @param {string} todayISO
 * @returns {{year: number, days: Record<string, {load: number, km: number, level: number}>,
 *   maxLoad: number, activeDays: number, totalDays: number,
 *   weekdayCounts: number[], weekdayKm: number[]}}
 */
export function yearCalendar(rides, todayISO) {
  const year = Number(todayISO.slice(0, 4));
  const days = {};
  const weekdayCounts = new Array(7).fill(0);
  const weekdayKm = new Array(7).fill(0);

  for (const r of rides) {
    if (!r.dateISO || !r.dateISO.startsWith(String(year))) continue;
    if (!days[r.dateISO]) days[r.dateISO] = { load: 0, km: 0, level: 0 };
    days[r.dateISO].load += rideLoad(r);
    days[r.dateISO].km += r.km || 0;
    const dow = (new Date(r.dateISO + "T00:00:00").getDay() + 6) % 7; // Mo=0
    weekdayCounts[dow]++;
    weekdayKm[dow] += r.km || 0;
  }

  // Level aus Quantilen der eigenen aktiven Tage (robust gegen Ausreißer)
  const loads = Object.values(days).map((d) => d.load).sort((a, b) => a - b);
  const q = (p) => (loads.length ? loads[Math.min(loads.length - 1, Math.floor(p * loads.length))] : 0);
  const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
  for (const d of Object.values(days)) {
    d.level = d.load >= q3 ? 4 : d.load >= q2 ? 3 : d.load >= q1 ? 2 : 1;
    d.km = Math.round(d.km * 10) / 10;
    d.load = Math.round(d.load);
  }

  const start = new Date(`${year}-01-01T00:00:00`);
  const end = new Date(todayISO + "T00:00:00");
  const totalDays = Math.floor((end - start) / 86400000) + 1;

  return {
    year, days,
    maxLoad: loads.length ? loads[loads.length - 1] : 0,
    activeDays: loads.length,
    totalDays,
    weekdayCounts,
    weekdayKm: weekdayKm.map((v) => Math.round(v)),
  };
}
