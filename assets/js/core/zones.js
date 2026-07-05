/* ============================================================
   CORE/ZONES.JS — Intensitätsverteilung / Time-in-Zone (kein DOM)
   Grundlage: Intensitätsverteilungs-Forschung (Seiler) — für
   Ausdauersportler haben sich pyramidale/polarisierte Verteilungen
   mit ≥ ~80% Zeit im niedrigintensiven Bereich bewährt.
   ============================================================ */

/** Ziel-Anteil niedrigintensiver Zeit (Z1+Z2) als Richtwert */
export const LOW_INTENSITY_TARGET = 0.8;

/**
 * intervals.icu liefert Zone-Times je nach API-Version als Array von
 * Sekunden ODER als Array von {id, secs}-Objekten — hier normalisiert
 * auf ein reines Sekunden-Array (Index = Zone).
 * @param {unknown} zt
 * @returns {number[]|null}
 */
export function normalizeZoneTimes(zt) {
  if (!Array.isArray(zt) || !zt.length) return null;
  if (typeof zt[0] === "number") return zt.map((v) => v || 0);
  if (typeof zt[0] === "object" && zt[0] !== null) {
    return zt.map((z) => z.secs || z.seconds || 0);
  }
  return null;
}

/**
 * Zonen-Sekunden auf drei Intensitätsbänder verdichten (Coggan-Zonen):
 * low = Z1+Z2 (Grundlage) · mid = Z3+Z4 (Tempo/Schwelle) · high = Z5+ (VO2max+)
 * @param {number[]} secs
 * @returns {{low: number, mid: number, high: number, total: number}}
 */
export function bandZoneTimes(secs) {
  const at = (i) => secs[i] || 0;
  const low = at(0) + at(1);
  const mid = at(2) + at(3);
  const high = secs.slice(4).reduce((s, v) => s + (v || 0), 0);
  return { low, mid, high, total: low + mid + high };
}

/**
 * Wöchentliche Intensitätsverteilung aus Fahrten mit zoneTimes.
 * Wochen ohne Zonendaten entfallen.
 * @param {import("../types.js").Ride[]} rides
 * @param {(r: import("../types.js").Ride) => string} weekKeyFn
 * @param {(a: string, b: string) => number} weekSortFn
 * @returns {Array<{week: string, low: number, mid: number, high: number, lowShare: number, hours: number, onTarget: boolean}>}
 */
export function weeklyZoneShares(rides, weekKeyFn, weekSortFn) {
  const byWeek = {};
  for (const r of rides) {
    const secs = normalizeZoneTimes(r.zoneTimes);
    if (!secs) continue;
    const key = weekKeyFn(r);
    if (!key) continue;
    const band = bandZoneTimes(secs);
    if (!byWeek[key]) byWeek[key] = { low: 0, mid: 0, high: 0 };
    byWeek[key].low += band.low;
    byWeek[key].mid += band.mid;
    byWeek[key].high += band.high;
  }

  return Object.keys(byWeek)
    .sort(weekSortFn)
    .map((week) => {
      const b = byWeek[week];
      const total = b.low + b.mid + b.high;
      if (!total) return null;
      const lowShare = b.low / total;
      return {
        week,
        low: b.low,
        mid: b.mid,
        high: b.high,
        lowShare: Math.round(lowShare * 1000) / 1000,
        hours: Math.round((total / 3600) * 10) / 10,
        onTarget: lowShare >= LOW_INTENSITY_TARGET,
      };
    })
    .filter(Boolean);
}
