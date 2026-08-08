/* ============================================================
   CORE/CADENCE.JS — Kadenz-Coach (kein DOM)
   Gezieltes Monitoring der bekannten Baustelle 80 → 90+ RPM:
   Entwicklung, Zielerreichungs-Quote und Aufschlüsselung nach
   Fahrttyp (niedrige Kadenz auf Z2-Fahrten ≠ auf Intervallen).
   ============================================================ */

/**
 * @param {import("../types.js").Ride[]} rides
 * @param {number} target Ziel-Kadenz (CONFIG.cadenceTarget)
 * @returns {null | {
 *   recentAvg: number, startAvg: number|null, delta: number|null,
 *   shareAbove: number, nAbove: number, nTotal: number,
 *   perType: Array<{typ: string, avg: number, n: number}>
 * }}
 */
export function cadenceCoach(rides, target) {
  const withKad = rides
    .filter((r) => r.kad != null)
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  if (withKad.length < 3) return null;

  const avg = (arr) => arr.reduce((s, r) => s + r.kad, 0) / arr.length;
  const N = Math.min(10, Math.floor(withKad.length / 2)) || 1;

  const recentAvg = avg(withKad.slice(-N));
  const startAvg = withKad.length >= 2 * N ? avg(withKad.slice(0, N)) : null;

  const nAbove = withKad.filter((r) => r.kad >= target).length;

  const typMap = {};
  for (const r of withKad) {
    const t = r.typ || "Sonstige";
    if (!typMap[t]) typMap[t] = { sum: 0, n: 0 };
    typMap[t].sum += r.kad;
    typMap[t].n++;
  }
  const perType = Object.entries(typMap)
    .map(([typ, v]) => ({ typ, avg: Math.round(v.sum / v.n), n: v.n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);

  return {
    recentAvg: Math.round(recentAvg * 10) / 10,
    startAvg: startAvg != null ? Math.round(startAvg * 10) / 10 : null,
    delta: startAvg != null ? Math.round((recentAvg - startAvg) * 10) / 10 : null,
    shareAbove: Math.round((nAbove / withKad.length) * 100),
    nAbove,
    nTotal: withKad.length,
    perType,
  };
}
