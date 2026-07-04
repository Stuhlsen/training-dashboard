/* ============================================================
   CORE/POWERCURVE.JS — Power-Curve-Auswertung (kein DOM)
   Parst beide intervals.icu-Antwortformate und mappt auf die
   Standard-Zeitintervalle des Charts.
   ============================================================ */

export const STANDARD_SECS = [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600];
export const STANDARD_LABELS = ["1s", "5s", "10s", "30s", "1min", "2min", "5min", "10min", "20min", "30min", "60min"];

/**
 * Nächsten verfügbaren Watt-Wert für eine Sekunden-Anzahl finden.
 * @param {Record<number, number>} map secs → watts
 * @param {number} targetSecs
 * @returns {number|null}
 */
export function nearestWatts(map, targetSecs) {
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  if (!keys.length) return null;
  const nearest = keys.reduce(
    (prev, curr) => (Math.abs(curr - targetSecs) < Math.abs(prev - targetSecs) ? curr : prev),
    keys[0]
  );
  return nearest != null ? map[nearest] : null;
}

/**
 * Extrahiert secs/watts aus der intervals.icu-Power-Curve-Antwort.
 * Unterstützt beide Formate: { list: [{secs, watts}, …] } und { secs, watts }.
 * @param {Object|null|undefined} powerCurves
 * @returns {{secs: number[], watts: number[]}}
 */
export function extractPowerCurve(powerCurves) {
  if (!powerCurves) return { secs: [], watts: [] };
  if (powerCurves.list && Array.isArray(powerCurves.list) && powerCurves.list.length > 0) {
    const best = powerCurves.list[0];
    return { secs: best.secs || [], watts: best.watts || [] };
  }
  if (powerCurves.secs && powerCurves.watts) {
    return { secs: powerCurves.secs, watts: powerCurves.watts };
  }
  return { secs: [], watts: [] };
}

/**
 * Baut die Chart-Datenpunkte für die Standard-Zeitintervalle.
 * Punkte ohne (gültigen) Watt-Wert werden ausgelassen.
 * @param {Object|null|undefined} powerCurves
 * @returns {Array<{secs: number, watts: number, label: string}>}
 */
export function buildCurveData(powerCurves) {
  const { secs, watts } = extractPowerCurve(powerCurves);

  const wattsMap = {};
  for (let i = 0; i < secs.length; i++) {
    if (watts[i] != null && watts[i] > 0) wattsMap[secs[i]] = watts[i];
  }

  return STANDARD_SECS.map((s, i) => ({
    secs: s,
    watts: nearestWatts(wattsMap, s),
    label: STANDARD_LABELS[i],
  })).filter((d) => d.watts && d.watts > 0);
}
