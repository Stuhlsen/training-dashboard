/* Tests: core/plan-workout-select-generic.js::selectGenericWorkout()/speedBand()
   — Fahrplan 14 E2/E3, Vertrag V4. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { selectGenericWorkout, speedBand } from "./plan-workout-select-generic.js";

test("speedBand: undefined ohne Schwellengeschwindigkeit", () => {
  assert.equal(speedBand([90, 110], null), undefined);
});

test("speedBand: [lo,hi] km/h aus %-Band × Schwellengeschwindigkeit", () => {
  assert.deepEqual(speedBand([90, 110], 4), [3.6, 4.4]);
});

test("selectGenericWorkout: wirft für unbekannte Sportart", () => {
  assert.throws(() => selectGenericWorkout({ sport: "ride", phase: "Grundlage" }));
});

test("selectGenericWorkout: workoutStructure immer null (kein .zwo-Export v1)", () => {
  const w = selectGenericWorkout({ sport: "swim", phase: "Schwelle", targetDurationMin: 45, targetTss: 40 });
  assert.equal(w.workoutStructure, null);
});

test("selectGenericWorkout: durationMin/tssPlanned aus dem Aufrufer-Ziel", () => {
  const w = selectGenericWorkout({ sport: "run", phase: "Grundlage", targetDurationMin: 60, targetTss: 55 });
  assert.equal(w.durationMin, 60);
  assert.equal(w.tssPlanned, 55);
});

test("selectGenericWorkout: qualitySlot 1 vs. 2 wählt unterschiedliche Typen, wenn vorhanden", () => {
  const slot1 = selectGenericWorkout({ sport: "swim", phase: "Grundlage", qualitySlot: 1, targetDurationMin: 45, targetTss: 30 });
  const slot2 = selectGenericWorkout({ sport: "swim", phase: "Grundlage", qualitySlot: 2, targetDurationMin: 45, targetTss: 30 });
  assert.notEqual(slot1.typ, slot2.typ);
});

test("selectGenericWorkout: kein speedTarget ohne currentThresholdSpeed, sonst gesetzt und aufsteigend", () => {
  const noSpeed = selectGenericWorkout({ sport: "run", phase: "VO2max", targetDurationMin: 45, targetTss: 60 });
  assert.equal(noSpeed.workout.speedTarget, undefined);

  const withSpeed = selectGenericWorkout({
    sport: "run",
    phase: "VO2max",
    currentThresholdSpeed: 12,
    targetDurationMin: 45,
    targetTss: 60,
  });
  assert.ok(Array.isArray(withSpeed.workout.speedTarget));
  assert.ok(withSpeed.workout.speedTarget[0] < withSpeed.workout.speedTarget[1]);
});

test("selectGenericWorkout: unbekannte Phase fällt auf Grundlage-Typ zurück, statt zu werfen", () => {
  const w = selectGenericWorkout({ sport: "swim", phase: "Taper", targetDurationMin: 30, targetTss: 20 });
  assert.equal(typeof w.typ, "string");
  assert.ok(w.typ.length > 0);
});
