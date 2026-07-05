/* ============================================================
   CORE/BODY.JS — Regeneration & Körper (kein DOM)
   Gewichtstrend, Leistungsgewicht (W/kg), Energiebilanz-Näherung
   und Hydration aus der Wellness-Reihe.

   Hintergrund: Chronisch niedrige Energieverfügbarkeit verschlechtert
   Regeneration, Anpassung und Hormonstatus (RED-S-Risiko); Dehydration
   reduziert das Plasmavolumen und treibt die HF-Drift — beides
   beeinflusst Trainingsqualität UND die Aussagekraft HF-basierter
   Marker (EF, Decoupling). W/kg ist der zentrale relative
   Leistungsmarker im Radsport.

   Sichtbarkeitsprinzip: Alles hier ist datengetrieben — availability()
   entscheidet pro Unterthema, ob genug Datenpunkte vorliegen. Keine
   athletenspezifische Sonderlogik (siehe AGENTS.md-Prinzip für
   plan-spezifische Sektionen).
   ============================================================ */

/** Mindestdichte: so viele non-null-Tage in den letzten WINDOW_DAYS */
export const MIN_POINTS = 5;
export const WINDOW_DAYS = 30;

/** kJ einer Fahrt aus Ø-Watt und Dauer. Bei ~20–25% Wirkungsgrad gilt
 *  die Faustregel kJ ≈ kcal Nahrungsäquivalent (Näherung, kein Messwert).
 *  @param {import("../types.js").Ride} r @returns {number|null} */
export function rideKJ(r) {
  if (!r || !r.watt || !r.min) return null;
  return Math.round((r.watt * r.min * 60) / 1000);
}

/** Non-null-Werte eines Felds innerhalb der letzten windowDays vor todayISO
 *  @param {import("../types.js").WellnessDay[]} wellness
 *  @param {string} field @param {string} todayISO @param {number} windowDays */
function recentValues(wellness, field, todayISO, windowDays) {
  const cutoff = new Date(todayISO + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - windowDays);
  const iso = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return (wellness || []).filter((w) => {
    const d = w.dateISO || w.date;
    return d && d >= iso && d <= todayISO && w[field] != null;
  });
}

/**
 * Verfügbarkeit der Unterthemen — entscheidet, welche Kacheln gerendert
 * werden. any === false → ganze Sektion ausblenden.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @param {string} todayISO
 * @returns {{weight: boolean, energy: boolean, hydration: boolean, any: boolean}}
 */
export function availability(wellness, todayISO) {
  const has = (field) => recentValues(wellness, field, todayISO, WINDOW_DAYS).length >= MIN_POINTS;
  const weight = has("weight");
  const energy = has("kcalConsumed");
  const hydration = has("hydrationVolume") || has("hydration");
  return { weight, energy, hydration, any: weight || energy || hydration };
}

/**
 * Gewichtstrend: Zeitreihe + 7-Tage-Glättung + 30-Tage-Delta.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @returns {null | {points: Array<{date: string, weight: number}>, smoothed: Array<number|null>, current: number, delta30d: number|null, n: number}}
 */
export function weightTrend(wellness) {
  const points = (wellness || [])
    .filter((w) => w.weight != null)
    .map((w) => ({ date: w.dateISO || w.date, weight: w.weight }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < MIN_POINTS) return null;

  const smoothed = points.map((_, i) => {
    const slice = points.slice(Math.max(0, i - 6), i + 1);
    if (slice.length < 3) return null;
    return Math.round((slice.reduce((s, p) => s + p.weight, 0) / slice.length) * 10) / 10;
  });

  const current = points[points.length - 1].weight;
  const lastDate = new Date(points[points.length - 1].date + "T00:00:00");
  lastDate.setDate(lastDate.getDate() - 30);
  const cut = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
  const older = points.filter((p) => p.date <= cut);
  const ref = older.length ? older[older.length - 1].weight : points[0].weight;
  const delta30d = Math.round((current - ref) * 10) / 10;

  return { points, smoothed, current, delta30d, n: points.length };
}

/** Leistungsgewicht. Label des FTP-Bezugs bitte in der UI IMMER mitführen
 *  (gemessen vs. geschätzt vs. Ziel dürfen nicht vermischt werden).
 *  @param {number|null} watts @param {number|null} weightKg
 *  @returns {number|null} W/kg, 2 Nachkommastellen */
export function wattsPerKg(watts, weightKg) {
  if (!watts || !weightKg || weightKg <= 0) return null;
  return Math.round((watts / weightKg) * 100) / 100;
}

/**
 * Energiebilanz-Näherung: aufgenommene kcal vs. Trainingsenergie (kJ ≈ kcal).
 * KEINE echte Bilanz (Grundumsatz fehlt bewusst) — zeigt nur, ob hohe
 * Trainingslast von entsprechender Zufuhr begleitet wird.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @param {import("../types.js").Ride[]} rides
 * @returns {null | {days: Array<{date: string, kcalIn: number, trainingKcal: number}>, avgIn: number, avgTraining: number, n: number}}
 */
export function energyView(wellness, rides) {
  const kcalDays = (wellness || []).filter((w) => w.kcalConsumed != null);
  if (kcalDays.length < MIN_POINTS) return null;

  const trainingByDate = {};
  for (const r of rides || []) {
    const kj = rideKJ(r);
    if (kj == null) continue;
    const d = r.dateISO || r.date;
    trainingByDate[d] = (trainingByDate[d] || 0) + kj;
  }

  const days = kcalDays
    .map((w) => ({
      date: w.dateISO || w.date,
      kcalIn: w.kcalConsumed,
      trainingKcal: trainingByDate[w.dateISO || w.date] || 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const avg = (k) => Math.round(days.reduce((s, d) => s + d[k], 0) / days.length);
  return { days, avgIn: avg("kcalIn"), avgTraining: avg("trainingKcal"), n: days.length };
}

/**
 * Hydration-Reihe: bevorzugt hydrationVolume (ml), Fallback Score.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @returns {null | {points: Array<{date: string, value: number}>, field: "hydrationVolume"|"hydration", avg: number, n: number}}
 */
export function hydrationSeries(wellness) {
  for (const field of ["hydrationVolume", "hydration"]) {
    const points = (wellness || [])
      .filter((w) => w[field] != null)
      .map((w) => ({ date: w.dateISO || w.date, value: w[field] }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (points.length >= MIN_POINTS) {
      const avg = Math.round((points.reduce((s, p) => s + p.value, 0) / points.length) * 10) / 10;
      return { points, field, avg, n: points.length };
    }
  }
  return null;
}
