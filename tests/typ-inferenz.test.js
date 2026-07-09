/* Tests: Typ-Ableitung aus Intensity Factor (scripts/lib/map-activity.js)
   Grenzwerte: <0.75 Grundlage · <0.85 Z2 · <0.90 Tempo · <0.95 SS · <1.05 Schwelle · sonst VO2max */

import { test } from "node:test";
import assert from "node:assert/strict";
import { inferTypFromIF, DEFAULT_FTP } from "../scripts/lib/map-activity.js";

test("ohne NP oder FTP → Außerplanmäßig", () => {
  assert.equal(inferTypFromIF(null, 60), "Außerplanmäßig");
  assert.equal(inferTypFromIF(150, 60, null), "Außerplanmäßig");
  assert.equal(inferTypFromIF(0, 60), "Außerplanmäßig");
});

test("kurze Fahrt mit hohem IF → FTP-Test", () => {
  // IF > 0.95 bei < 30 min
  assert.equal(inferTypFromIF(DEFAULT_FTP * 0.96, 25), "FTP-Test");
  // exakt 30 min ist kein Test mehr
  assert.equal(inferTypFromIF(DEFAULT_FTP * 0.96, 30), "Schwelle");
});

test("niedriger IF: Dauer entscheidet zwischen Recovery/Z2", () => {
  const np = DEFAULT_FTP * 0.6; // IF 0.60
  assert.equal(inferTypFromIF(np, 45), "Z1 Recovery"); // < 60 min
  assert.equal(inferTypFromIF(np, 60), "Z2 Dauer"); // >= 60 min
  assert.equal(inferTypFromIF(np, 120), "Z2 Lang"); // >= 120 min
});

test("IF-Stufen 0.75–1.05+", () => {
  const at = (ifVal) => inferTypFromIF(Math.round(DEFAULT_FTP * ifVal), 90);
  assert.equal(at(0.8), "Z2 Dauer");
  assert.equal(at(0.87), "Tempo");
  assert.equal(at(0.92), "Sweet Spot");
  assert.equal(at(1.0), "Schwelle");
  assert.equal(at(1.1), "VO2max");
});

test("Grenzwerte exakt (>= kippt in die nächste Stufe)", () => {
  // np/ftp === 0.75 → nicht mehr Grundlagen-Zweig
  assert.equal(inferTypFromIF(DEFAULT_FTP * 0.75, 150), "Z2 Dauer");
  // np/ftp === 1.05 → VO2max
  assert.equal(inferTypFromIF(DEFAULT_FTP * 1.05, 60), "VO2max");
});
