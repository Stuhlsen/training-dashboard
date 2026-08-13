/* Tests: Wetter-Wochenaggregation (core/weather.js, Etappe 12f) */

import { test } from "vitest";
import assert from "node:assert/strict";
import { isoWeekKey } from "./aggregate.js";
import { weeklyWeatherAverages } from "./weather.js";

const weekKeyFn = (r) => (r.dateISO ? isoWeekKey(r.dateISO) : "");
const weekSortFn = (a, b) => a.localeCompare(b);

test("weeklyWeatherAverages mittelt temp/wind, summiert precip je Woche", () => {
  const rides = [
    { dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 10, precip: 0 } },
    { dateISO: "2026-06-02", weather: { temp: 24, windSpeed: 14, precip: 1.2 } },
    { dateISO: "2026-06-08", weather: { temp: 18, windSpeed: 8, precip: 0 } }, // nächste KW
  ];
  const weeks = weeklyWeatherAverages(rides, weekKeyFn, weekSortFn);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].week, "2026-KW23");
  assert.equal(weeks[0].temp, 22);
  assert.equal(weeks[0].wind, 12);
  assert.equal(weeks[0].precip, 1.2);
  assert.equal(weeks[0].rides, 2);
  assert.equal(weeks[1].week, "2026-KW24");
});

test("weeklyWeatherAverages ignoriert Fahrten ohne weather/dateISO", () => {
  const rides = [
    { dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 10, precip: 0 } },
    { dateISO: "2026-06-02" }, // kein weather
    { weather: { temp: 99, windSpeed: 99, precip: 99 } }, // kein dateISO
  ];
  const weeks = weeklyWeatherAverages(rides, weekKeyFn, weekSortFn);
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].rides, 1);
});

test("weeklyWeatherAverages mittelt Felder unabhängig (fehlender windSpeed verzerrt temp nicht)", () => {
  const rides = [
    { dateISO: "2026-06-01", weather: { temp: 20, precip: 0 } }, // kein windSpeed
    { dateISO: "2026-06-02", weather: { temp: 30, windSpeed: 16, precip: 0 } },
  ];
  const weeks = weeklyWeatherAverages(rides, weekKeyFn, weekSortFn);
  assert.equal(weeks[0].temp, 25);
  assert.equal(weeks[0].wind, 16);
});

test("weeklyWeatherAverages: Ampel-Einstufung ok/warn/danger", () => {
  const okWeek = weeklyWeatherAverages(
    [{ dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 10, precip: 0 } }],
    weekKeyFn,
    weekSortFn
  );
  assert.equal(okWeek[0].condition, "ok");

  const warnWeek = weeklyWeatherAverages(
    [{ dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 35, precip: 0 } }], // nur windig
    weekKeyFn,
    weekSortFn
  );
  assert.equal(warnWeek[0].condition, "warn");

  const dangerWeekHot = weeklyWeatherAverages(
    [{ dateISO: "2026-06-01", weather: { temp: 33, windSpeed: 5, precip: 0 } }], // hot allein → severe
    weekKeyFn,
    weekSortFn
  );
  assert.equal(dangerWeekHot[0].condition, "danger");

  const dangerWeekCombo = weeklyWeatherAverages(
    [{ dateISO: "2026-06-01", weather: { temp: 20, windSpeed: 35, precip: 1 } }], // windig + regnerisch
    weekKeyFn,
    weekSortFn
  );
  assert.equal(dangerWeekCombo[0].condition, "danger");
});

test("weeklyWeatherAverages: Wochen ganz ohne Wetterwerte entfallen nicht separat (weather-Objekt fehlt komplett)", () => {
  const rides = [{ dateISO: "2026-06-01" }];
  const weeks = weeklyWeatherAverages(rides, weekKeyFn, weekSortFn);
  assert.equal(weeks.length, 0);
});
