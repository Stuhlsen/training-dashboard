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

/**
 * Baut den Query-String für den power-curves-Endpunkt. `oldest`/`newest`
 * grenzen NUR die Aktivitätensuche ein — die Kurve selbst folgt ohne
 * `curves`-Parameter einem intervals.icu-Preset (z. B. "1y" rückwärts ab
 * `newest`) und ignoriert dabei `oldest`. Für eine auf den Zeitraum
 * beschränkte Kurve (z. B. je Trainingsblock) muss `curves=r.<von>.<bis>`
 * explizit angegeben werden (intervals.icu-Range-Spezifizierer).
 * @param {string} oldest @param {string} newest @param {string|null} [curves]
 * @returns {string} */
export function powerCurveQuery(oldest, newest, curves = null) {
  const curvesParam = curves ? `&curves=${curves}` : "";
  return `oldest=${oldest}&newest=${newest}&type=Ride${curvesParam}`;
}

/**
 * @param {string} oldest @param {string} newest
 * @param {string} [key] @param {string} [athlete]
 * @param {string|null} [curves] intervals.icu-Range-Spezifizierer
 *   (z. B. `r.2026-06-29.2026-07-13`) für eine auf den Zeitraum beschränkte
 *   Kurve — ohne diesen Parameter liefert die API ein Preset (s. powerCurveQuery)
 */
export async function getIntervalsPowerCurves(
  oldest,
  newest,
  key = ENV.INTERVALS_KEY,
  athlete = ENV.INTERVALS_ATHLETE,
  curves = null
) {
  log.info(`🔄 intervals.icu Power Curves (${oldest} bis ${newest})...`);
  const data = await intervalsGet(
    `/athlete/${athlete}/power-curves?${powerCurveQuery(oldest, newest, curves)}`,
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
