/* Tests: Statistik-Helfer (core/stats.js) und Aggregation (core/aggregate.js) */

import { test } from "vitest";
import assert from "node:assert/strict";
import { avg, sum, maxVal, minVal, linearTrend } from "./stats.js";
import {
  isoWeekKey,
  weeklyByCalendar,
  monthlyFromRides,
  weekSortIndex,
} from "./aggregate.js";

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
});

test("weeklyByCalendar übernimmt die Block-Phase der Woche (einheitliche Kalenderwoche, dashboard-2.0)", () => {
  const rides = [
    { dateISO: "2026-07-27", week: "2026-KW31", phase: "Schwelle", km: 40, min: 90, trimp: 150 },
    { dateISO: "2026-07-28", week: "2026-KW31", phase: "Schwelle", km: 20, min: 50, trimp: 90 },
    { dateISO: "2026-08-03", km: 25, min: 60, trimp: 110 }, // Athlet-2-ähnlich: kein week/phase
  ];
  const weeks = weeklyByCalendar(rides);
  assert.equal(weeks[0].week, "2026-KW31");
  assert.equal(weeks[0].phase, "Schwelle");
  assert.equal(weeks[1].phase, null);
});

test("weekSortIndex: Kalenderwochen numerisch über Jahresgrenzen, Fallback für andere Labels", () => {
  assert.equal(weekSortIndex("2026-KW31", () => 999), 202631);
  assert.equal(weekSortIndex("2027-KW01", () => 999), 202701);
  assert.ok(weekSortIndex("2027-KW01", () => 999) > weekSortIndex("2026-KW52", () => 999));
  assert.equal(
    weekSortIndex("W3", (w) => ({ W1: 0, W2: 1, W3: 2 })[w] ?? 999),
    2
  );
});

test("monthlyFromRides aggregiert Wetter und badCount", () => {
  const rides = [
    {
      dateISO: "2026-06-01",
      km: 30,
      min: 60,
      trimp: 100,
      hf: 140,
      kad: 85,
      weather: { temp: 20, windSpeed: 10, precip: 0 },
    },
    {
      dateISO: "2026-06-15",
      km: 40,
      min: 80,
      trimp: 150,
      hf: 150,
      kad: 90,
      weather: { temp: 34, windSpeed: 12, precip: 0 },
    }, // heiß → bad
  ];
  const months = monthlyFromRides(rides);
  assert.equal(months.length, 1);
  assert.equal(months[0].km, 70);
  assert.equal(months[0].temp, 27);
  assert.equal(months[0].badCount, 1);
  assert.equal(months[0].avgHF, 145);
});

test("monthlyFromRides: week ist der rohe YYYY-MM-Bucket-Schlüssel, keine lokalisierte Anzeige", () => {
  // Konsistent mit core/chart-buckets.js (Monats-Bucket-Vereinheitlichung,
  // s. docs/offene-punkte.md) — die Kürzung auf "MM/JJ" passiert erst beim
  // Rendern über weekDisplayLabels(), nicht in monthlyFromRides() selbst.
  const rides = [{ dateISO: "2026-07-15", km: 10, min: 30, trimp: 50 }];
  const months = monthlyFromRides(rides);
  assert.equal(months[0].week, "2026-07");
});

test("linearTrend: Steigung einer perfekten Geraden, null bei Degeneration", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 1, y: 2 },
    { x: 2, y: 4 },
  ];
  const t = linearTrend(pts);
  assert.ok(Math.abs(t.slope - 2) < 1e-9);
  assert.ok(Math.abs(t.intercept) < 1e-9);
  assert.equal(
    linearTrend([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
    ]),
    null
  ); // < 3 Punkte
  assert.equal(
    linearTrend([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
    ]),
    null
  ); // alle x gleich
});
