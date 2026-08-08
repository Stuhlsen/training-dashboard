/* ============================================================
   CORE/STATS.JS — Reine Statistik-Helfer (kein DOM)
   ============================================================ */

/** Durchschnitt eines Arrays (ignoriert null/undefined/NaN)
 *  @param {Array<Object|number>} arr @param {string} [key] @returns {number|null} */
export const avg = (arr, key) => {
  const vals = arr.map((x) => (key ? x[key] : x)).filter((v) => v != null && !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
};

/** Maximum, ignoriert null
 *  @param {Array<Object|number>} arr @param {string} [key] @returns {number|null} */
export const maxVal = (arr, key) => {
  const vals = arr.map((x) => (key ? x[key] : x)).filter((v) => v != null);
  return vals.length ? Math.max(...vals) : null;
};

/** Minimum, ignoriert null
 *  @param {Array<Object|number>} arr @param {string} [key] @returns {number|null} */
export const minVal = (arr, key) => {
  const vals = arr.map((x) => (key ? x[key] : x)).filter((v) => v != null);
  return vals.length ? Math.min(...vals) : null;
};

/** Summe, null zählt als 0
 *  @param {Array<Object|number>} arr @param {string} [key] @returns {number} */
export const sum = (arr, key) => arr.reduce((s, x) => s + ((key ? x[key] : x) || 0), 0);

/**
 * Einfache lineare Regression über Punkte {x, y}.
 * Liefert null, wenn zu wenige Punkte oder alle x identisch sind.
 * @param {Array<{x: number, y: number}>} points
 * @returns {{slope: number, intercept: number}|null}
 */
export const linearTrend = (points) => {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  const denom = points.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (denom === 0) return null;
  const slope = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denom;
  return { slope, intercept: my - slope * mx };
};
