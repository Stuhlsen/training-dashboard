/* Tests: core/plan-workout-select.js::selectWorkout() — Fahrplan 8 E3.
   Qualitätstag-Workout aus session_formats + Ladder-Stufe. Prüft: je Phase
   eine schema-valide, .zwo-exportierbare Struktur; Stufen steigen mit
   weekIndexInPhase; watts nur bei gesetzter FTP, pct immer; Over-Under-
   Rechnung (D1.4); crit hängt einen Sprint-Block an; Determinismus. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { selectWorkout, ladderStep, BUILTIN_FORMATS } from "./plan-workout-select.js";
import { validateWorkoutStructure } from "./workout-validator.js";
import { canExportZwo } from "./zwo-export.js";

const PHASES = ["Grundlage", "Sweet Spot", "Schwelle", "VO2max", "Taper"];

/** Standard-Argumente für einen fortgeschrittenen Athleten mit FTP. */
function args(over = {}) {
  return {
    phase: "Sweet Spot",
    weekIndexInPhase: 0,
    qualitySlot: 1,
    focus: "allgemein",
    level: "fortgeschritten",
    currentFtp: 250,
    targetDurationMin: 90,
    targetTss: 300,
    formats: [],
    ...over,
  };
}

test("ladderStep: Wochennummer → Stufe, gedeckelt auf Stufenzahl / Phase / Einsteiger", () => {
  assert.equal(ladderStep(0, "fortgeschritten", undefined, 8), 1);
  assert.equal(ladderStep(4, "fortgeschritten", undefined, 8), 5);
  assert.equal(ladderStep(20, "fortgeschritten", undefined, 8), 8); // Stufenzahl
  assert.equal(ladderStep(20, "fortgeschritten", 2, 8), 2); // Phasen-Deckel (Grundlage)
  assert.equal(ladderStep(6, "einsteiger", undefined, 8), 4); // Einsteiger-Deckel
  assert.equal(ladderStep(-3, "fortgeschritten", undefined, 8), 1); // nie < 1
});

test("jede Phase, beide Slots: schema-valide Struktur, .zwo-exportierbar, pct-Band, endliche Werte", () => {
  for (const phase of PHASES) {
    for (const qualitySlot of [1, 2]) {
      const w = selectWorkout(args({ phase, qualitySlot }));
      const tag = `${phase}/slot${qualitySlot}`;

      assert.ok(typeof w.typ === "string" && w.typ, `${tag}: typ fehlt`);
      assert.ok(Array.isArray(w.workout.pct) && w.workout.pct.length === 2, `${tag}: pct-Band fehlt`);
      assert.ok(canExportZwo(w.workout), `${tag}: workout nicht .zwo-exportierbar`);

      const res = validateWorkoutStructure(w.workoutStructure);
      assert.ok(res.valid, `${tag}: ungültige Struktur ${JSON.stringify(res.errors)}`);

      assert.ok(Number.isFinite(w.tssPlanned) && w.tssPlanned > 0, `${tag}: tssPlanned ${w.tssPlanned}`);
      assert.ok(Number.isFinite(w.durationMin) && w.durationMin > 0, `${tag}: durationMin ${w.durationMin}`);
    }
  }
});

test("typ folgt der Phase (Grundlage → Sweet Spot, Taper → Schwelle)", () => {
  assert.equal(selectWorkout(args({ phase: "Grundlage" })).typ, "Sweet Spot");
  assert.equal(selectWorkout(args({ phase: "Sweet Spot" })).typ, "Sweet Spot");
  assert.equal(selectWorkout(args({ phase: "Schwelle" })).typ, "Schwelle");
  assert.equal(selectWorkout(args({ phase: "VO2max" })).typ, "VO2max");
  assert.equal(selectWorkout(args({ phase: "Taper" })).typ, "Schwelle");
});

test("watts nur bei gesetzter FTP, pct immer", () => {
  const withFtp = selectWorkout(args({ phase: "Schwelle", currentFtp: 250 }));
  assert.ok(Array.isArray(withFtp.workout.watts), "watts fehlt trotz FTP");

  const noFtp = selectWorkout(args({ phase: "Schwelle", currentFtp: null }));
  assert.equal(noFtp.workout.watts, undefined, "watts trotz fehlender FTP");
  assert.ok(Array.isArray(noFtp.workout.pct), "pct fehlt ohne FTP");
});

test("Stufe steigt mit weekIndexInPhase (Schwelle Slot 1)", () => {
  const early = selectWorkout(args({ phase: "Schwelle", weekIndexInPhase: 0 }));
  const late = selectWorkout(args({ phase: "Schwelle", weekIndexInPhase: 3 }));
  assert.notEqual(early.name, late.name);
  assert.equal(early.name, "Schwelle 3×8"); // T1
  assert.equal(late.name, "Schwelle 3×12"); // T4
});

test("Grundlage bleibt auf S1–S2 gedeckelt, egal wie spät die Woche", () => {
  const w = selectWorkout(args({ phase: "Grundlage", weekIndexInPhase: 5, level: "fortgeschritten" }));
  assert.ok(["Sweet Spot 3×10", "Sweet Spot 3×12"].includes(w.name), `unerwartet: ${w.name}`);
});

test("Over-Under (Schwelle Slot 2): alternating-Schritt erfüllt D1.4 exakt", () => {
  const w = selectWorkout(args({ phase: "Schwelle", qualitySlot: 2 }));
  const alt = w.workoutStructure.steps.find((s) => s.kind === "alternating");
  assert.ok(alt, "kein alternating-Schritt");
  assert.equal(alt.cycles * (alt.over.duration_s + alt.under.duration_s), alt.duration_s);
});

test("Fokus crit hängt an Slot 2 einen Sprint-Block an, an Slot 1 nicht", () => {
  const slot1 = selectWorkout(args({ phase: "VO2max", qualitySlot: 1, focus: "crit" }));
  assert.ok(!slot1.workoutStructure.steps.some((s) => s.kind === "accessory"));
  assert.ok(!slot1.name.includes("Sprint"));

  const slot2 = selectWorkout(args({ phase: "VO2max", qualitySlot: 2, focus: "crit" }));
  assert.ok(slot2.workoutStructure.steps.some((s) => s.kind === "accessory"), "kein Sprint-Block");
  assert.ok(slot2.name.endsWith(" + Sprint"), `name: ${slot2.name}`);

  const plain = selectWorkout(args({ phase: "VO2max", qualitySlot: 2, focus: "allgemein" }));
  assert.ok(slot2.durationMin > plain.durationMin, "crit-Variante nicht länger");
});

test("durchgereichte session_formats-Zeile schlägt die eingebaute Startbelegung", () => {
  const formats = [{ id: "threshold-long", axes: { explicitSteps: [{ id: "X1", structureLabel: "5×7", pctFtp: 99 }] } }];
  const w = selectWorkout(args({ phase: "Schwelle", weekIndexInPhase: 0, formats }));
  assert.equal(w.name, "Schwelle 5×7");
});

test("unbekannte Phase fällt auf Sweet Spot zurück", () => {
  assert.equal(selectWorkout(args({ phase: "Quatsch" })).typ, "Sweet Spot");
});

test("Determinismus: gleiche Argumente → gleiches Ergebnis", () => {
  assert.deepEqual(selectWorkout(args({ phase: "VO2max", qualitySlot: 2 })), selectWorkout(args({ phase: "VO2max", qualitySlot: 2 })));
});

test("BUILTIN_FORMATS deckt alle im Phasen-Mapping genutzten IDs ab", () => {
  for (const id of ["sweetspot-long", "threshold-long", "vo2-long", "vo2-short", "over-under", "sprint-accessory"]) {
    assert.ok(BUILTIN_FORMATS[id]?.axes?.explicitSteps?.length, `${id} fehlt`);
  }
});
