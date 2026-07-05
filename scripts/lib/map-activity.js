/* ============================================================
   SCRIPTS/LIB/MAP-ACTIVITY.JS — intervals.icu-Activity → Ride
   Typ-Ableitung aus dem Intensity Factor (rein, testbar) und
   die beiden Mapper für Athlet 1 (Plan 2) und Athlet 2.
   ============================================================ */

import { PLANNED_SESSIONS, getPlan2WeekPhase } from "./plan2.js";
import { getWeatherForRide } from "./weather.js";

/** Fallback-FTP für die Typ-Ableitung — wird bei neuem Ramp-Test aktualisiert */
export const DEFAULT_FTP = 193;

/**
 * Trainingstyp aus NP/FTP (Intensity Factor) ableiten, wenn kein Plan-Match.
 * Rein und testbar — Grenzwerte siehe tests/typ-inferenz.test.js.
 * @param {number|null|undefined} np Normalized Power
 * @param {number} min Fahrtdauer in Minuten
 * @param {number|null} [ftp]
 * @returns {string}
 */
export function inferTypFromIF(np, min, ftp = DEFAULT_FTP) {
  if (!np || !ftp) return "Außerplanmäßig";
  const ifVal = np / ftp;
  // Kurze Fahrten (<30 min) mit hohem IF = Intervall/Test
  if (min < 30 && ifVal > 0.95) return "FTP-Test";
  if (ifVal < 0.75) {
    // Niedriger IF allein heißt nicht "Erholung" — lange Fahrten mit
    // niedrigem NP sind typischerweise Grundlagenausdauer, nicht Recovery
    if (min >= 120) return "Z2 Lang";
    if (min >= 60)  return "Z2 Dauer";
    return "Z1 Recovery";
  }
  if (ifVal < 0.85)              return "Z2 Dauer";
  if (ifVal < 0.90)              return "Tempo";
  if (ifVal < 0.95)              return "Sweet Spot";
  if (ifVal < 1.05)              return "Schwelle";
  return "VO2max";
}

/** Gemeinsame Feldmenge beider Mapper */
function baseFields(act, weather) {
  const min = Math.round((act.moving_time || 0) / 60);
  return {
    date: act.start_date_local.split("T")[0],
    startTime: act.start_date_local || null,
    km: Math.round((act.distance || 0) / 100) / 10,
    min,
    kmh: Math.round((act.average_speed || 0) * 3.6 * 10) / 10,
    watt: act.icu_average_watts,
    maxWatt: null,
    np: act.icu_weighted_avg_watts,
    hf: act.average_heartrate,
    hfMax: act.max_heartrate,
    kad: act.average_cadence ? Math.round(act.average_cadence) : null,
    hoehe: act.total_elevation_gain,
    tss: act.icu_training_load,
    if: act.icu_intensity ? Math.round(act.icu_intensity) / 100 : null,
    vi: act.icu_variability_index ? Math.round(act.icu_variability_index * 100) / 100 : null,
    trimp: act.trimp ? Math.round(act.trimp) : null,
    ctl: act.icu_ctl ? Math.round(act.icu_ctl * 10) / 10 : null,
    atl: act.icu_atl ? Math.round(act.icu_atl * 10) / 10 : null,
    tsb: (act.icu_ctl != null && act.icu_atl != null)
      ? Math.round((act.icu_ctl - act.icu_atl) * 10) / 10 : null,
    decoupling: act.decoupling != null ? Math.round(act.decoupling * 10) / 10 : null,
    dtl: act.icu_training_load,
    // Zeit in Leistungszonen (Sekunden je Zone) und eFTP zum Fahrtzeitpunkt.
    // Feldnamen defensiv: intervals.icu liefert icu_zone_times als Array von
    // Sekunden ODER als Array von {id, secs} — Normalisierung im Frontend
    // (core/zones.js). Fehlende Felder bleiben null (ältere Aktivitäten).
    zoneTimes: act.icu_zone_times || null,
    eftp: act.icu_eftp || null,
    weather,
    wetter: weather ? `${weather.temp}°C` : (act.average_temp ? `~${Math.round(act.average_temp)}°C` : null),
    source: "intervals.icu",
  };
}

/** Wellness-Felder eines Tages @param {Object} w */
function wellnessFields(w) {
  return {
    ruhepuls: w.restingHR || null,
    hrv: w.hrvSDNN || null,
    avgSleepingHR: w.avgSleepingHR || null,
    sleepHours: w.sleepSecs ? Math.round(w.sleepSecs / 360) / 10 : null,
  };
}

/** Startstunde aus start_date_local, oder null (→ Wetter-Fallback 09:00) */
function startHourOf(act) {
  return act.start_date_local
    ? parseInt(act.start_date_local.split("T")[1]?.split(":")[0])
    : null;
}

// === intervals.icu Activity → Ride-Objekt (Athlet 1, Plan 2) ===
export function mapActivity(act, wellness, subjective, weatherMap) {
  const date = act.start_date_local.split("T")[0];
  const { week, phase } = getPlan2WeekPhase(date);
  const w = wellness[date] || {};
  const s = subjective[date] || {};
  const planned = PLANNED_SESSIONS[date] || {};

  const np  = act.icu_weighted_avg_watts;
  const min = Math.round((act.moving_time || 0) / 60);

  // Priorität: 1) subjective.json  2) Trainingsplan  3) IF-Berechnung
  const typ = s.typ || planned.typ || inferTypFromIF(np, min);
  const name = s.name || planned.name || act.name || "Radfahren";

  // Wetter: exakte Startzeit aus intervals.icu
  const weather = getWeatherForRide(weatherMap, date, startHourOf(act), min);

  return {
    name,
    week,
    phase,
    typ,
    plan: "Plan 2",
    ...baseFields(act, weather),
    ...wellnessFields(w),
    feel: s.feel || null,
    notizen: s.notizen || null,
  };
}

// === intervals.icu Activity → Ride-Objekt (Athlet 2, ohne Plan-Bezug) ===
export function mapActivity2(act, wellness, weatherMap, estimatedFtp) {
  const date = act.start_date_local.split("T")[0];
  const w = wellness[date] || {};

  const np  = act.icu_weighted_avg_watts;
  const min = Math.round((act.moving_time || 0) / 60);

  const weather = getWeatherForRide(weatherMap, date, startHourOf(act), min);

  return {
    name: act.name || "Radfahren",
    week: null,
    phase: null,
    typ: inferTypFromIF(np, min, estimatedFtp),
    plan: "Vergleich",
    ...baseFields(act, weather),
    ...wellnessFields(w),
    feel: null,
    notizen: null,
  };
}
