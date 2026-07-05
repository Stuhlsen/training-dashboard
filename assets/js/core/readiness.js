/* ============================================================
   CORE/READINESS.JS — Tagesform-Ampel (kein DOM)
   Vergleicht die letzten 7 Tage (HRV/SDNN, Ruhepuls, Schlaf)
   gegen eine rollierende 42-Tage-Baseline (Mittelwert ± SD).
   Hintergrund: HRV-gesteuertes Training zeigte in Studien
   (u.a. Javaloyes 2019) bessere Anpassung als starre Pläne.
   Methodik: nutzt ausschließlich die intervals.icu-Wellness-Reihe
   (durchgehend SDNN) — kein Mischen mit Plan-1-RMSSD-Werten.
   ============================================================ */

export const BASELINE_DAYS = 42;
export const RECENT_DAYS = 7;
const Z_CAUTION = 0.75;
const Z_ALERT = 1.5;

/** Mittelwert + Standardabweichung (Population), null-sicher
 *  @param {number[]} values @returns {{mean: number, sd: number, n: number}|null} */
export function baselineStats(values) {
  const v = values.filter((x) => x != null && !isNaN(x));
  if (v.length < 5) return null; // zu wenig Historie für eine belastbare Baseline
  const mean = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
  return { mean, sd, n: v.length };
}

/** Status eines Metrik-Z-Werts. `higherIsBetter` dreht das Vorzeichen.
 *  @returns {"ok"|"caution"|"alert"|"nodata"} */
export function metricStatus(z, higherIsBetter) {
  if (z == null) return "nodata";
  const bad = higherIsBetter ? -z : z; // positive Werte = schlechter
  if (bad >= Z_ALERT) return "alert";
  if (bad >= Z_CAUTION) return "caution";
  return "ok";
}

/**
 * Tagesform aus der Wellness-Reihe bestimmen.
 * @param {import("../types.js").WellnessDay[]} wellness (beliebig sortiert)
 * @param {string} todayISO
 * @returns {null | {
 *   level: "green"|"yellow"|"red",
 *   metrics: Array<{key: string, label: string, recent: number|null, baseline: number|null, z: number|null, status: string, higherIsBetter: boolean}>,
 *   recommendation: string
 * }} null wenn zu wenig Daten
 */
export function assessReadiness(wellness, todayISO) {
  const sorted = [...(wellness || [])]
    .filter((w) => (w.dateISO || w.date) <= todayISO)
    .sort((a, b) => (a.dateISO || a.date).localeCompare(b.dateISO || b.date));
  if (sorted.length < 10) return null;

  const recent = sorted.slice(-RECENT_DAYS);
  const base = sorted.slice(-(BASELINE_DAYS + RECENT_DAYS), -RECENT_DAYS);
  if (base.length < 10) return null;

  const defs = [
    { key: "hrv", label: "HRV (SDNN)", get: (w) => w.hrv, higherIsBetter: true },
    { key: "restingHR", label: "Ruhepuls", get: (w) => w.restingHR, higherIsBetter: false },
    { key: "sleep", label: "Schlaf", get: (w) => w.sleepHours, higherIsBetter: true },
  ];

  const metrics = defs.map((d) => {
    const b = baselineStats(base.map(d.get));
    const rVals = recent.map(d.get).filter((x) => x != null && !isNaN(x));
    const rMean = rVals.length ? rVals.reduce((s, x) => s + x, 0) / rVals.length : null;
    const z = b && b.sd > 0 && rMean != null ? (rMean - b.mean) / b.sd : null;
    return {
      key: d.key,
      label: d.label,
      recent: rMean != null ? Math.round(rMean * 10) / 10 : null,
      baseline: b ? Math.round(b.mean * 10) / 10 : null,
      z: z != null ? Math.round(z * 100) / 100 : null,
      status: metricStatus(z, d.higherIsBetter),
      higherIsBetter: d.higherIsBetter,
    };
  });

  const statuses = metrics.map((m) => m.status);
  let level = "green";
  if (statuses.includes("alert")) level = "red";
  else if (statuses.filter((s) => s === "caution").length >= 2) level = "yellow";
  else if (statuses.includes("caution")) level = "yellow";

  const recommendation =
    level === "green"
      ? "Einheit wie geplant fahren."
      : level === "yellow"
        ? "Intensität heute eine Stufe reduzieren — Umfang ist okay."
        : "Erholung priorisieren: Ruhetag oder lockeres Ausrollen erwägen.";

  return { level, metrics, recommendation };
}
