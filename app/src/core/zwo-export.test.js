/* Tests: core/zwo-export.js — Plankarte → .zwo-Workout-Datei. Reine Funktion,
   keine Mocks. Beispielkarte ("Sweet Spot 3×10 min") ist die reale Form aus
   scripts/lib/plan2.js. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { buildZwoWorkout, canExportZwo } from "./zwo-export.js";

const NUMERIC_CARD = {
  date: "2026-07-02",
  name: "Sweet Spot 3×10 min",
  details: "SS-Erhaltung",
  workout: {
    warmup: 10,
    intervals: 3,
    duration: 10,
    rest: 3,
    cooldown: 8,
    zone: "SS",
    pct: [84, 97],
    watts: [162, 187],
    label: "3×10 min @ SS (84–97% FTP)",
  },
};

test("buildZwoWorkout: numerisches Workout -> gültige .zwo-XML mit korrekten Werten", () => {
  const result = buildZwoWorkout(NUMERIC_CARD);
  assert.equal(result.ok, true);
  assert.equal(result.filename, "2026-07-02-workout.zwo");
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.6"\/>/);
  // Mittelwert aus pct [84,97] gerundet = 91 % FTP = 0.91. Pause NUR zwischen
  // den Wiederholungen (Repeat = intervals-1), keine nach der letzten — s.
  // core/ftp-progress.js::workoutSegments() ("keine Pause nach der letzten").
  assert.match(result.xml, /<IntervalsT Repeat="2" OnDuration="600" OffDuration="180" OnPower="0\.91" OffPower="0\.5"\/>/);
  assert.match(result.xml, /<SteadyState Duration="600" Power="0\.91"\/>/);
  assert.match(result.xml, /<Cooldown Duration="480" PowerLow="0\.5" PowerHigh="0\.4"\/>/);
  assert.match(result.xml, /<name>Sweet Spot 3×10 min<\/name>/);
});

test("buildZwoWorkout: bei genau einem Intervall (intervals: 1) kein IntervalsT-Pausenblock", () => {
  const result = buildZwoWorkout({
    date: "2026-07-02",
    name: "Threshold 1×20 min",
    workout: { warmup: 10, intervals: 1, duration: 20, cooldown: 8, pct: [98, 102] },
  });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.xml, /IntervalsT/);
  assert.match(result.xml, /<SteadyState Duration="1200" Power="1\.00"\/>/);
});

test("canExportZwo: numerisches Workout mit Hauptsatz -> true, Blockform/Ramp-Test -> false", () => {
  assert.equal(canExportZwo(NUMERIC_CARD.workout), true);
  assert.equal(canExportZwo({ blocks: [] }), false);
  assert.equal(canExportZwo({ warmup: 10, intervals: null, duration: null, cooldown: 5, pct: null }), false);
  assert.equal(canExportZwo(null), false);
});

test("buildZwoWorkout: ohne Hauptsatz (nur warmup/cooldown, z. B. Ramp-Test mit intervals: null) -> NO_DATA", () => {
  const result = buildZwoWorkout({
    date: "2026-09-19",
    name: "FTP Ramp Test",
    workout: { warmup: 10, intervals: null, duration: null, rest: null, cooldown: 5, zone: "RAMP", pct: null },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: Freitext-Blockform -> NO_DATA statt geratenem Ergebnis", () => {
  const result = buildZwoWorkout({
    date: "2026-08-28",
    name: "VO2max 5×3 min",
    workout: { blocks: [{ type: "interval", text: "5×3 min @ 106–120% FTP" }] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: intervals gesetzt, aber pct unvollständig -> NO_DATA statt stillschweigend weggelassenem Hauptsatz", () => {
  const result = buildZwoWorkout({
    date: "2026-07-02",
    name: "Sweet Spot 3×10 min",
    workout: { warmup: 10, cooldown: 8, intervals: 3, duration: 10, pct: [84] },
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: kein workout -> NO_DATA", () => {
  const result = buildZwoWorkout({ date: "2026-08-28", name: "Z2 Lang", workout: null });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_DATA");
});

test("buildZwoWorkout: Name/Details mit XML-Sonderzeichen werden escaped", () => {
  const result = buildZwoWorkout({
    ...NUMERIC_CARD,
    name: 'Test & <Intervalle> "hart"',
    details: "A & B",
  });
  assert.equal(result.ok, true);
  assert.match(result.xml, /<name>Test &amp; &lt;Intervalle&gt; &quot;hart&quot;<\/name>/);
  assert.match(result.xml, /<description>A &amp; B<\/description>/);
});
