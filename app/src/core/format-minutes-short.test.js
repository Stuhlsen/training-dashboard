/* Tests: core/format.js::fmtMinutesShort — Dauer im Kartennamen ("Z2 · 60 min",
   "Z2 · 3 h"). Es gibt kein gemeinsames format.test.js (vgl. format-pace.test.js). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { fmtMinutesShort } from "./format.js";

test("fmtMinutesShort: unter 120 min als Minuten", () => {
  assert.equal(fmtMinutesShort(30), "30 min");
  assert.equal(fmtMinutesShort(60), "60 min");
  assert.equal(fmtMinutesShort(119), "119 min");
});

test("fmtMinutesShort: ab 120 min als Stunden, volle Stunden ohne Minuten", () => {
  assert.equal(fmtMinutesShort(120), "2 h");
  assert.equal(fmtMinutesShort(180), "3 h");
  assert.equal(fmtMinutesShort(150), "2:30 h");
  assert.equal(fmtMinutesShort(205), "3:25 h");
});

test("fmtMinutesShort: rundet auf ganze Minuten, Grenzfall 59,6 → 60", () => {
  assert.equal(fmtMinutesShort(59.6), "60 min");
  assert.equal(fmtMinutesShort(119.6), "2 h");
});
