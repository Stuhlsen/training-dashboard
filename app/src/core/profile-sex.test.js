/* Tests: core/profile-sex.js — abgeleitetes Geschlecht für die Ernährungs-
   Formeln (gender ist die einzige Quelle, sex nur bei divers/keine Angabe). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { effectiveSex, needsBiologicalSexQuestion } from "./profile-sex.js";

test("effectiveSex: männlich/weiblich werden aus gender abgeleitet", () => {
  assert.equal(effectiveSex("maennlich", null), "m");
  assert.equal(effectiveSex("weiblich", null), "f");
});

test("effectiveSex: widersprüchliches altes sex wird bei männlich/weiblich ignoriert", () => {
  assert.equal(effectiveSex("weiblich", "m"), "f");
  assert.equal(effectiveSex("maennlich", "f"), "m");
});

test("effectiveSex: bei divers / keine Angabe zählt das gespeicherte sex", () => {
  assert.equal(effectiveSex("divers", "f"), "f");
  assert.equal(effectiveSex("divers", "m"), "m");
  assert.equal(effectiveSex(null, "f"), "f");
  assert.equal(effectiveSex(undefined, "m"), "m");
});

test("effectiveSex: nichts Brauchbares → null", () => {
  assert.equal(effectiveSex("divers", null), null);
  assert.equal(effectiveSex(null, null), null);
  assert.equal(effectiveSex(undefined, undefined), null);
  assert.equal(effectiveSex("divers", "w"), null);
});

test("needsBiologicalSexQuestion: nur bei divers / keine Angabe", () => {
  assert.equal(needsBiologicalSexQuestion("maennlich"), false);
  assert.equal(needsBiologicalSexQuestion("weiblich"), false);
  assert.equal(needsBiologicalSexQuestion("divers"), true);
  assert.equal(needsBiologicalSexQuestion(null), true);
  assert.equal(needsBiologicalSexQuestion(undefined), true);
});
