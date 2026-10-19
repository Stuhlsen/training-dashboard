/* Tests: core/ftp-goal.js — welches FTP-Ziel gilt (eigenes DB-Ziel →
   öffentliches Payload-Ziel → config.ts). pickFtpGoal spiegelt
   scripts/lib/goals.js::pickFtpGoal (dort in tests/goals.test.js). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { pickFtpGoal, resolveFtpGoal } from "./ftp-goal.js";

test("pickFtpGoal: kein passendes Ziel → null", () => {
  assert.equal(pickFtpGoal([]), null);
  assert.equal(pickFtpGoal(null), null);
  assert.equal(pickFtpGoal([{ kind: "Gewicht", targetValue: 70 }]), null);
});

test("pickFtpGoal: Art enthält 'ftp' (Groß-/Kleinschreibung egal)", () => {
  assert.equal(pickFtpGoal([{ kind: "FTP", targetValue: 250 }]), 250);
  assert.equal(pickFtpGoal([{ kind: "mein Ftp ziel", targetValue: 240 }]), 240);
});

test("pickFtpGoal: bei mehreren gewinnt das zuletzt angelegte (Liste: älteste zuerst)", () => {
  const goals = [
    { kind: "FTP", targetValue: 210 },
    { kind: "Gewicht", targetValue: 70 },
    { kind: "FTP", targetValue: 255 },
  ];
  assert.equal(pickFtpGoal(goals), 255);
});

test("pickFtpGoal: Ziel ohne oder mit ungültigem Zielwert wird übersprungen", () => {
  const goals = [
    { kind: "FTP", targetValue: 210 },
    { kind: "FTP", targetValue: null },
    { kind: "FTP", targetValue: 0 },
  ];
  assert.equal(pickFtpGoal(goals), 210);
});

test("resolveFtpGoal: eigenes Ziel → öffentliches Ziel → config.ts", () => {
  assert.equal(resolveFtpGoal({ ownGoal: 260, publicGoal: 250, configGoal: 210 }), 260);
  assert.equal(resolveFtpGoal({ ownGoal: null, publicGoal: 250, configGoal: 210 }), 250);
  assert.equal(resolveFtpGoal({ ownGoal: null, publicGoal: null, configGoal: 210 }), 210);
  assert.equal(resolveFtpGoal({}), null);
});

test("resolveFtpGoal: 0 und NaN zählen nicht als gesetzt", () => {
  assert.equal(resolveFtpGoal({ ownGoal: 0, publicGoal: NaN, configGoal: 210 }), 210);
});
