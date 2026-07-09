/* ============================================================
   CORE/BODY.JS — Regeneration & Körper (kein DOM)
   Gewichtstrend, Leistungsgewicht (W/kg), Energieverbrauch
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
  const energy = has("activeEnergy") || has("restingEnergy");
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
 * Energieverbrauch: Grundumsatz (RestingEnergy) + aktiv (ActiveEnergy) je Tag
 * aus Apple Health via intervals.icu. Näherung des Tages-Gesamtverbrauchs.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @returns {null | {days: Array<{date: string, resting: number, active: number, total: number}>, avgTotal: number, avgActive: number, avgResting: number, n: number}}
 */
export function energyView(wellness) {
  const rows = (wellness || []).filter((w) => w.activeEnergy != null || w.restingEnergy != null);
  if (rows.length < MIN_POINTS) return null;

  const days = rows
    .map((w) => {
      const resting = w.restingEnergy || 0;
      const active = w.activeEnergy || 0;
      return { date: w.dateISO || w.date, resting, active, total: resting + active };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const avg = (k) => Math.round(days.reduce((s, d) => s + d[k], 0) / days.length);
  return { days, avgTotal: avg("total"), avgActive: avg("active"), avgResting: avg("resting"), n: days.length };
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
