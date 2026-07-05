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

/**
 * Gesamt-Intensitätsverteilung über alle Fahrten mit zoneTimes.
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {low: number, mid: number, high: number, total: number, shares: {low: number, mid: number, high: number}, hours: number, nRides: number, source: "zoneTimes"}}
 */
export function overallZoneShares(rides) {
  let low = 0, mid = 0, high = 0, n = 0;
  for (const r of rides || []) {
    const secs = normalizeZoneTimes(r.zoneTimes);
    if (!secs) continue;
    const b = bandZoneTimes(secs);
    low += b.low; mid += b.mid; high += b.high; n++;
  }
  const total = low + mid + high;
  if (!total || !n) return null;
  const share = (v) => Math.round((v / total) * 1000) / 1000;
  return {
    low, mid, high, total,
    shares: { low: share(low), mid: share(mid), high: share(high) },
    hours: Math.round((total / 3600) * 10) / 10,
    nRides: n,
    source: "zoneTimes",
  };
}

/** IF-Grenzen für die Fallback-Bänderung (Ganzfahrt-IF, grob):
 *  low < 0.75 · mid 0.75–1.05 · high > 1.05 */
export const IF_BANDS = { lowMax: 0.75, midMax: 1.05 };

/**
 * Ganzfahrt-Intensitätsfaktor einer Fahrt. Bevorzugt das gelieferte
 * r.if, leitet es sonst aus NP/FTP ab (IF = NP ÷ FTP) — im aktuellen
 * Datenbestand trägt nur ein Bruchteil der Fahrten r.if, aber fast alle
 * np + ftpWatt, sodass die Ableitung die Bänderung erst repräsentativ macht.
 * @param {import("../types.js").Ride} r @returns {number|null}
 */
export function rideIF(r) {
  if (r.if != null) return r.if;
  if (r.np && r.ftpWatt) return r.np / r.ftpWatt;
  return null;
}

/**
 * Fallback ohne zoneTimes: Fahrten per Ganzfahrt-IF in Bänder einordnen,
 * gewichtet mit der Dauer. Bewusst grob (Intervalle verwässern den
 * Ganzfahrt-IF) — in der UI IMMER als "Näherung über IF" labeln.
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {low: number, mid: number, high: number, total: number, shares: {low: number, mid: number, high: number}, hours: number, nRides: number, source: "if"}}
 */
export function overallBandsFromIF(rides) {
  let low = 0, mid = 0, high = 0, n = 0;
  for (const r of rides || []) {
    const factor = rideIF(r);
    if (factor == null || !r.min) continue;
    const secs = r.min * 60;
    if (factor < IF_BANDS.lowMax) low += secs;
    else if (factor <= IF_BANDS.midMax) mid += secs;
    else high += secs;
    n++;
  }
  const total = low + mid + high;
  if (!total || !n) return null;
  const share = (v) => Math.round((v / total) * 1000) / 1000;
  return {
    low, mid, high, total,
    shares: { low: share(low), mid: share(mid), high: share(high) },
    hours: Math.round((total / 3600) * 10) / 10,
    nRides: n,
    source: "if",
  };
}

/**
 * Klassifikation der Verteilungsform (3-Zonen-Modell):
 * - polarisiert: low dominiert, high > mid
 * - pyramidal:   low > mid > high
 * - schwellenlastig: mid ≥ low (Mittelbereich dominiert)
 * @param {{low: number, mid: number, high: number}} shares Anteile (0–1)
 * @returns {{shape: "polarisiert"|"pyramidal"|"schwellenlastig", onTarget: boolean, note: string}}
 */
export function distributionShape(shares) {
  const { low, mid, high } = shares;
  let shape;
  if (mid >= low) shape = "schwellenlastig";
  else if (high > mid) shape = "polarisiert";
  else shape = "pyramidal";

  const onTarget = low >= LOW_INTENSITY_TARGET;
  const note =
    shape === "schwellenlastig"
      ? "Viel Zeit im mittleren Bereich — typisches Muster, wenn Grundlagenfahrten zu hart geraten."
      : onTarget
        ? `${shape === "polarisiert" ? "Polarisiert" : "Pyramidal"} mit ≥80% niedriger Intensität — bewährtes Ausdauermuster.`
        : `${shape === "polarisiert" ? "Polarisierte" : "Pyramidale"} Form, aber der Grundlagenanteil liegt unter dem 80%-Richtwert.`;
  return { shape, onTarget, note };
}
