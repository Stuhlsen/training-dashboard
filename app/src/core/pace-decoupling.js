/* ============================================================
   CORE/PACE-DECOUPLING.JS — Pace:HF-Drift (kein DOM)

   Das Pace-Pendant zum Pw:HR-Decoupling beim Rad (core/efficiency.js).
   Fahrplan 10 E7 — noch von niemandem konsumiert (E8 verdrahtet).

   WARTET AUF DATEN: rides-N.json trägt für Lauf/Schwimm weder
   Sekunden-Streams noch ein `decoupling`-Feld (E0-Bericht 2026-09-07).
   E7 liefert nur die Rechnung; der Zulauf (Split-/Stream-Zufuhr im
   Sync, ein `decoupling`-Feld je Aktivität) kommt später. Getestet
   ausschließlich synthetisch (Q6/Q15).

   MODELL wie beim Rad (Friel): Effizienz = Ø-Geschwindigkeit ÷ Ø-HF,
   erste vs. zweite Hälfte. Positives Decoupling = HF driftet nach oben
   relativ zum Tempo (Ermüdung / mangelnde aerobe Stabilität).
   ============================================================ */

import { linearTrend } from "./stats.js";

/** @typedef {import("../types.js").Ride} Ride */

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);
const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

/** Ab diesem Decoupling gilt eine Einheit als aerob stabil (< 5 %). */
export const DECOUPLING_STABLE = 5;
/** Mindest-Aktivitäten für einen aussagekräftigen Decoupling-Trend. */
export const DECOUPLING_MIN_POINTS = 5;
/** Mindest-Samples je Aktivität für eine belastbare Hälften-Teilung. */
export const DECOUPLING_MIN_SAMPLES = 6;

/**
 * Pace:HF-Decoupling einer einzelnen Einheit aus zeitgeordneten Samples.
 * @param {Array<{t?: number, speed: number, hr: number}>} samples
 *   aufsteigend nach Zeit; Samples ohne gültige speed/hr fallen raus
 * @returns {null | {decouplingPct: number, efFirst: number, efSecond: number, nSamples: number}}
 *   null bei < DECOUPLING_MIN_SAMPLES brauchbaren Samples
 */
export function paceHrDecoupling(samples) {
  const pts = (samples || []).filter((s) => s && num(s.speed) > 0 && num(s.hr) > 0);
  if (pts.length < DECOUPLING_MIN_SAMPLES) return null;
  const half = Math.floor(pts.length / 2);
  const first = pts.slice(0, half);
  const second = pts.slice(pts.length - half);
  const ef = (arr) => mean(arr.map((s) => s.speed)) / mean(arr.map((s) => s.hr));
  const efFirst = ef(first);
  const efSecond = ef(second);
  if (!(efFirst > 0)) return null;
  return {
    decouplingPct: Math.round(((efFirst - efSecond) / efFirst) * 100 * 10) / 10,
    efFirst: Math.round(efFirst * 1000) / 1000,
    efSecond: Math.round(efSecond * 1000) / 1000,
    nSamples: pts.length,
  };
}

/**
 * Decoupling-Trend über vergleichbare Aktivitäten — spiegelt
 * efficiency.js::decouplingTrend, nur mit übergebenen
 * Vergleichbarkeitskriterien (Q11) statt der Rad-Konstante COMPARABLE.
 * @param {Ride[]} activities  Aktivitäten mit `decoupling`-Wert
 * @param {{types: readonly string[], minDurationMin: number}} comparable
 *   z. B. runningSessionTypes.efficiencyComparable
 * @returns {null | {points: Array<{date: string, value: number}>, median: number, stableShare: number, slopePer30d: number|null, n: number}}
 *   null bei < DECOUPLING_MIN_POINTS geeigneten Aktivitäten
 */
export function paceDecouplingTrend(activities, comparable) {
  if (!comparable || !Array.isArray(comparable.types)) return null;
  const usable = (activities || [])
    .filter(
      (r) =>
        r.decoupling != null &&
        comparable.types.includes(r.typ) &&
        (r.min || 0) >= comparable.minDurationMin
    )
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (usable.length < DECOUPLING_MIN_POINTS) return null;

  const points = usable.map((r) => ({ date: r.dateISO, value: /** @type {number} */ (r.decoupling) }));
  const sortedVals = points.map((p) => p.value).sort((a, b) => a - b);
  const mid = Math.floor(sortedVals.length / 2);
  const median =
    sortedVals.length % 2
      ? sortedVals[mid]
      : Math.round(((sortedVals[mid - 1] + sortedVals[mid]) / 2) * 10) / 10;

  const stableShare = Math.round(
    (points.filter((p) => p.value < DECOUPLING_STABLE).length / points.length) * 100
  );

  let slopePer30d = null;
  const t0 = new Date(points[0].date).getTime();
  const trend = linearTrend(
    points.map((p) => ({ x: (new Date(p.date).getTime() - t0) / 86400000, y: p.value }))
  );
  if (trend) slopePer30d = Math.round(trend.slope * 30 * 100) / 100;

  return { points, median, stableShare, slopePer30d, n: points.length };
}
