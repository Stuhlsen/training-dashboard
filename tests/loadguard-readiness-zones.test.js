/* Tests: Belastungswächter (core/loadguard.js), Tagesform (core/readiness.js),
   Intensitätsverteilung (core/zones.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { fosterWeek, riskLevel, buildLoadGuard, rideLoad } from "../assets/js/core/loadguard.js";
import { baselineStats, metricStatus, assessReadiness } from "../assets/js/core/readiness.js";
import { normalizeZoneTimes, bandZoneTimes, weeklyZoneShares } from "../assets/js/core/zones.js";

/* ── Foster / Ramp ──────────────────────────────────────────── */

test("fosterWeek: bekanntes Beispiel — Monotonie = mean/sd, Strain = total×Monotonie", () => {
  // 3 gleiche Trainingstage + 4 Ruhetage
  const f = fosterWeek([100, 100, 100, 0, 0, 0, 0]);
  assert.equal(f.total, 300);
  const mean = 300 / 7;
  const sd = Math.sqrt(((100 - mean) ** 2 * 3 + mean ** 2 * 4) / 7);
  assert.ok(Math.abs(f.monotony - mean / sd) < 1e-9);
  assert.ok(Math.abs(f.strain - 300 * f.monotony) < 1e-9);
});

test("fosterWeek: identische Tage (sd=0) → Monotonie null statt Division durch 0", () => {
  const f = fosterWeek([0, 0, 0, 0, 0, 0, 0]);
  assert.equal(f.monotony, null);
  assert.equal(f.strain, null);
});

test("riskLevel: Ramp-Korridor und Monotonie-Schwellen", () => {
  assert.equal(riskLevel(4, 1.2), "ok");
  assert.equal(riskLevel(7, 1.2), "caution"); // Ramp > 6
  assert.equal(riskLevel(9, 1.2), "high"); // Ramp > 8
  assert.equal(riskLevel(4, 2.1), "caution"); // Monotonie ≥ 2
  assert.equal(riskLevel(4, 2.6), "high"); // Monotonie ≥ 2.5
  assert.equal(riskLevel(null, null), "ok");
});

test("rideLoad: TSS bevorzugt, TRIMP als Fallback", () => {
  assert.equal(rideLoad({ tss: 80, trimp: 120 }), 80);
  assert.equal(rideLoad({ trimp: 120 }), 120);
  assert.equal(rideLoad({}), 0);
});

test("buildLoadGuard: Wochen gruppiert, Ramp gegen Vorwoche", () => {
  const rides = [
    { week: "W1", dateISO: "2026-06-29", tss: 100, ctl: 50 },
    { week: "W1", dateISO: "2026-07-01", tss: 100, ctl: 52 },
    { week: "W2", dateISO: "2026-07-06", tss: 150, ctl: 57 },
  ];
  const guard = buildLoadGuard(
    rides,
    (r) => r.week,
    (a, b) => a.localeCompare(b)
  );
  assert.equal(guard.length, 2);
  assert.equal(guard[0].week, "W1");
  assert.equal(guard[0].total, 200);
  assert.equal(guard[0].ramp, null); // keine Vorwoche
  assert.equal(guard[1].ramp, 5); // 57 − 52
  assert.ok(guard[1].monotony > 0);
});

/* ── Readiness ──────────────────────────────────────────────── */

test("baselineStats: braucht mindestens 5 Werte", () => {
  assert.equal(baselineStats([60, 62]), null);
  const b = baselineStats([60, 62, 58, 61, 59]);
  assert.equal(b.mean, 60);
  assert.ok(b.sd > 0);
});

test("metricStatus: Richtung wird berücksichtigt", () => {
  assert.equal(metricStatus(-1.6, true), "alert"); // HRV stark unter Baseline
  assert.equal(metricStatus(1.6, true), "ok"); // HRV über Baseline = gut
  assert.equal(metricStatus(1.6, false), "alert"); // Ruhepuls stark erhöht
  assert.equal(metricStatus(null, true), "nodata");
});

function makeWellness(n, hrv, rhr, sleep) {
  // n Tage rückwärts ab 2026-07-03
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date("2026-07-03T00:00:00");
    d.setDate(d.getDate() - i);
    out.push({ date: d.toISOString().split("T")[0], hrv, restingHR: rhr, sleepHours: sleep });
  }
  return out;
}

test("assessReadiness: stabile Werte → grün; HRV-Einbruch + RHF-Anstieg → rot", () => {
  // Baseline: 42 Tage stabil (leichte Variation für sd>0)
  const base = makeWellness(60, 62, 52, 7.2).map((w, i) => ({
    ...w,
    hrv: 62 + (i % 3) - 1,
    restingHR: 52 + (i % 2),
  }));
  const green = assessReadiness(base, "2026-07-04");
  assert.equal(green.level, "green");

  // Letzte 7 Tage: HRV −15, Ruhepuls +6 → alert
  const stressed = base.map((w) => (w.date >= "2026-06-27" ? { ...w, hrv: 45, restingHR: 60 } : w));
  const red = assessReadiness(stressed, "2026-07-04");
  assert.equal(red.level, "red");
  assert.equal(red.metrics.find((m) => m.key === "hrv").status, "alert");
});

test("assessReadiness: zu wenig Historie → null", () => {
  assert.equal(assessReadiness(makeWellness(8, 60, 50, 7), "2026-07-04"), null);
});

/* ── Zones ──────────────────────────────────────────────────── */

test("normalizeZoneTimes: beide intervals.icu-Formate", () => {
  assert.deepEqual(normalizeZoneTimes([100, 200, 300]), [100, 200, 300]);
  assert.deepEqual(
    normalizeZoneTimes([
      { id: "Z1", secs: 100 },
      { id: "Z2", secs: 200 },
    ]),
    [100, 200]
  );
  assert.equal(normalizeZoneTimes(null), null);
  assert.equal(normalizeZoneTimes([]), null);
});

test("bandZoneTimes: Z1+Z2 → low, Z3+Z4 → mid, Rest → high", () => {
  const b = bandZoneTimes([1000, 2000, 500, 300, 100, 50, 10]);
  assert.equal(b.low, 3000);
  assert.equal(b.mid, 800);
  assert.equal(b.high, 160);
  assert.equal(b.total, 3960);
});

test("weeklyZoneShares: Anteile + Zielprüfung (80% low)", () => {
  const rides = [
    { week: "W1", dateISO: "2026-06-30", zoneTimes: [3600, 3600, 900, 0, 0] }, // 88.9% low
    { week: "W2", dateISO: "2026-07-07", zoneTimes: [1800, 1800, 1800, 1800, 0] }, // 50% low
    { week: "W3", dateISO: "2026-07-14" }, // keine Zonendaten → entfällt
  ];
  const weeks = weeklyZoneShares(
    rides,
    (r) => r.week,
    (a, b) => a.localeCompare(b)
  );
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].onTarget, true);
  assert.equal(weeks[1].onTarget, false);
  assert.ok(Math.abs(weeks[1].lowShare - 0.5) < 1e-9);
});
