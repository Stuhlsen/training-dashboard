/* ============================================================
   CORE/WEATHER.JS — Wetter-Wochenaggregation (kein DOM)
   Reine Funktion für den Explorer-Wetter-Chart (Etappe 12f). Bündelt
   Ride.weather (temp/windSpeed/precip, s. AGENTS.md „Datenschutz" —
   nur Wetterwerte, keine Koordinaten) je Kalenderwoche.
   ============================================================ */

/**
 * Ampel-Einstufung einer Wochen-Wetteraggregation. Grenzwerte identisch zu
 * app/src/features/logbook/logbook-view-model.ts::classifyWeather und der
 * vanilla assets/js/ui/charts/training.js::renderWeatherWeekly()::condColor()
 * — hier bewusst dupliziert statt importiert, damit core/ frei von einer
 * Abhängigkeit auf die features/-Schicht bleibt.
 * @param {number|null} temp @param {number|null} wind @param {number|null} precip
 * @returns {"ok"|"warn"|"danger"}
 */
function weatherCondition(temp, wind, precip) {
  const hot = temp != null && temp > 32;
  const cold = temp != null && temp < 5;
  const windy = (wind || 0) > 30;
  const rainy = (precip || 0) > 0.5;
  const bad = (hot ? 1 : 0) + (cold ? 1 : 0) + (windy ? 1 : 0) + (rainy ? 1 : 0);
  const severe = bad >= 2 || hot || (windy && rainy);
  return severe ? "danger" : bad === 1 ? "warn" : "ok";
}

/**
 * Wöchentliche Wetter-Durchschnitte aus Ride.weather. Temp/Wind je Feld
 * unabhängig gemittelt (wie core/aggregate.js::monthlyFromRides), Niederschlag
 * aufsummiert statt gemittelt (Wochenregenmenge, nicht Tagesdurchschnitt —
 * wie die vanilla-Chart-Aggregation). Wochen ohne jegliche Wetterwerte entfallen.
 * @param {import("../types.js").Ride[]} rides
 * @param {(r: import("../types.js").Ride) => string} weekKeyFn
 * @param {(a: string, b: string) => number} weekSortFn
 * @returns {Array<{week: string, temp: number|null, wind: number|null, precip: number|null, rides: number, condition: "ok"|"warn"|"danger"}>}
 */
export function weeklyWeatherAverages(rides, weekKeyFn, weekSortFn) {
  const byWeek = {};
  for (const r of rides) {
    if (!r.weather) continue;
    const key = weekKeyFn(r);
    if (!key) continue;
    if (!byWeek[key]) byWeek[key] = { temps: [], winds: [], precips: [], rides: 0 };
    const w = byWeek[key];
    if (r.weather.temp != null) w.temps.push(r.weather.temp);
    if (r.weather.windSpeed != null) w.winds.push(r.weather.windSpeed);
    if (r.weather.precip != null) w.precips.push(r.weather.precip);
    w.rides++;
  }

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const round1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

  return Object.keys(byWeek)
    .sort(weekSortFn)
    .map((week) => {
      const w = byWeek[week];
      const temp = round1(mean(w.temps));
      const wind = round1(mean(w.winds));
      const precip = w.precips.length ? round1(w.precips.reduce((a, b) => a + b, 0)) : null;
      if (temp == null && wind == null && precip == null) return null;
      return { week, temp, wind, precip, rides: w.rides, condition: weatherCondition(temp, wind, precip) };
    })
    .filter(Boolean);
}
