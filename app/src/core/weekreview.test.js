/* Tests: core/weekreview.js — Wochenrückblick. Port von
   tests/features.test.js (Vanilla), 1:1 dieselben Fälle — die Funktion
   selbst ist byteidentisch zwischen assets/js/core/weekreview.js und
   diesem Modul (s. docs/v0-funktionsabgleich-bericht.md §2). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { lastCompletedWeekRange, buildWeekReview } from "./weekreview.js";

test("lastCompletedWeekRange: Mo–So der Vorwoche", () => {
  // Sa 04.07.2026 → letzte abgeschlossene Woche: Mo 22.06 – So 28.06
  assert.deepEqual(lastCompletedWeekRange("2026-07-04"), { from: "2026-06-22", to: "2026-06-28" });
  // Montag: die gerade beendete Woche endet gestern (So)
  assert.deepEqual(lastCompletedWeekRange("2026-06-29"), { from: "2026-06-22", to: "2026-06-28" });
});

test("buildWeekReview: Summen, stärkste Leistung, Plan-Erfüllung mit Adjustments", () => {
  const rides = [
    {
      dateISO: "2026-06-23",
      km: 68,
      min: 150,
      tss: 140,
      np: 175,
      name: "Gruppenfahrt",
      weather: { temp: 24, windSpeed: 15 },
    },
    {
      dateISO: "2026-06-27",
      km: 85,
      min: 220,
      tss: 180,
      np: 160,
      name: "Z2 Lang",
      weather: { temp: 31, windSpeed: 10 },
    },
  ];
  const sessions = [
    { date: "2026-06-23", name: "Gruppenfahrt" },
    { date: "2026-06-25", name: "Intervalle" }, // wird verschoben auf Sa
    { date: "2026-06-26", name: "Extra" }, // fällt aus
  ];
  const adjustments = {
    "2026-06-25": { movedTo: "2026-06-27" },
    "2026-06-26": { cancelled: true },
  };
  const rv = buildWeekReview(rides, sessions, adjustments, "2026-07-04");
  assert.equal(rv.km, 153);
  assert.equal(rv.best.name, "Gruppenfahrt"); // höchste NP
  assert.equal(rv.plan.planned, 2); // Ausfall zählt nicht
  assert.equal(rv.plan.done, 2); // verschobene Session am 27. erfüllt
  assert.match(rv.weatherNote, /31/);
  assert.equal(buildWeekReview([], sessions, {}, "2026-07-04"), null);
});
