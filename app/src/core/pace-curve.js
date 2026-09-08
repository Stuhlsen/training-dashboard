/* ============================================================
   CORE/PACE-CURVE.JS — Beste Ø-Pace je Distanz (kein DOM)

   Das Pace-Pendant zur Power-Curve beim Rad (core/powercurve.js).
   Fahrplan 10 E7 — noch von niemandem konsumiert (E8 verdrahtet).

   ÜBER DISTANZ, nicht über Dauer: die Power-Curve arbeitet auf
   Sekunden-Streams (1s…60min-Bestwerte). rides-N.json trägt für
   Lauf/Schwimm KEINE Streams, nur Ganzfahrt-km/min/kmh (E0-Bericht
   2026-09-07, LP1: kein intervals.icu-Stream-Abruf). Also je Fahrt
   genau EIN Datenpunkt — der größte Distanz-Bucket, den ihre
   Gesamtdistanz abdeckt. Eine dauer-basierte Achse ist offen, bis
   echte Streams vorliegen.

   Einheiten: Distanz km, Dauer min → Pace in Sekunden pro km. Die
   Schwimm-Distanz-Curve ist bewusst NICHT hier — 0 Schwimm-Aktivitäten
   (E5/E7 Q3); die einheitsneutrale 2-Punkt-Formel in critical-speed.js
   deckt CSS synthetisch ab.
   ============================================================ */

/** @typedef {import("../types.js").Ride} Ride */

/** Standard-Distanz-Buckets Laufen (km). 21,0975 = Halbmarathon. */
export const STANDARD_RUN_DISTANCES_KM = [1, 2, 5, 10, 15, 21.0975];

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : 0);

/**
 * Pro Distanz-Bucket die schnellste (kürzeste Pace) passende Aktivität.
 * Eine Aktivität wird dem GRÖSSTEN Bucket ≤ ihrer Gesamtdistanz
 * zugeordnet (analog nearestWatts: der nächste abgedeckte Stützpunkt) —
 * genau ein Bucket je Aktivität, damit ein 13-km-Lauf nicht künstlich
 * auch den 1-km-Bestwert stellt (ohne Splits kein Teil-Distanz-Bestwert).
 * Geteilt mit critical-speed.js::estimateThresholdSpeed.
 * @param {Ride[]} rides  bereits auf eine Sportart gefiltert (Aufrufer)
 * @param {number[]} distances  aufsteigende Bucket-Grenzen, gleiche Einheit wie ride.km
 * @returns {Array<{bucket: number, distance: number, durationSec: number, paceSec: number}>}
 *   nach Bucket aufsteigend, nur belegte Buckets
 */
export function bestEffortPerBucket(rides, distances) {
  const buckets = [...(distances || [])].sort((a, b) => a - b);
  /** @type {Map<number, {bucket: number, distance: number, durationSec: number, paceSec: number}>} */
  const best = new Map();
  for (const r of rides || []) {
    const dist = num(r.km);
    const durMin = num(r.min);
    if (dist <= 0 || durMin <= 0) continue;
    let bucket = null;
    for (const cand of buckets) if (cand <= dist + 1e-9) bucket = cand;
    if (bucket == null) continue;
    const durationSec = durMin * 60;
    const paceSec = durationSec / dist;
    const cur = best.get(bucket);
    if (!cur || paceSec < cur.paceSec) {
      best.set(bucket, { bucket, distance: dist, durationSec, paceSec });
    }
  }
  return buckets.filter((b) => best.has(b)).map((b) => /** @type {any} */ (best.get(b)));
}

/** Bucket-Distanz → kurzes Label ("10 km", "HM"). Nicht-ganzzahlige
 *  Buckets (nur über ein eigenes `distances`-Argument möglich) auf eine
 *  Nachkommastelle. */
function distanceLabel(km) {
  if (Math.abs(km - 21.0975) < 1e-3) return "HM";
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

/**
 * Pace-Curve für die Chart-Anzeige: beste Ø-Pace je belegtem
 * Distanz-Bucket. Punkte ohne Datenlage werden ausgelassen (wie
 * buildCurveData beim Rad).
 * @param {Ride[]} rides  bereits auf eine Sportart gefiltert
 * @param {number[]} [distances]
 * @returns {Array<{distance: number, actualDistance: number, paceSec: number, label: string}>}
 */
export function buildPaceCurve(rides, distances = STANDARD_RUN_DISTANCES_KM) {
  return bestEffortPerBucket(rides, distances).map((e) => ({
    distance: e.bucket,
    actualDistance: Math.round(e.distance * 100) / 100,
    paceSec: Math.round(e.paceSec),
    label: distanceLabel(e.bucket),
  }));
}
