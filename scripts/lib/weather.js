/* ============================================================
   SCRIPTS/LIB/WEATHER.JS — Open-Meteo-Wetterintegration
   Archiv (historisch), Forecast (letzte Tage) und 16-Tage-
   Planungs-Forecast. Standorte kommen ausschließlich aus
   Secrets (ENV) — keine Koordinaten im Code.
   ============================================================ */

import { ENV } from "./env.js";
import { fetchJson } from "./http.js";
import { log } from "./log.js";

const HOURLY_FIELDS =
  "temperature_2m,apparent_temperature,relative_humidity_2m," +
  "wind_speed_10m,wind_direction_10m,precipitation,cloud_cover,weather_code";

export async function getHistoricalWeather(
  startDate,
  endDate,
  lat = ENV.WEATHER_LAT,
  lon = ENV.WEATHER_LON
) {
  if (!lat || !lon) {
    log.info(`🌤️  Open-Meteo Wetter: kein Standort-Secret gesetzt, übersprungen`);
    return null;
  }
  log.info(`🌤️  Open-Meteo Wetter (${startDate} bis ${endDate})...`);
  const params = [
    `latitude=${lat}`,
    `longitude=${lon}`,
    `start_date=${startDate}`,
    `end_date=${endDate}`,
    `hourly=${HOURLY_FIELDS}`,
    `timezone=Europe/Berlin`,
  ].join("&");

  const data = await fetchJson(
    `https://archive-api.open-meteo.com/v1/archive?${params}`,
    {},
    { label: "Open-Meteo Archive" }
  );
  if (!data) return null;
  log.info(`   ... ${data.hourly?.time?.length || 0} Stundenwerte geladen`);
  return data;
}

export async function getRecentWeather(lat = ENV.WEATHER_LAT, lon = ENV.WEATHER_LON) {
  if (!lat || !lon) {
    log.info(`🌤️  Open-Meteo Forecast: kein Standort-Secret gesetzt, übersprungen`);
    return null;
  }
  // Forecast-API liefert auch vergangene Stunden der letzten Tage (kein Delay wie Archive)
  log.info(`🌤️  Open-Meteo Forecast (letzte 2 Tage)...`);
  const params = [
    `latitude=${lat}`,
    `longitude=${lon}`,
    `past_days=3`,
    `forecast_days=1`,
    `hourly=${HOURLY_FIELDS}`,
    `timezone=Europe/Berlin`,
  ].join("&");

  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    {},
    { label: "Open-Meteo Forecast" }
  );
  if (!data) return null;
  log.info(`   ... ${data.hourly?.time?.length || 0} Forecast-Stundenwerte geladen`);
  return data;
}

/**
 * 16-Tage-Forecast für den Planungs-Tab — aggregiert auf Tagesdurchschnitte
 * (08–18 Uhr). Läuft serverseitig damit der Standort nie im Frontend-Code
 * oder im Browser-Request sichtbar wird.
 */
export async function getPlanningForecast(lat = ENV.WEATHER_LAT, lon = ENV.WEATHER_LON) {
  if (!lat || !lon) {
    log.info(`🌤️  Planungs-Forecast: kein Standort-Secret gesetzt, übersprungen`);
    return null;
  }
  log.info(`🌤️  Open-Meteo Planungs-Forecast (16 Tage)...`);
  const params = [
    `latitude=${lat}`,
    `longitude=${lon}`,
    `hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code,uv_index`,
    `forecast_days=16`,
    `timezone=Europe/Berlin`,
  ].join("&");

  const data = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    {},
    { label: "Open-Meteo Planungs-Forecast" }
  );
  if (!data?.hourly?.time) return null;

  const map = {};
  const h = data.hourly;
  for (let i = 0; i < h.time.length; i++) {
    const [date, time] = h.time[i].split("T");
    const hour = parseInt(time);
    if (hour < 8 || hour > 18) continue;
    if (!map[date])
      map[date] = {
        temp: [],
        feel: [],
        humidity: [],
        wind: [],
        windDir: [],
        precipProb: [],
        code: [],
        uv: [],
      };
    if (h.temperature_2m[i] != null) map[date].temp.push(h.temperature_2m[i]);
    if (h.apparent_temperature[i] != null) map[date].feel.push(h.apparent_temperature[i]);
    if (h.relative_humidity_2m[i] != null) map[date].humidity.push(h.relative_humidity_2m[i]);
    if (h.wind_speed_10m[i] != null) map[date].wind.push(h.wind_speed_10m[i]);
    if (h.wind_direction_10m[i] != null) map[date].windDir.push(h.wind_direction_10m[i]);
    if (h.precipitation_probability[i] != null)
      map[date].precipProb.push(h.precipitation_probability[i]);
    if (h.weather_code[i] != null) map[date].code.push(h.weather_code[i]);
    if (h.uv_index[i] != null) map[date].uv.push(h.uv_index[i]);
  }
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const result = {};
  for (const [date, v] of Object.entries(map)) {
    result[date] = {
      temp: Math.round(mean(v.temp) * 10) / 10,
      tempFeel: Math.round(mean(v.feel) * 10) / 10,
      humidity: Math.round(mean(v.humidity)),
      windSpeed: Math.round(mean(v.wind) * 10) / 10,
      windDir: Math.round(mean(v.windDir)),
      precipProb: Math.round(mean(v.precipProb)),
      weatherCode: Math.max(...v.code),
      uvMax: v.uv.length ? Math.round(Math.max(...v.uv) * 10) / 10 : null,
    };
  }
  log.info(`   ... Forecast für ${Object.keys(result).length} Tage aggregiert`);
  return result;
}

/**
 * Baut eine Map: "YYYY-MM-DDTHH:00" → { temp, tempFeel, humidity, windSpeed, windDir, precip, cloudCover, weatherCode }
 */
export function buildWeatherMap(data) {
  if (!data?.hourly?.time) return {};
  const map = {};
  const h = data.hourly;
  for (let i = 0; i < h.time.length; i++) {
    map[h.time[i]] = {
      temp: h.temperature_2m[i],
      tempFeel: h.apparent_temperature[i],
      humidity: h.relative_humidity_2m[i],
      windSpeed: h.wind_speed_10m[i],
      windDir: h.wind_direction_10m[i],
      precip: h.precipitation[i],
      cloudCover: h.cloud_cover[i],
      weatherCode: h.weather_code[i],
    };
  }
  return map;
}

/**
 * Mittelt Wetter über das Zeitfenster einer Fahrt.
 * @param {Object} weatherMap - Stündliche Wetterdaten
 * @param {string} date - ISO-Datum (YYYY-MM-DD)
 * @param {number|null} startHour - Startstunde (0-23), null → 09:00 (Fallback für Plan 1)
 * @param {number} durationMin - Fahrtdauer in Minuten
 */
export function getWeatherForRide(weatherMap, date, startHour, durationMin) {
  const sH = startHour != null ? startHour : 9;
  const hours = Math.max(1, Math.ceil((durationMin || 120) / 60));
  const endH = Math.min(23, sH + hours);

  const vals = {
    temp: [],
    tempFeel: [],
    humidity: [],
    windSpeed: [],
    windDir: [],
    precip: [],
    cloudCover: [],
    weatherCode: [],
  };

  for (let h = sH; h <= endH; h++) {
    const key = `${date}T${String(h).padStart(2, "0")}:00`;
    const w = weatherMap[key];
    if (!w) continue;
    for (const k of Object.keys(vals)) {
      if (w[k] != null) vals[k].push(w[k]);
    }
  }

  if (!vals.temp.length) return null;

  const mean = (arr) => Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;

  return {
    temp: mean(vals.temp),
    tempFeel: mean(vals.tempFeel),
    humidity: Math.round(mean(vals.humidity)),
    windSpeed: mean(vals.windSpeed),
    windDir: Math.round(mean(vals.windDir)),
    precip: Math.round(vals.precip.reduce((a, b) => a + b, 0) * 10) / 10,
    cloudCover: Math.round(mean(vals.cloudCover)),
    weatherCode: Math.max(...vals.weatherCode), // schlechteste Bedingung
  };
}
