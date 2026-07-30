/* Tests: scripts/lib/coverage.js — geteilte Feld-Abdeckungs-Zählung (war
   unabhängig in scripts/lib/wellness.js und scripts/lib/map-activity.js::
   rpeFeelCoverage() dupliziert, s. docs/offene-punkte.md). Reine Funktion,
   keine Mocks. */

import test from "node:test";
import assert from "node:assert/strict";
import { countFieldCoverage } from "../scripts/lib/coverage.js";

test("countFieldCoverage: zählt non-null-Werte je Feld", () => {
  const rows = [
    { a: 1, b: null },
    { a: null, b: 2 },
    { a: 3, b: 4 },
  ];
  assert.deepEqual(countFieldCoverage(rows, ["a", "b"]), { a: 2, b: 2 });
});

test("countFieldCoverage: leere Liste → alle Felder 0, keine fehlenden Keys", () => {
  assert.deepEqual(countFieldCoverage([], ["a", "b"]), { a: 0, b: 0 });
});

test("countFieldCoverage: null/undefined-Liste wirft nicht, verhält sich wie leer", () => {
  assert.deepEqual(countFieldCoverage(null, ["a"]), { a: 0 });
  assert.deepEqual(countFieldCoverage(undefined, ["a"]), { a: 0 });
});

test("countFieldCoverage: ignoriert Felder, die nicht in der fields-Liste stehen", () => {
  const rows = [{ a: 1, extra: "x" }];
  assert.deepEqual(countFieldCoverage(rows, ["a"]), { a: 1 });
});
