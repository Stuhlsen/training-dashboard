/* Tests: core/workout-math.js — Berechnung aus workout_structure (D1,
   Schritt 3). Zahlen von Hand nachgerechnet (Formel aus dem Konzept:
   computedTss = Σ (duration_s × IF²) / 36, IF = target_pct_ftp / 100). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { computeWorkoutSummary, expandWorkoutPhases } from "./workout-math.js";

test("computeWorkoutSummary: Sweet-Spot-Beispiel aus dem Konzept — deckt sich mit L2/S3 (3×15min, 45min Zeit in Zone)", () => {
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: 600, target_pct_ftp: 55 },
      {
        kind: "set",
        reps: 3,
        work: { duration_s: 900, target_pct_ftp: 90 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
    ],
  };
  const result = computeWorkoutSummary(structure, 200);
  // 600×0.55²/36 + 3×(900×0.9²/36 + 300×0.5²/36) + 600×0.5²/36 = 76.208… → 76
  assert.equal(result.computedTss, 76);
  assert.equal(result.targetZoneTime_s, 2700, "3×15min Arbeitszeit = 45min (deckt sich mit L2 S3)");
  assert.equal(result.overTime_s, 0, "kein alternating-Schritt");
  assert.deepEqual(result.timeInZone_s, { z1: 2100, z3: 2700 });
});

test("computeWorkoutSummary: alternating (Over-Under) — overTime_s getrennt von targetZoneTime_s (D1.3)", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 1,
        cycles: 2,
        duration_s: 480,
        over: { duration_s: 120, target_pct_ftp: 100 },
        under: { duration_s: 120, target_pct_ftp: 80 },
        recovery: { duration_s: 60, target_pct_ftp: 50 },
      },
    ],
  };
  const result = computeWorkoutSummary(structure);
  // 2×(120×1.0²/36 + 120×0.8²/36) + 60×0.5²/36 = 6.667+4.267+0.417 = 11.35 → 11
  assert.equal(result.computedTss, 11);
  assert.equal(result.overTime_s, 240, "reps × cycles × over.duration_s = 1×2×120");
  assert.equal(result.targetZoneTime_s, 0, "alternating zählt NICHT in targetZoneTime_s (eigene Währung)");
  assert.deepEqual(result.timeInZone_s, { z1: 60, z3: 240, z4: 240 });
});

test("computeWorkoutSummary: accessory mit target:'max' trägt nicht zu TSS/Zonenzeit bei (D1.3)", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "sprint",
        reps: 4,
        work: { duration_s: 15, target: "max" },
        recovery: { duration_s: 285, target_pct_ftp: 50 },
      },
    ],
  };
  const result = computeWorkoutSummary(structure);
  // work (target:"max") trägt 0 bei — nur 4× recovery: 285×0.5²/36 = 1.979… je Rep
  assert.equal(result.computedTss, 8);
  assert.equal(result.targetZoneTime_s, 0);
  assert.equal(result.overTime_s, 0);
  assert.deepEqual(result.timeInZone_s, { z1: 1140 }, "nur die Recovery-Phasen (4×285s), Sprints ohne Zonenbeitrag");
});

test("computeWorkoutSummary: accessory mit target_pct_ftp (statt 'max') trägt normal bei (D1.2-Alternative)", () => {
  const structure = {
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "standing-start",
        reps: 1,
        work: { duration_s: 10, target_pct_ftp: 150 },
        recovery: { duration_s: 60, target_pct_ftp: 50 },
      },
    ],
  };
  const result = computeWorkoutSummary(structure);
  assert.ok(result.computedTss > 0, "Arbeit mit target_pct_ftp fließt in computedTss ein");
  assert.ok(result.timeInZone_s.z5 >= 10, "150% FTP landet im obersten modellierten Band (Z5)");
});

test("expandWorkoutPhases: Warmup + 3×Set + Cooldown → geordnete Phasenfolge (1 + 3×2 + 1 = 8), reps ausmultipliziert", () => {
  const structure = {
    version: 1,
    steps: [
      { kind: "warmup", duration_s: 600, target_pct_ftp: 55 },
      {
        kind: "set",
        reps: 3,
        work: { duration_s: 900, target_pct_ftp: 90 },
        recovery: { duration_s: 300, target_pct_ftp: 50 },
      },
      { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
    ],
  };
  const phases = expandWorkoutPhases(structure);
  assert.equal(phases.length, 8);
  assert.deepEqual(phases[0], { durationS: 600, pct: 55 });
  assert.deepEqual(phases[1], { durationS: 900, pct: 90 });
  assert.deepEqual(phases[2], { durationS: 300, pct: 50 });
  assert.deepEqual(phases[7], { durationS: 600, pct: 50 });
  assert.equal(
    phases.reduce((s, p) => s + p.durationS, 0),
    600 + 3 * (900 + 300) + 600,
  );
});

test("expandWorkoutPhases: accessory mit target:'max' → Phase bleibt mit ihrer Dauer, pct null (Uhr läuft weiter)", () => {
  const phases = expandWorkoutPhases({
    version: 1,
    steps: [
      {
        kind: "accessory",
        subtype: "sprint",
        reps: 2,
        work: { duration_s: 15, target: "max" },
        recovery: { duration_s: 285, target_pct_ftp: 50 },
      },
    ],
  });
  assert.equal(phases.length, 4);
  assert.deepEqual(phases[0], { durationS: 15, pct: null });
  assert.deepEqual(phases[1], { durationS: 285, pct: 50 });
  assert.deepEqual(phases[2], { durationS: 15, pct: null });
});

test("expandWorkoutPhases: alternating → over/under je Cycle, recovery je Rep, Reihenfolge erhalten", () => {
  const phases = expandWorkoutPhases({
    version: 1,
    steps: [
      {
        kind: "alternating",
        reps: 1,
        cycles: 2,
        over: { duration_s: 120, target_pct_ftp: 105 },
        under: { duration_s: 120, target_pct_ftp: 85 },
        recovery: { duration_s: 60, target_pct_ftp: 50 },
      },
    ],
  });
  assert.deepEqual(phases, [
    { durationS: 120, pct: 105 },
    { durationS: 120, pct: 85 },
    { durationS: 120, pct: 105 },
    { durationS: 120, pct: 85 },
    { durationS: 60, pct: 50 },
  ]);
});

test("expandWorkoutPhases: leere/kaputte Struktur → [], kein Crash", () => {
  assert.deepEqual(expandWorkoutPhases(null), []);
  assert.deepEqual(expandWorkoutPhases(undefined), []);
  assert.deepEqual(expandWorkoutPhases({}), []);
  assert.deepEqual(expandWorkoutPhases({ version: 1, steps: [{ kind: "unbekannt" }] }), []);
  assert.deepEqual(
    expandWorkoutPhases({ version: 1, steps: [{ kind: "warmup", duration_s: 0, target_pct_ftp: 55 }] }),
    [],
    "Phase ohne verwertbare Dauer wird übersprungen",
  );
});

test("computeWorkoutSummary: leere/kaputte Struktur → alle Werte 0, kein Crash", () => {
  assert.deepEqual(computeWorkoutSummary(null), { computedTss: 0, timeInZone_s: {}, targetZoneTime_s: 0, overTime_s: 0 });
  assert.deepEqual(computeWorkoutSummary({}), { computedTss: 0, timeInZone_s: {}, targetZoneTime_s: 0, overTime_s: 0 });
  assert.deepEqual(computeWorkoutSummary({ version: 1, steps: [{ kind: "unbekannt" }] }), {
    computedTss: 0,
    timeInZone_s: {},
    targetZoneTime_s: 0,
    overTime_s: 0,
  });
});
