/* Tests: core/ladder-progression.js (Progressionssteuerung C3/C4, D4a-Trockenlauf + D4b) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLocks, nextStep, presetAction } from "../assets/js/core/ladder-progression.js";
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

/* presetAction — C4 ("Bedeutung der Presets nach dem Umbau"), D4b */

test("presetAction: isTestEvent friert die Leiter ein, unabhängig vom Preset (D5)", () => {
  for (const preset of ["general", "event", "check", "reduce", "build"]) {
    assert.deepEqual(presetAction(preset, { currentStep: 3, isTestEvent: true }), { step: 3, action: "hold" });
  }
});

test("presetAction 'build' (Aufbau steigern): +1 ohne Sperre, hold gesperrt", () => {
  assert.deepEqual(presetAction("build", { currentStep: 2 }), { step: 3, action: "up" });
  assert.deepEqual(presetAction("build", { currentStep: 2, locked: true }), { step: 2, action: "hold" });
});

test("presetAction 'reduce' (Entlasten): -1 mit lockWeeks, auf Stufe 1 nicht unter 1", () => {
  assert.deepEqual(presetAction("reduce", { currentStep: 3 }), { step: 2, action: "down", lockWeeks: 2 });
  assert.deepEqual(presetAction("reduce", { currentStep: 1 }), { step: 1, action: "down", lockWeeks: 2 });
});

test("presetAction 'check' (Nur prüfen): nie eine Stufenänderung, auch bei rot", () => {
  assert.deepEqual(presetAction("check", { currentStep: 4, rating: "red" }), { step: 4, action: "hold" });
  assert.deepEqual(presetAction("check", { currentStep: 4, rating: "green" }), { step: 4, action: "hold" });
});

test("presetAction 'general' (Allgemein prüfen): folgt C3 aus der letzten Ampel", () => {
  assert.deepEqual(presetAction("general", { currentStep: 2, rating: "green" }), { step: 3, action: "up" });
  assert.deepEqual(presetAction("general", { currentStep: 2, rating: "yellow" }), { step: 2, action: "hold" });
  assert.deepEqual(presetAction("general", { currentStep: 2, rating: "red" }), { step: 1, action: "down" });
});

test("presetAction 'event' (Auf Event hin): folgt C3 außerhalb des Tapers, eingefroren im Taper", () => {
  assert.deepEqual(presetAction("event", { currentStep: 2, rating: "green", inTaper: false }), { step: 3, action: "up" });
  assert.deepEqual(presetAction("event", { currentStep: 2, rating: "green", inTaper: true }), { step: 2, action: "hold" });
});

test("presetAction: unbekanntes Preset fällt auf 'general' zurück (analog buildAuftragBlock)", () => {
  assert.deepEqual(presetAction("unbekannt", { currentStep: 2, rating: "green" }), { step: 3, action: "up" });
});
