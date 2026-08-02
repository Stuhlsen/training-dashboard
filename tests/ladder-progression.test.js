/* Tests: core/ladder-progression.js (Progressionssteuerung C3, D4a-Trockenlauf) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLocks, nextStep } from "../assets/js/core/ladder-progression.js";
import { LADDER_PROGRESSION } from "../assets/js/core/plan-config.js";

test("evaluateLocks: keine Sperre ohne Bedingungen", () => {
  assert.deepEqual(evaluateLocks(), { locked: false, reasons: [] });
});

test("evaluateLocks: Erholungswoche sperrt", () => {
  assert.deepEqual(evaluateLocks({ isRecoveryWeek: true }), { locked: true, reasons: ["erholungswoche"] });
});

test("evaluateLocks: Governor rot sperrt, gelb/grün nicht", () => {
  assert.equal(evaluateLocks({ governorLevel: "red" }).locked, true);
  assert.equal(evaluateLocks({ governorLevel: "yellow" }).locked, false);
  assert.equal(evaluateLocks({ governorLevel: "green" }).locked, false);
});

test("evaluateLocks: projizierte CTL-Rampe über der Schwelle sperrt, an der Schwelle selbst nicht", () => {
  assert.equal(evaluateLocks({ projectedRampCtl: LADDER_PROGRESSION.ctlRampLockThreshold }).locked, false);
  assert.equal(evaluateLocks({ projectedRampCtl: LADDER_PROGRESSION.ctlRampLockThreshold + 0.1 }).locked, true);
});

test("evaluateLocks: bereits diese Woche hochgestuft sperrt", () => {
  assert.deepEqual(evaluateLocks({ alreadyUpgradedThisWeek: true }), {
    locked: true,
    reasons: ["bereits-hochgestuft-diese-woche"],
  });
});

test("evaluateLocks: mehrere Sperren gleichzeitig sammeln alle Gründe", () => {
  const result = evaluateLocks({ isRecoveryWeek: true, governorLevel: "red", alreadyUpgradedThisWeek: true });
  assert.equal(result.locked, true);
  assert.deepEqual(result.reasons, ["erholungswoche", "governor-rot", "bereits-hochgestuft-diese-woche"]);
});

test("nextStep: grün ohne Sperre/hohen RPE -> up", () => {
  assert.equal(nextStep({ rating: "green" }), "up");
});

test("nextStep: gelb -> hold, unabhängig vom RPE", () => {
  assert.equal(nextStep({ rating: "yellow" }), "hold");
  assert.equal(nextStep({ rating: "yellow", rpe: 9 }), "hold");
});

test("nextStep: rot -> down", () => {
  assert.equal(nextStep({ rating: "red" }), "down");
});

test("nextStep: C2.1 -- grün mit RPE >= rpeUpgradeBlockMin -> hold statt up (keine Abwertung bis rot)", () => {
  assert.equal(nextStep({ rating: "green", rpe: LADDER_PROGRESSION.rpeUpgradeBlockMin }), "hold");
  assert.equal(nextStep({ rating: "green", rpe: LADDER_PROGRESSION.rpeUpgradeBlockMin - 1 }), "up");
});

test("nextStep: eine Sperre erzwingt hold, auch bei grün oder rot ('unabhängig von der Ampel')", () => {
  assert.equal(nextStep({ rating: "green", locked: true }), "hold");
  assert.equal(nextStep({ rating: "red", locked: true }), "hold");
});
