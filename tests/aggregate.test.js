/* Tests: Statistik-Helfer (core/stats.js) und Aggregation (core/aggregate.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { avg, sum, maxVal, minVal, linearTrend } from "../assets/js/core/stats.js";
import { isoWeekKey, weeklyByCalendar, weeklyFromPlanWeeks, monthlyFromRides } from "../assets/js/core/aggregate.js";

test("sum ignoriert null, avg ignoriert null/NaN", () => {
  const rides = [{ km: 10 }, { km: null }, { km: 20 }];
  assert.equal(sum(rides, "km"), 30);
  assert.equal(avg(rides, "km"), 15);
  assert.equal(avg([], "km"), null);
  assert.equal(maxVal(rides, "km"), 20);
  assert.equal(minVal(rides, "km"), 10);
});

test("isoWeekKey: normale Woche und Jahreswechsel", () => {
  // 2026-07-01 liegt in KW27 2026
  assert.equal(isoWeekKey("2026-07-01"), "2026-KW27");
  // ISO-Sonderfall: 2027-01-01 (Freitag) gehört noch zu KW53 des Jahres 2026
  assert.equal(isoWeekKey("2027-01-01"), "2026-KW53");
  // 2024-12-30 (Montag) gehört bereits zu KW01 2025
  assert.equal(isoWeekKey("2024-12-30"), "2025-KW01");
});

test("weeklyByCalendar gruppiert nach ISO-Woche und sortiert", () => {
  const rides = [
    { dateISO: "2026-07-01", km: 30, min: 60, trimp: 100 },
    { dateISO: "2026-07-02", km: 20, min: 45, trimp: 80 },
    { dateISO: "2026-07-08", km: 50, min: 120, trimp: 200 }, // nächste KW
  ];
  const weeks = weeklyByCalendar(rides);
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].week, "2026-KW27");
  assert.equal(weeks[0].km, 50);
  assert.equal(weeks[0].rides, 2);
  assert.equal(weeks[1].week, "2026-KW28");
  assert.equal(weeks[1].plan, "Vergleich");
});

test("weeklyFromPlanWeeks nutzt die übergebene Wochen-Reihenfolge", () => {
  const order = ["W1", "W2", "P2-W1"];
  const weekIndexFn = (w) => { const i = order.indexOf(w); return i === -1 ? 999 : i; };
  const rides = [
    { dateISO: "2026-07-10", week: "P2-W1", phase: "Sweet Spot", plan: "Plan 2", km: 40, min: 90, trimp: 150 },
    { dateISO: "2026-04-01", week: "W1", phase: "Phase 1", plan: "Plan 1", km: 20, min: 50, trimp: 90 },
    { dateISO: "2026-04-03", week: "W1", phase: "Phase 1", plan: "Plan 1", km: 25, min: 60, trimp: 110 },
  ];
  const weeks = weeklyFromPlanWeeks(rides, weekIndexFn);
  assert.deepEqual(weeks.map((w) => w.week), ["W1", "P2-W1"]);
  assert.equal(weeks[0].km, 45);
  assert.equal(weeks[0].phase, "Phase 1");
  assert.equal(weeks[1].plan, "Plan 2");
});

test("monthlyFromRides aggregiert Wetter und badCount", () => {
  const rides = [
    { dateISO: "2026-06-01", km: 30, min: 60, trimp: 100, hf: 140, kad: 85, weather: { temp: 20, windSpeed: 10, precip: 0 } },
    { dateISO: "2026-06-15", km: 40, min: 80, trimp: 150, hf: 150, kad: 90, weather: { temp: 34, windSpeed: 12, precip: 0 } }, // heiß → bad
  ];
  const months = monthlyFromRides(rides);
  assert.equal(months.length, 1);
  assert.equal(months[0].km, 70);
  assert.equal(months[0].temp, 27);
  assert.equal(months[0].badCount, 1);
  assert.equal(months[0].avgHF, 145);
});

test("linearTrend: Steigung einer perfekten Geraden, null bei Degeneration", () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }];
  const t = linearTrend(pts);
  assert.ok(Math.abs(t.slope - 2) < 1e-9);
  assert.ok(Math.abs(t.intercept) < 1e-9);
  assert.equal(linearTrend([{ x: 1, y: 1 }, { x: 2, y: 2 }]), null); // < 3 Punkte
  assert.equal(linearTrend([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]), null); // alle x gleich
});
