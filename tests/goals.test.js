import { test } from "node:test";
import assert from "node:assert/strict";
import { pickFtpGoal } from "../scripts/lib/goals.js";

test("pickFtpGoal: kein passendes Ziel → null", () => {
  assert.equal(pickFtpGoal([]), null);
  assert.equal(pickFtpGoal(undefined), null);
  assert.equal(pickFtpGoal([{ kind: "Gewicht", targetValue: 70, createdAt: "2026-01-01" }]), null);
});

test("pickFtpGoal: Art enthält 'ftp' (Groß-/Kleinschreibung egal)", () => {
  assert.equal(pickFtpGoal([{ kind: "FTP", targetValue: 250, createdAt: "2026-01-01" }]), 250);
  assert.equal(pickFtpGoal([{ kind: "mein Ftp ziel", targetValue: 240, createdAt: "2026-01-01" }]), 240);
});

test("pickFtpGoal: bei mehreren gewinnt das zuletzt angelegte", () => {
  const goals = [
    { kind: "FTP", targetValue: 210, createdAt: "2026-02-01T10:00:00Z" },
    { kind: "FTP", targetValue: 255, createdAt: "2026-10-15T08:00:00Z" },
    { kind: "FTP", targetValue: 230, createdAt: "2026-05-01T10:00:00Z" },
  ];
  assert.equal(pickFtpGoal(goals), 255);
});

test("pickFtpGoal: Ziel ohne oder mit ungültigem Zielwert wird ignoriert", () => {
  const goals = [
    { kind: "FTP", targetValue: 210, createdAt: "2026-02-01" },
    { kind: "FTP", targetValue: null, createdAt: "2026-10-01" },
    { kind: "FTP", targetValue: 0, createdAt: "2026-10-02" },
  ];
  assert.equal(pickFtpGoal(goals), 210);
});
