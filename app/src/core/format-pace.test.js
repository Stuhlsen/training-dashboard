/* Tests: core/format.js::fmtPace — Pace-Anzeige "m:ss" (Fahrplan 10 E7).
   (Es gibt kein gemeinsames format.test.js; fmtPace steht hier allein.) */

import { test } from "vitest";
import assert from "node:assert/strict";
import { fmtPace } from "./format.js";

test("fmtPace: Sekunden → m:ss", () => {
  assert.equal(fmtPace(270), "4:30");
  assert.equal(fmtPace(300), "5:00");
  assert.equal(fmtPace(65), "1:05");
  assert.equal(fmtPace(3599), "59:59");
});

test("fmtPace: rundet auf die Sekunde (Übertrag)", () => {
  assert.equal(fmtPace(59.6), "1:00");
  assert.equal(fmtPace(269.4), "4:29");
});

test("fmtPace: null / NaN / ≤ 0 → –", () => {
  assert.equal(fmtPace(null), "–");
  assert.equal(fmtPace(undefined), "–");
  assert.equal(fmtPace(NaN), "–");
  assert.equal(fmtPace(0), "–");
  assert.equal(fmtPace(-5), "–");
});
