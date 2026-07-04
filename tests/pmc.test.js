/* Tests: CTL-Interpolation und TSB-Ableitung (core/pmc.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolateCtl, tsbOf } from "../assets/js/core/pmc.js";

test("tsbOf: expliziter Wert vor Ableitung, null ohne Daten", () => {
  assert.equal(tsbOf({ tsb: -12, ctl: 50, atl: 40 }), -12);
  assert.equal(tsbOf({ ctl: 50, atl: 40 }), 10);
  assert.equal(tsbOf({ ctl: 50 }), null);
  assert.equal(tsbOf({}), null);
});

test("interpolateCtl: Lücke in der Mitte wird linear gefüllt", () => {
  const rides = [
    { dateISO: "2026-06-01", ctl: 40 },
    { dateISO: "2026-06-02", ctl: null },
    { dateISO: "2026-06-03", ctl: 50 },
  ];
  const out = interpolateCtl(rides);
  assert.equal(out.length, 3);
  assert.equal(out[0].interpolated, false);
  assert.equal(out[1].interpolated, true);
  assert.equal(out[1].ctlVal, 45);
  assert.equal(out[2].ctlVal, 50);
});

test("interpolateCtl: Randpunkte übernehmen nächsten bekannten Wert", () => {
  const rides = [
    { dateISO: "2026-06-01", ctl: null }, // nur next vorhanden
    { dateISO: "2026-06-02", ctl: 42 },
    { dateISO: "2026-06-03", ctl: null }, // nur prev vorhanden
  ];
  const out = interpolateCtl(rides);
  assert.equal(out[0].ctlVal, 42);
  assert.equal(out[0].interpolated, true);
  assert.equal(out[2].ctlVal, 42);
  assert.equal(out[2].interpolated, true);
});

test("interpolateCtl: Fahrten ganz ohne CTL-Kontext werden verworfen", () => {
  const out = interpolateCtl([
    { dateISO: "2026-06-01", ctl: null },
    { dateISO: "2026-06-02", ctl: null },
  ]);
  assert.equal(out.length, 0);
});
