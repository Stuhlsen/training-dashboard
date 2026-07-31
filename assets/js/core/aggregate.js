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
    1 +
    Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-KW${String(weekNum).padStart(2, "0")}`;
}

/**
 * Numerischer Sortier-Index für einen Wochen-Label-String — für Kontexte,
 * die eine Zahl statt eines lexikografisch sortierbaren Strings brauchen
 * (z.B. CONFIG.weekIndex()-kompatible Sortierfunktionen, die per Subtraktion
 * vergleichen). Erkennt ISO-Kalenderwochen ("2026-KW31" → 202631, sortiert
 * korrekt über Jahresgrenzen) und delegiert alles andere (historische
 * Notion-Plan-1-Labels wie "W3") an `fallback`.
 * @param {string} week
 * @param {(week: string) => number} fallback z.B. CONFIG.weekIndex
 * @returns {number}
 */
export function weekSortIndex(week, fallback) {
  const m = /^(\d{4})-KW(\d{2})$/.exec(week || "");
  return m ? Number(m[1]) * 100 + Number(m[2]) : fallback(week);
}

/** Gemeinsames Aggregat für eine Gruppe von Fahrten
 *  @param {string} week @param {import("../types.js").Ride[]} wr
 *  @param {{phase?: string|null}} meta
 *  @returns {import("../types.js").WeekAggregate} */
function aggregateGroup(week, wr, meta = {}) {
  return {
    week,
    phase: meta.phase !== undefined ? meta.phase : wr[0]?.phase || null,
    rides: wr.length,
    km: Math.round(sum(wr, "km") * 10) / 10,
    min: sum(wr, "min"),
    trimp: Math.round(sum(wr, "trimp")),
    avgHF: avg(wr, "hf"),
    avgKad: avg(wr, "kad"),
    avgEff: avg(
      wr.filter((r) => r.efficiency),
      "efficiency"
    ),
  };
}

/**
 * Wochen-Aggregation nach ISO-Kalenderwoche — einheitliche Grundlage für
 * beide Athleten (dashboard-2.0, Umbau "Plan 1/2 → Kalenderwoche"). Phase
 * wird pro Woche übernommen, falls die Fahrten dort eine gemeinsame Block-
 * Phase tragen (r.phase, z.B. "Sweet Spot"/"Schwelle" bei Athlet 1) — eine
 * Kalenderwoche entspricht 1:1 einem PLAN2_SCHEDULE-Block, daher reicht
 * `wr[0]?.phase` als Mehrheitswert.
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
    .map(([week, wr]) => aggregateGroup(week, wr, { phase: wr[0]?.phase || null }));
}

/**
 * Aggregiert Rides nach Kalendermonat (YYYY-MM) — analog zur Wochen-
 * Aggregation, plus Wetter-Durchschnitte für den Wetter-Chart.
 * Die Chart-Funktionen erwarten den rohen "YYYY-MM"-Bucket-Schlüssel im Feld
 * "week" (konsistent mit core/chart-buckets.js — Monats-Vereinheitlichung,
 * s. docs/offene-punkte.md) — Kürzung auf "MM/JJ" passiert erst beim
 * Rendern über ui/charts/base.js::weekDisplayLabels(), nicht hier.
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
      return {
        ...aggregateGroup(month, mRides, { phase: mRides[0]?.phase || null }),
        avgHF:
          Math.round(
            avg(
              mRides.filter((r) => r.hf),
              "hf"
            ) || 0
          ) || null,
        avgKad:
          Math.round(
            avg(
              mRides.filter((r) => r.kad),
              "kad"
            ) || 0
          ) || null,
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
