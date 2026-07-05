/* ============================================================
   CORE/FTP-FORECAST.JS — FTP-Retest-Prognose (kein DOM)
   Lineare Projektion der eFTP-Entwicklung auf den Retest-Termin,
   mit Unsicherheitsband aus den Residuen. Realistische Ziel-
   erwartung vor dem Taper: verhindert Frust und zu aggressives
   Nachlegen gleichermaßen.
   ============================================================ */

import { linearTrend } from "./stats.js";

/**
 * eFTP-Historie aus Fahrten extrahieren (pro Tag der höchste Wert).
 * @param {import("../types.js").Ride[]} rides
 * @returns {Array<{date: string, eftp: number}>} chronologisch
 */
export function eftpHistory(rides) {
  const byDate = {};
  for (const r of rides) {
    if (r.eftp == null) continue;
    if (!byDate[r.dateISO] || r.eftp > byDate[r.dateISO]) byDate[r.dateISO] = r.eftp;
  }
  return Object.entries(byDate)
    .map(([date, eftp]) => ({ date, eftp }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Projektion auf ein Zieldatum, gefittet über die letzten windowDays.
 * @param {Array<{date: string, eftp: number}>} history
 * @param {string} targetISO Retest-Datum
 * @param {{windowDays?: number}} [opts]
 * @returns {null | {projected: number, low: number, high: number, slopePerWeek: number, nPoints: number}}
 */
export function forecastFtp(history, targetISO, opts = {}) {
  if (!history || history.length < 3) return null;
  const windowDays = opts.windowDays ?? 56;

  const lastDate = history[history.length - 1].date;
  const cutoff = new Date(new Date(lastDate).getTime() - windowDays * 86400000)
    .toISOString().split("T")[0];
  const window = history.filter((h) => h.date >= cutoff);
  if (window.length < 3) return null;

  const t0 = new Date(window[0].date).getTime();
  const pts = window.map((h) => ({
    x: (new Date(h.date).getTime() - t0) / 86400000,
    y: h.eftp,
  }));
  const trend = linearTrend(pts);
  if (!trend) return null;

  // Residuen-Streuung als Unsicherheitsband
  const residuals = pts.map((p) => p.y - (trend.slope * p.x + trend.intercept));
  const rsd = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length);

  const xTarget = (new Date(targetISO).getTime() - t0) / 86400000;
  const projected = trend.slope * xTarget + trend.intercept;
  const band = Math.max(2, rsd * 1.5); // mind. ±2 W — Punktprognosen wären Scheingenauigkeit

  return {
    projected: Math.round(projected),
    low: Math.round(projected - band),
    high: Math.round(projected + band),
    slopePerWeek: Math.round(trend.slope * 7 * 10) / 10,
    nPoints: window.length,
  };
}

/**
 * eFTP-Historie aus der Wellness-Reihe (sportInfo-Tageswert) — robustere
 * Quelle als icu_eftp an den Activities, mit Fahrten-Historie mergebar.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @returns {Array<{date: string, eftp: number}>} chronologisch
 */
export function eftpHistoryFromWellness(wellness) {
  return (wellness || [])
    .filter((w) => w.eftp != null)
    .map((w) => ({ date: w.dateISO || w.date, eftp: w.eftp }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Beide eFTP-Quellen zusammenführen (pro Tag der höchste Wert)
 *  @param {Array<{date: string, eftp: number}>} a
 *  @param {Array<{date: string, eftp: number}>} b */
export function mergeEftpHistories(a, b) {
  const byDate = {};
  for (const h of [...(a || []), ...(b || [])]) {
    if (!byDate[h.date] || h.eftp > byDate[h.date]) byDate[h.date] = h.eftp;
  }
  return Object.entries(byDate)
    .map(([date, eftp]) => ({ date, eftp }))
    .sort((a2, b2) => a2.date.localeCompare(b2.date));
}

/** Maximaler Prognose-Horizont für dateForTarget (Tage) — längere
 *  lineare Extrapolationen wären Scheingenauigkeit */
export const TARGET_HORIZON_DAYS = 365;

/**
 * Invertierte Prognose: WANN erreicht der aktuelle eFTP-Trend targetWatts?
 * Für Athleten ohne Retest-Termin (Ziel-Horizont statt Terminprognose).
 * @param {Array<{date: string, eftp: number}>} history
 * @param {number} targetWatts
 * @param {{windowDays?: number}} [opts]
 * @returns {null | {reached: true, date: string, days: number, slopePerWeek: number}
 *                | {reached: false, slopePerWeek: number|null, reason: "flat"|"horizon"}}
 *   null bei zu wenig Daten
 */
export function dateForTarget(history, targetWatts, opts = {}) {
  if (!history || history.length < 3 || !targetWatts) return null;
  const windowDays = opts.windowDays ?? 56;

  const lastDate = history[history.length - 1].date;
  const last = history[history.length - 1].eftp;
  if (last >= targetWatts) {
    return { reached: true, date: lastDate, days: 0, slopePerWeek: 0 };
  }

  const cutoff = new Date(new Date(lastDate).getTime() - windowDays * 86400000)
    .toISOString().split("T")[0];
  const window = history.filter((h) => h.date >= cutoff);
  if (window.length < 3) return null;

  const t0 = new Date(window[0].date).getTime();
  const pts = window.map((h) => ({ x: (new Date(h.date).getTime() - t0) / 86400000, y: h.eftp }));
  const trend = linearTrend(pts);
  if (!trend) return null;

  const slopePerWeek = Math.round(trend.slope * 7 * 10) / 10;
  if (trend.slope <= 0) return { reached: false, slopePerWeek, reason: "flat" };

  const xLast = (new Date(lastDate).getTime() - t0) / 86400000;
  const days = Math.ceil((targetWatts - (trend.slope * xLast + trend.intercept)) / trend.slope);
  if (days > TARGET_HORIZON_DAYS) return { reached: false, slopePerWeek, reason: "horizon" };

  const d = new Date(new Date(lastDate).getTime() + Math.max(0, days) * 86400000);
  return {
    reached: true,
    date: d.toISOString().split("T")[0],
    days: Math.max(0, days),
    slopePerWeek,
  };
}
