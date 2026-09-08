/* Tests: core/critical-speed.js — 2-Punkt-Critical-Speed + Schwellen-
   geschwindigkeits-Schätzung (Fahrplan 10 E7). UNKALIBRIERT — synthetische
   Efforts + die dünne Athlet-3-Datenlage (Degradation). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { criticalSpeedFromTwoEfforts, estimateThresholdSpeed } from "./critical-speed.js";

test("criticalSpeedFromTwoEfforts: CS = Δd/Δt, D' = d1 − CS·t1, reihenfolgeunabhängig", () => {
  const a = { distance: 5, duration: 1500 }; // 5 km in 25 min
  const b = { distance: 10, duration: 3300 }; // 10 km in 55 min
  const r1 = criticalSpeedFromTwoEfforts(a, b);
  const r2 = criticalSpeedFromTwoEfforts(b, a);
  assert.ok(Math.abs(r1.speed - 5 / 1800) < 1e-9); // km pro Sekunde
  assert.ok(Math.abs(r1.dPrime - (5 - (5 / 1800) * 1500)) < 1e-9);
  assert.deepEqual(r1, r2);
});

test("criticalSpeedFromTwoEfforts: nicht monotone Efforts → null", () => {
  assert.equal(criticalSpeedFromTwoEfforts({ distance: 5, duration: 1500 }, { distance: 5, duration: 1800 }), null);
  assert.equal(criticalSpeedFromTwoEfforts({ distance: 5, duration: 1500 }, { distance: 8, duration: 1500 }), null);
  assert.equal(criticalSpeedFromTwoEfforts(null, { distance: 8, duration: 1800 }), null);
});

test("estimateThresholdSpeed: km/h aus den zwei am weitesten getrennten Buckets", () => {
  const rides = [
    { sport: "run", km: 5, min: 20 }, // 4:00/km → Bucket 5
    { sport: "run", km: 15, min: 75 }, // 5:00/km → Bucket 15
    { sport: "ride", km: 40, min: 60 }, // andere Sportart → raus
    { sport: "run", km: 2, min: 10 }, // < minDurationMin → raus
  ];
  const res = estimateThresholdSpeed(rides);
  // Δd = 10 km, Δt = 3300 s → 10/3300 km/s × 3600 = 10,909 km/h
  assert.ok(Math.abs(res.speed - 10.91) < 0.01);
  assert.ok(Math.abs(res.dPrimeKm - 1.364) < 0.001);
  assert.equal(res.calibrated, false);
  assert.equal(res.source, "2-point-cs");
  assert.ok(typeof res.note === "string" && res.note.includes("UNKALIBRIERT"));
  assert.deepEqual(res.efforts, [
    { km: 5, min: 20 },
    { km: 15, min: 75 },
  ]);
});

test("estimateThresholdSpeed: < 2 belegte Buckets → speed null + Klartext-Grund", () => {
  const res = estimateThresholdSpeed([{ sport: "run", km: 8, min: 45 }]);
  assert.equal(res.speed, null);
  assert.equal(res.calibrated, false);
  assert.ok(res.reason.includes("(1/2)"));
});

test("estimateThresholdSpeed: fast gleich lange Efforts → schlecht konditioniert → speed null", () => {
  const rides = [
    { sport: "run", km: 9.9, min: 49 },
    { sport: "run", km: 10.1, min: 50 }, // nur ~0,2 km länger → Δd/Δt instabil
  ];
  const res = estimateThresholdSpeed(rides);
  assert.equal(res.speed, null);
  assert.ok(res.reason.includes("zu nah beieinander"));
});

test("estimateThresholdSpeed: längerer Lauf war schneller → negatives D' → speed null", () => {
  const rides = [
    { sport: "run", km: 8, min: 56 }, // 7:00/km
    { sport: "run", km: 14, min: 70 }, // 5:00/km — schneller trotz mehr Distanz
  ];
  const res = estimateThresholdSpeed(rides);
  assert.equal(res.speed, null);
  assert.equal(res.calibrated, false);
  assert.ok(res.reason.includes("negatives D'"));
});

test("estimateThresholdSpeed: keine Läufe → speed null", () => {
  assert.equal(estimateThresholdSpeed([{ sport: "ride", km: 40, min: 60 }]).speed, null);
  assert.equal(estimateThresholdSpeed([]).speed, null);
});
