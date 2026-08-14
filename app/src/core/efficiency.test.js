/* Tests: core/efficiency.js — EF-Trend + Decoupling-Trend. Port von
   tests/features.test.js + tests/analysis-extensions.test.js (Vanilla),
   identische Fälle. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { isComparableRide, rollingMean, efficiencyTrend, decouplingTrend, DECOUPLING_MIN_POINTS } from "./efficiency.js";

/* ── EF-Trend ───────────────────────────────────────────────── */

test("isComparableRide: nur Z2 ≥60min bei moderater Temperatur", () => {
  const base = { efficiency: 1.2, typ: "Z2 Lang", min: 120, dateISO: "2026-06-01" };
  assert.equal(isComparableRide(base), true);
  assert.equal(isComparableRide({ ...base, typ: "Sweet Spot" }), false);
  assert.equal(isComparableRide({ ...base, min: 45 }), false);
  assert.equal(isComparableRide({ ...base, weather: { temp: 34 } }), false);
  assert.equal(isComparableRide({ ...base, weather: { temp: 22 } }), true);
  assert.equal(isComparableRide({ ...base, efficiency: null }), false);
});

test("rollingMean: trailing, erst ab 3 Punkten", () => {
  const rm = rollingMean([1, 2, 3, 4], 3);
  assert.equal(rm[0], null);
  assert.equal(rm[1], null);
  assert.equal(rm[2], 2);
  assert.equal(rm[3], 3);
});

test("efficiencyTrend: Steigung pro 30 Tage aus vergleichbaren Fahrten", () => {
  const rides = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date("2026-04-01T00:00:00");
    d.setDate(d.getDate() + i * 10);
    rides.push({
      dateISO: d.toISOString().split("T")[0],
      typ: "Z2 Lang",
      min: 90,
      efficiency: 1.1 + i * 0.02,
    });
  }
  rides.push({ dateISO: "2026-05-01", typ: "VO2max", min: 60, efficiency: 1.6 }); // wird gefiltert
  const t = efficiencyTrend(rides);
  assert.equal(t.comparable.length, 6);
  assert.ok(Math.abs(t.slopePer30d - 0.06) < 0.001); // +0.02 je 10 Tage
});

/* ── Decoupling-Trend ───────────────────────────────────────── */

test("decouplingTrend: nur Steady-State-Fahrten, Median + stabiler Anteil", () => {
  const mk = (date, value, typ = "Z2 Lang", min = 90) => ({
    dateISO: date,
    decoupling: value,
    typ,
    min,
  });
  const rides = [
    mk("2026-06-01", 6.0),
    mk("2026-06-08", 5.0),
    mk("2026-06-15", 4.0),
    mk("2026-06-22", 3.0),
    mk("2026-06-29", 2.0),
    mk("2026-06-30", 9.9, "VO2max"), // falscher Typ → raus
    mk("2026-07-01", 9.9, "Z2 Lang", 45), // zu kurz → raus
  ];
  const t = decouplingTrend(rides);
  assert.ok(t);
  assert.equal(t.n, 5);
  assert.equal(t.median, 4);
  assert.equal(t.stableShare, 60); // 3 von 5 unter 5%
  assert.ok(t.slopePer30d < 0); // fallender Trend
  assert.equal(decouplingTrend(rides.slice(0, DECOUPLING_MIN_POINTS - 1)), null);
});
