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

import { SOURCE_KEYS } from "./nutrition-sources.js";

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
  const energy = has("activeEnergy") || has("restingEnergy") || has("kcalConsumed");
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

/** Nächstgelegenes bekanntes Gewicht zu einem Fahrt-Datum — Rides tragen
 *  selbst kein Gewicht (nur WellnessDay, s. Dateikopf), für Watt/kg
 *  (EfficiencyDetailScatter.tsx) muss also über das Datum gejoint werden.
 *  Fahrten ohne Treffer innerhalb maxGapDays bleiben ohne Watt/kg (kein
 *  Fallback-Wert) — vor allem alte Notion-Fahrten ohne Wellness-Sync.
 *  @param {import("../types.js").WellnessDay[]} wellness
 *  @param {string} dateISO @param {number} [maxGapDays]
 *  @returns {number|null} kg, oder null ohne Treffer im Fenster */
export function nearestWeightKg(wellness, dateISO, maxGapDays = 21) {
  const target = new Date(dateISO + "T00:00:00").getTime();
  if (Number.isNaN(target)) return null;

  let best = null;
  let bestGapDays = Infinity;
  for (const w of wellness || []) {
    if (w.weight == null) continue;
    const d = w.dateISO || w.date;
    if (!d) continue;
    const t = new Date(d + "T00:00:00").getTime();
    if (Number.isNaN(t)) continue;
    const gapDays = Math.abs(t - target) / 86400000;
    if (gapDays < bestGapDays) {
      bestGapDays = gapDays;
      best = w.weight;
    }
  }
  return bestGapDays <= maxGapDays ? best : null;
}

/**
 * Energie je Tag: Verbrauch (Grundumsatz RestingEnergy + aktiv ActiveEnergy)
 * und/oder Zufuhr (kcalConsumed) — je nachdem, was getrackt wird. Quelle
 * Apple Health / intervals.icu. Bei beidem ergibt sich eine Bilanz-Ansicht.
 * @param {import("../types.js").WellnessDay[]} wellness
 * @param {number|null} [estBMR]
 * @returns {null | {days: Array<{date: string, resting: number, active: number, burned: number, intake: number|null}>, hasExpenditure: boolean, hasResting: boolean, restingEstimated: boolean, hasIntake: boolean, avgBurned: number|null, avgResting: number|null, avgActive: number|null, avgIntake: number|null, n: number}}
 */
export function energyView(wellness, estBMR = null) {
  const rows = (wellness || []).filter(
    (w) => w.activeEnergy != null || w.restingEnergy != null || w.kcalConsumed != null
  );
  if (rows.length < MIN_POINTS) return null;

  let usedEstimate = false;
  const days = rows
    .map((w) => {
      let resting = w.restingEnergy != null ? w.restingEnergy : 0;
      if (w.restingEnergy == null && estBMR) {
        resting = estBMR;
        usedEstimate = true;
      }
      const active = w.activeEnergy || 0;
      return {
        date: w.dateISO || w.date,
        resting,
        active,
        burned: resting + active,
        intake: w.kcalConsumed != null ? w.kcalConsumed : null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const avg = (sel) => {
    const vals = days.map(sel).filter((v) => v != null && v > 0);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };
  return {
    days,
    hasExpenditure: days.some((d) => d.burned > 0),
    hasResting: days.some((d) => d.resting > 0),
    restingEstimated: usedEstimate,
    hasIntake: days.some((d) => d.intake != null),
    avgBurned: avg((d) => d.burned),
    avgResting: avg((d) => d.resting),
    avgActive: avg((d) => d.active),
    avgIntake: avg((d) => d.intake),
    n: days.length,
  };
}

/** Ab dieser relativen Abweichung (bezogen auf Ten-Haaf) gilt ein gemessener
 *  Körperfett-Wert als unplausibel. Eigene Setzung, Fahrplan 23 E34. */
const BODYFAT_PLAUSIBILITY_TOLERANCE = 0.2;
/** Altersbereich, an dem Ten-Haaf geprüft wurde (ten Haaf 2014). */
const TEN_HAAF_AGE_MIN = 18;
const TEN_HAAF_AGE_MAX = 35;

const isPositive = (n) => typeof n === "number" && Number.isFinite(n) && n > 0;

/** Ten Haaf 2014, gewichtsbasiert (kcal/Tag). sexFactor: m=1, f=0, unbekannt=0,5. */
function tenHaaf(weightKg, heightCm, age, sexFactor) {
  return (
    11.936 * weightKg +
    587.728 * (heightCm / 100) -
    8.129 * age +
    191.027 * sexFactor +
    29.279
  );
}

/**
 * Grundumsatz-Schätzung nach Datenlage (Fahrplan 23 E33–E35):
 * gemessenes Körperfett → Cunningham 1980, sonst Ten-Haaf 2014. Weichen beide
 * um mehr als 20 % ab, gilt das Körperfett als unplausibel → Ten-Haaf + Hinweis.
 * Für Sportler; Mifflin-St-Jeor liegt dort ~10 % zu niedrig (O'Neill 2023).
 * `bodyFatPct` nur als GEMESSENER Wert übergeben, nie einen Standardwert.
 *
 * @param {{weightKg?:number, heightCm?:number, age?:number, sex?:string|null,
 *          bodyFatPct?:number|null, bodyFatDate?:string|null}} p
 * @returns {{ok:true, kcal:number, formula:"cunningham-1980"|"ten-haaf-2014", source:string,
 *            note:string, hints:string[], bodyFatDate:string|null}|{ok:false, hint:string}}
 */
export function estimateRestingEnergy({ weightKg, heightCm, age, sex, bodyFatPct, bodyFatDate } = {}) {
  const missing = [];
  if (!isPositive(weightKg)) missing.push("Gewicht (kg)");
  if (!isPositive(heightCm)) missing.push("Größe (cm)");
  if (!isPositive(age)) missing.push("Alter");
  if (missing.length) return { ok: false, hint: `Profil ergänzen: ${missing.join(", ")}` };

  const sexFactor = sex === "m" ? 1 : sex === "f" || sex === "w" ? 0 : 0.5;
  const th = tenHaaf(weightKg, heightCm, age, sexFactor);
  const hints = [];

  if (isPositive(bodyFatPct) && bodyFatPct < 100) {
    const cunningham = 500 + 22 * weightKg * (1 - bodyFatPct / 100);
    if (Math.abs(cunningham - th) / th <= BODYFAT_PLAUSIBILITY_TOLERANCE) {
      return {
        ok: true,
        kcal: Math.round(cunningham),
        formula: "cunningham-1980",
        source: SOURCE_KEYS.CUNNINGHAM_1980,
        note: "Grundumsatz nach Cunningham 1980 (aus gemessenem Körperfett); Schätzung, kein exakter Wert.",
        hints,
        bodyFatDate: bodyFatDate ?? null,
      };
    }
    hints.push("Körperfett-Wert passt nicht zu Gewicht und Größe, bitte prüfen");
  } else if (bodyFatPct != null) {
    // Wert übergeben, aber keine Zahl in (0, 100) — kein Normalfall ohne Messung (null/undefined)
    hints.push("Körperfett-Wert ungültig, wird ignoriert");
  }

  if (age < TEN_HAAF_AGE_MIN || age > TEN_HAAF_AGE_MAX) {
    hints.push("Formel wurde an 18- bis 35-Jährigen geprüft, hier unsicherer");
  }
  if (sex !== "m" && sex !== "f" && sex !== "w") {
    hints.push("Geschlecht fehlt, Schätzung ungenauer");
  }
  return {
    ok: true,
    kcal: Math.round(th),
    formula: "ten-haaf-2014",
    source: SOURCE_KEYS.TEN_HAAF_2014,
    note: "Grundumsatz nach Ten-Haaf 2014; Schätzung, kein exakter Wert.",
    hints,
    bodyFatDate: null,
  };
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
