/* ============================================================
   SCRIPTS/LIB/INTERVALS.JS — intervals.icu-API-Zugriff
   Activities, Wellness und Power Curves. Nutzt http.js
   (Timeout + Retry) statt roher fetch-Aufrufe.
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";
import { log } from "./log.js";

/** Ride-artige Aktivitätstypen, die als Fahrten zählen */
export const RIDE_TYPES = [
  "Ride",
  "VirtualRide",
  "MountainBikeRide",
  "GravelRide",
  "EBikeRide",
  "Handcycle",
  "Workout",
];

/** Authentifizierter GET gegen die intervals.icu-API
 *  @param {string} endpoint Pfad ab /api/v1
 *  @param {string} [key] API-Key (Default: Athlet 1)
 *  @returns {Promise<Object|Array|null>} */
export async function intervalsGet(endpoint, key = ENV.INTERVALS_KEY) {
  const url = `https://intervals.icu/api/v1${endpoint}`;
  const auth = Buffer.from(`API_KEY:${key}`).toString("base64");
  return await fetchJson(
    url,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
    { label: `intervals.icu ${endpoint.split("?")[0]}` }
  );
}

export async function getIntervalsPowerCurves(
  oldest,
  newest,
  key = ENV.INTERVALS_KEY,
  athlete = ENV.INTERVALS_ATHLETE
) {
  log.info(`🔄 intervals.icu Power Curves (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${athlete}/power-curves?oldest=${oldest}&newest=${newest}&type=Ride`,
    key
  );
  if (!data) return null;
  log.info(`   ... Power Curve geladen`);
  return data;
}

export async function getIntervalsActivities(
  oldest,
  newest,
  key = ENV.INTERVALS_KEY,
  athlete = ENV.INTERVALS_ATHLETE,
  allowedTypes = ["Ride"]
) {
  log.info(`🔄 intervals.icu Activities (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${athlete}/activities?oldest=${oldest}&newest=${newest}`,
    key
  );
  if (!data) return [];
  const rides = data.filter((a) => {
    const typeOk = allowedTypes.includes(a.type) || a.type === "" || a.type == null;
    if (!typeOk) return false;
    // "Workout" und leerer/undefined Typ sind generisch — nur als Radfahrt zählen
    // wenn eine plausible Distanz vorhanden ist (viele dieser Einträge sind
    // unvollständige/fehlerhafte Datensätze ohne verwertbare Werte)
    if ((a.type === "Workout" || a.type === "" || a.type == null) && !(a.distance > 0))
      return false;
    return true;
  });
  log.info(`   ... ${rides.length} Rides geladen (Typen: ${allowedTypes.join(", ")})`);
  return rides;
}

export async function getIntervalsWellness(
  oldest,
  newest,
  key = ENV.INTERVALS_KEY,
  athlete = ENV.INTERVALS_ATHLETE
) {
  log.info(`🔄 intervals.icu Wellness (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${athlete}/wellness?oldest=${oldest}&newest=${newest}`,
    key
  );
  if (!data) return {};
  const map = {};
  for (const w of data) map[w.id] = w;
  log.info(`   ... ${Object.keys(map).length} Tage geladen`);
  return map;
}
