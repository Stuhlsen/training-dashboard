/* Tests: Tages-Forecast aus Stundenwerten (scripts/lib/weather.js::
   aggregateDaytimeForecast). Live-Fund: Regen-Symbol (Wettercode = Maximum)
   neben „Regen 1 %" (Wahrscheinlichkeit = Mittel). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateDaytimeForecast } from "../scripts/lib/weather.js";

/** Stundenreihe eines Tages, 06–20 Uhr, mit einer Regenstunde um 15 Uhr. */
function hourly() {
  const hours = Array.from({ length: 15 }, (_, i) => i + 6);
  const at = (rain, dry) => hours.map((hr) => (hr === 15 ? rain : dry));
  return {
    time: hours.map((hr) => `2026-10-21T${String(hr).padStart(2, "0")}:00`),
    temperature_2m: hours.map(() => 12),
    apparent_temperature: hours.map(() => 10),
    relative_humidity_2m: hours.map(() => 80),
    wind_speed_10m: hours.map(() => 10),
    wind_direction_10m: hours.map(() => 180),
    precipitation_probability: at(15, 0),
    weather_code: at(61, 2),
    uv_index: hours.map((hr) => (hr === 13 ? 3 : 1)),
  };
}

test("Regenwahrscheinlichkeit ist das Tagesmaximum, passend zum Wettercode", () => {
  const day = aggregateDaytimeForecast(hourly())["2026-10-21"];
  assert.equal(day.weatherCode, 61);
  assert.equal(day.precipProb, 15);
});

test("nur 08–18 Uhr zählt: Regen um 6 Uhr bleibt draußen", () => {
  const h = hourly();
  h.precipitation_probability[0] = 90; // 06:00
  h.weather_code[0] = 95;
  const day = aggregateDaytimeForecast(h)["2026-10-21"];
  assert.equal(day.precipProb, 15);
  assert.equal(day.weatherCode, 61);
});

test("Mittelwerte bleiben Mittelwerte, ohne Wahrscheinlichkeiten → 0 wie bisher", () => {
  const h = hourly();
  h.precipitation_probability = h.precipitation_probability.map(() => null);
  const day = aggregateDaytimeForecast(h)["2026-10-21"];
  assert.equal(day.temp, 12);
  assert.equal(day.windSpeed, 10);
  assert.equal(day.uvMax, 3);
  assert.equal(day.precipProb, 0);
});
