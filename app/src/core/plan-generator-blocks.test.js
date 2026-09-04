/* Tests: core/plan-generator-blocks.js — Blockfolge & Wochen-Verteilung
   (Fahrplan 8 E2). Reine Tabellen-/Verteilungslogik, isoliert von generatePlan. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  BUILD_PHASES,
  BLOCK_SYSTEMS,
  MODEL_BLOCK_SHARES,
  recoveryPeriod,
  recoveryWeekIndices,
  largestRemainder,
  buildPhaseSequence,
} from "./plan-generator-blocks.js";

/** Maximale Läufe gleicher Phase (ohne die abschließenden Taper-Wochen). */
function phaseRuns(phases) {
  const runs = [];
  for (const p of phases) {
    if (p === "Taper") break;
    if (runs.length && runs.at(-1).phase === p) runs.at(-1).n++;
    else runs.push({ phase: p, n: 1 });
  }
  return runs;
}

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

test("buildPhaseSequence polarized: Grundlagen-Block vorn, danach nur Schwelle/VO2max, kein Sweet Spot", () => {
  const { phases } = buildPhaseSequence({
    totalWeeks: 14,
    taperWeeks: 2,
    model: "polarized",
    level: "fortgeschritten",
    ageYears: 30,
  });
  assert.equal(phases.length, 14);
  const build = phases.slice(0, 12).filter((p) => p !== "Erholung");
  assert.ok(build.includes("Grundlage"), build.join("/"));
  assert.ok(!build.includes("Sweet Spot"), build.join("/"));
  for (const p of build) assert.ok(["Grundlage", "Schwelle", "VO2max"].includes(p), p);
  // Alle Grundlagen-Wochen stehen ganz vorn (kein Grundlage nach der ersten Qualitätswoche).
  const firstHard = build.findIndex((p) => p !== "Grundlage");
  assert.ok(!build.slice(firstHard).includes("Grundlage"), build.join("/"));
});

test("buildPhaseSequence polarized: Schwelle/VO2max wechseln sich ab", () => {
  const { phases, isRecovery } = buildPhaseSequence({
    totalWeeks: 16,
    taperWeeks: 0,
    model: "polarized",
    level: "fortgeschritten",
    ageYears: 30,
  });
  const hard = phases.filter((p, i) => !isRecovery[i] && p !== "Grundlage");
  assert.ok(hard.length >= 4);
  for (let i = 1; i < hard.length; i++) {
    assert.notEqual(hard[i], hard[i - 1], `${hard.join("/")}`);
    assert.ok(["Schwelle", "VO2max"].includes(hard[i]));
  }
});

test("buildPhaseSequence block: 3 zusammenhängende System-Blöcke (2–3 Wo), Erholung dazwischen, feste Reihenfolge", () => {
  const { phases, warnings } = buildPhaseSequence({
    totalWeeks: 14,
    taperWeeks: 2,
    model: "block",
    level: "fortgeschritten",
    ageYears: 30,
  });
  assert.equal(phases.length, 14);
  assert.deepEqual(phases.slice(-2), ["Taper", "Taper"]);
  assert.equal(warnings.length, 0);

  const runs = phaseRuns(phases);
  const sysRuns = runs.filter((r) => BLOCK_SYSTEMS.includes(r.phase));
  assert.equal(sysRuns.length, 3, JSON.stringify(runs));
  assert.deepEqual(
    sysRuns.map((r) => r.phase),
    BLOCK_SYSTEMS
  );
  for (const r of sysRuns) assert.ok(r.n >= 2 && r.n <= 3, `Blocklänge ${r.n}`);
  assert.equal(runs[0].phase, "Grundlage");
  assert.ok(runs.filter((r) => r.phase === "Erholung").length >= 1);
});

test("buildPhaseSequence block: kurzer Plan → Warnung, korrekte Länge, kein Absturz", () => {
  const { phases, warnings } = buildPhaseSequence({
    totalWeeks: 6,
    taperWeeks: 1,
    model: "block",
    level: "fortgeschritten",
    ageYears: 30,
  });
  assert.equal(phases.length, 6);
  assert.equal(phases.at(-1), "Taper");
  assert.ok(warnings.some((w) => w.includes("Block-Modell") || w.includes("braucht ~9")));
});

test("buildPhaseSequence: pyramidal/linear unverändert (Regression) — jede Phase, Reihenfolge, Taper hinten", () => {
  for (const model of ["pyramidal", "linear"]) {
    const { phases } = buildPhaseSequence({
      totalWeeks: 15,
      taperWeeks: 2,
      model,
      level: "fortgeschritten",
      ageYears: 30,
    });
    assert.equal(phases.length, 15);
    assert.deepEqual(phases.slice(-2), ["Taper", "Taper"]);
    for (const p of BUILD_PHASES) assert.ok(phases.includes(p), `${model}: ${p} fehlt`);
  }
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
