/* ============================================================
   CORE/AGGREGATE.JS — Wochen-/Monats-Aggregation (kein DOM)
   Reine Funktionen: bekommen Rides als Array, liefern Aggregate.
   ============================================================ */

import { avg, sum } from "./stats.js";

/**
 * ISO-Kalenderwochen-Schlüssel für ein Datum, z.B. "2026-KW27".
 * @param {string} dateStr ISO-Datum (YYYY-MM-DD)
 * @returns {string}
 */
export function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-KW${String(weekNum).padStart(2, "0")}`;
}

/** Gemeinsames Aggregat für eine Gruppe von Fahrten
 *  @param {string} week @param {import("../types.js").Ride[]} wr
 *  @param {{phase?: string|null, plan?: string}} meta
 *  @returns {import("../types.js").WeekAggregate} */
function aggregateGroup(week, wr, meta = {}) {
  return {
    week,
    phase: meta.phase !== undefined ? meta.phase : wr[0]?.phase || null,
    plan: meta.plan !== undefined ? meta.plan : wr[0]?.plan || "Plan 1",
    rides: wr.length,
    km: Math.round(sum(wr, "km") * 10) / 10,
    min: sum(wr, "min"),
    trimp: Math.round(sum(wr, "trimp")),
    avgHF: avg(wr, "hf"),
    avgKad: avg(wr, "kad"),
    avgEff: avg(wr.filter((r) => r.efficiency), "efficiency"),
  };
}

/**
 * Wochen-Aggregation entlang der Plan-Wochenstruktur (r.week).
 * @param {import("../types.js").Ride[]} rides
 * @param {(week: string) => number} weekIndexFn Sortier-Index (CONFIG.weekIndex)
 * @returns {import("../types.js").WeekAggregate[]}
 */
export function weeklyFromPlanWeeks(rides, weekIndexFn) {
  const weeks = [...new Set(rides.map((r) => r.week))]
    .filter(Boolean)
    .sort((a, b) => weekIndexFn(a) - weekIndexFn(b));

  return weeks.map((week) => {
    const wr = rides.filter((r) => r.week === week);
    return aggregateGroup(week, wr, {
      phase: wr[0]?.phase || "Vorbereitung",
      plan: wr[0]?.plan || "Plan 1",
    });
  });
}

/**
 * Wochen-Aggregation nach ISO-Kalenderwoche — Fallback für Athleten ohne
 * eigene Trainingsplan-Wochenstruktur (z.B. Vergleichsdaten).
 * @param {import("../types.js").Ride[]} rides
 * @returns {import("../types.js").WeekAggregate[]}
 */
export function weeklyByCalendar(rides) {
  const grouped = {};
  for (const r of rides) {
    const key = isoWeekKey(r.dateISO);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, wr]) => aggregateGroup(week, wr, { phase: null, plan: "Vergleich" }));
}

/**
 * Aggregiert Rides nach Kalendermonat (YYYY-MM) — analog zur Wochen-
 * Aggregation, plus Wetter-Durchschnitte für den Wetter-Chart.
 * Die Chart-Funktionen erwarten das Monats-Label im Feld "week".
 * @param {import("../types.js").Ride[]} rides
 * @returns {Array<import("../types.js").WeekAggregate & {temp: number|null, windSpeed: number|null, precip: number|null, badCount: number}>}
 */
export function monthlyFromRides(rides) {
  const grouped = {};
  for (const r of rides) {
    const key = r.dateISO.slice(0, 7); // YYYY-MM
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  const weatherMean = (mRides, field) => {
    const ws = mRides.filter((r) => r.weather?.[field] != null);
    return ws.length
      ? Math.round((ws.reduce((s, r) => s + r.weather[field], 0) / ws.length) * 10) / 10
      : null;
  };

  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, mRides]) => {
      const label = new Date(month + "-01").toLocaleDateString("de-DE", {
        month: "short",
        year: "2-digit",
      });
      return {
        ...aggregateGroup(label, mRides, {
          phase: mRides[0]?.phase || null,
          plan: mRides[0]?.plan || "Vergleich",
        }),
        avgHF: Math.round(avg(mRides.filter((r) => r.hf), "hf") || 0) || null,
        avgKad: Math.round(avg(mRides.filter((r) => r.kad), "kad") || 0) || null,
        temp: weatherMean(mRides, "temp"),
        windSpeed: weatherMean(mRides, "windSpeed"),
        precip: weatherMean(mRides, "precip"),
        badCount: mRides.filter(
          (r) =>
            r.weather &&
            (r.weather.temp > 32 ||
              r.weather.temp < 5 ||
              (r.weather.windSpeed || 0) > 30 ||
              (r.weather.precip || 0) > 0.5)
        ).length,
      };
    });
}
