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
