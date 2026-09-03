/* Tests: core/plan-generator-blocks.js — Blockfolge & Wochen-Verteilung
   (Fahrplan 8 E2). Reine Tabellen-/Verteilungslogik, isoliert von generatePlan. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  BUILD_PHASES,
  MODEL_BLOCK_SHARES,
  recoveryPeriod,
  recoveryWeekIndices,
  largestRemainder,
  buildPhaseSequence,
} from "./plan-generator-blocks.js";

test("MODEL_BLOCK_SHARES: pyramidal + linear summieren auf 1", () => {
  for (const model of ["pyramidal", "linear"]) {
    const total = BUILD_PHASES.reduce((s, p) => s + MODEL_BLOCK_SHARES[model][p], 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `${model} → ${total}`);
  }
});

test("recoveryPeriod: level-abhängig, Alter ≥ 40 erzwingt 2:1", () => {
  assert.equal(recoveryPeriod("einsteiger", null), 3);
  assert.equal(recoveryPeriod("fortgeschritten", null), 4);
  assert.equal(recoveryPeriod("fortgeschritten", 41), 3);
  assert.equal(recoveryPeriod("fortgeschritten", 39), 4);
});

test("recoveryWeekIndices: nie Woche 0, nie die letzte Bau-Woche", () => {
  const idx = recoveryWeekIndices(12, 4); // 4:1 → wäre [3,7,11]
  assert.ok(!idx.includes(0));
  assert.ok(!idx.includes(11), "letzte Bau-Woche darf keine Erholung sein");
  assert.deepEqual(idx, [3, 7, 10]); // 11 → auf 10 vorgezogen
});

test("largestRemainder: Summe trifft total exakt, deterministisch bei Gleichstand", () => {
  assert.deepEqual(largestRemainder([0.25, 0.25, 0.25, 0.25], 10), [3, 3, 2, 2]);
  assert.equal(
    largestRemainder([0.4, 0.25, 0.2, 0.15], 9).reduce((s, x) => s + x, 0),
    9
  );
  assert.deepEqual(largestRemainder([1, 1, 1], 0), [0, 0, 0]);
});

test("buildPhaseSequence: Länge = totalWeeks, Taper-Wochen hinten, Reihenfolge der Aufbau-Phasen erhalten", () => {
  const { phases, isRecovery } = buildPhaseSequence({
    totalWeeks: 12,
    taperWeeks: 2,
    model: "pyramidal",
    level: "fortgeschritten",
    ageYears: 30,
  });
  assert.equal(phases.length, 12);
  assert.equal(isRecovery.length, 12);
  assert.deepEqual(phases.slice(-2), ["Taper", "Taper"]);

  // Aufbau-Phasen (ohne Erholung/Taper) müssen in der BUILD_PHASES-Reihenfolge stehen
  const buildOnly = phases.slice(0, 10).filter((p) => p !== "Erholung");
  let maxSeen = -1;
  for (const p of buildOnly) {
    const rank = BUILD_PHASES.indexOf(p);
    assert.ok(rank >= maxSeen, `${p} kommt nach einer späteren Phase`);
    maxSeen = Math.max(maxSeen, rank);
  }
});

test("buildPhaseSequence: jede Phase bekommt ≥ 1 Woche bei genug Aufbau-Wochen", () => {
  const { phases } = buildPhaseSequence({
    totalWeeks: 13,
    taperWeeks: 2,
    model: "linear",
    level: "fortgeschritten",
    ageYears: 30,
  });
  for (const p of BUILD_PHASES) {
    assert.ok(phases.includes(p), `Phase ${p} fehlt: ${phases.join("/")}`);
  }
});

test("buildPhaseSequence: zu wenige Aufbau-Wochen → Warnung, kein Absturz", () => {
  const { phases, warnings } = buildPhaseSequence({
    totalWeeks: 5,
    taperWeeks: 2,
    model: "pyramidal",
    level: "einsteiger",
    ageYears: null,
  });
  assert.equal(phases.length, 5);
  assert.ok(warnings.length >= 1);
});

test("buildPhaseSequence: open-Modus (taperWeeks 0) hat keine Taper-Woche", () => {
  const { phases } = buildPhaseSequence({
    totalWeeks: 10,
    taperWeeks: 0,
    model: "linear",
    level: "einsteiger",
    ageYears: null,
  });
  assert.ok(!phases.includes("Taper"));
});
