/* ============================================================
   CORE/EFFICIENCY.JS — Aerober Fortschritts-Marker (kein DOM)
   Der Effizienz-Faktor (Watt/Herzschlag) zeigt aerobe Anpassung —
   aber nur über VERGLEICHBARE Fahrten: gleiche Intensität (Z2),
   ausreichende Dauer, moderate Temperatur. Sonst verrauschen
   Intervalltage und Hitzefahrten den Trend.
   ============================================================ */

import { linearTrend } from "./stats.js";

export const COMPARABLE = {
  types: ["Z2 Lang", "Z2 Dauer"],
  minDurationMin: 60,
  tempRange: [5, 30], // °C; Fahrten ohne Wetterdaten werden nicht ausgeschlossen
};

/** Ist eine Fahrt für den EF-Trend vergleichbar?
 *  @param {import("../types.js").Ride} r @returns {boolean} */
export function isComparableRide(r) {
  if (!r.efficiency) return false;
  if (!COMPARABLE.types.includes(r.typ)) return false;
  if ((r.min || 0) < COMPARABLE.minDurationMin) return false;
  const t = r.weather?.temp;
  if (t != null && (t < COMPARABLE.tempRange[0] || t > COMPARABLE.tempRange[1])) return false;
  return true;
}

/** Gleitender Mittelwert über window Punkte (zentriert unmöglich → trailing)
 *  @param {number[]} values @param {number} window @returns {(number|null)[]} */
export function rollingMean(values, window = 5) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < Math.min(3, window)) return null;
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

/**
 * EF-Trend über vergleichbare Fahrten.
 * @param {import("../types.js").Ride[]} rides
 * @returns {{comparable: import("../types.js").Ride[], rolling: (number|null)[], slopePer30d: number|null, first: number|null, last: number|null}}
 */
export function efficiencyTrend(rides) {
  const comparable = rides
    .filter(isComparableRide)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));

  const values = comparable.map((r) => r.efficiency);
  const rolling = rollingMean(values, 5);

  let slopePer30d = null;
  if (comparable.length >= 3) {
    const t0 = new Date(comparable[0].dateISO).getTime();
    const pts = comparable.map((r) => ({
      x: (new Date(r.dateISO).getTime() - t0) / 86400000,
      y: r.efficiency,
    }));
    const trend = linearTrend(pts);
    if (trend) slopePer30d = Math.round(trend.slope * 30 * 1000) / 1000;
  }

  const rollVals = rolling.filter((v) => v != null);
  return {
    comparable,
    rolling,
    slopePer30d,
    first: rollVals.length ? Math.round(rollVals[0] * 100) / 100 : null,
    last: rollVals.length ? Math.round(rollVals[rollVals.length - 1] * 100) / 100 : null,
  };
}

/** Ab diesem Decoupling gilt eine Fahrt als aerob stabil (Pw:HR < 5%) */
export const DECOUPLING_STABLE = 5;
/** Mindestpunkte für einen aussagekräftigen Decoupling-Trend */
export const DECOUPLING_MIN_POINTS = 5;

/**
 * HF-Decoupling-Trend über Fahrten mit Decoupling-Wert.
 * Steady-State-Kriterien wie beim EF (nur Z2-Typen ab 60 min) —
 * auf Intervallfahrten ist Decoupling nicht interpretierbar.
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {points: Array<{date: string, value: number}>, median: number, stableShare: number, slopePer30d: number|null, n: number}}
 *   null wenn < DECOUPLING_MIN_POINTS geeignete Fahrten (UI: "Datenbasis wächst noch")
 */
export function decouplingTrend(rides) {
  const usable = (rides || [])
    .filter((r) => r.decoupling != null && COMPARABLE.types.includes(r.typ) && (r.min || 0) >= COMPARABLE.minDurationMin)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (usable.length < DECOUPLING_MIN_POINTS) return null;

  const points = usable.map((r) => ({ date: r.dateISO, value: r.decoupling }));
  const sortedVals = points.map((p) => p.value).sort((a, b) => a - b);
  const mid = Math.floor(sortedVals.length / 2);
  const median = sortedVals.length % 2
    ? sortedVals[mid]
    : Math.round(((sortedVals[mid - 1] + sortedVals[mid]) / 2) * 10) / 10;

  const stableShare = Math.round((points.filter((p) => p.value < DECOUPLING_STABLE).length / points.length) * 100);

  let slopePer30d = null;
  const t0 = new Date(points[0].date).getTime();
  const trend = linearTrend(points.map((p) => ({ x: (new Date(p.date).getTime() - t0) / 86400000, y: p.value })));
  if (trend) slopePer30d = Math.round(trend.slope * 30 * 100) / 100;

  return { points, median, stableShare, slopePer30d, n: points.length };
}
