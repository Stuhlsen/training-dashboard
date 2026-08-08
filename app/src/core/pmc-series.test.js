/* Tests: core/pmc-series.js — lückenlose CTL/ATL/TSB-Reihe + Pfad-Segmente
   (Etappe 8a)
   Hintergrund: assets/js/ui/charts/pmc.js:146-175 — die Fortschreibung über
   projectPmc() statt joinSeries("carry") ist eine Regressionsabsicherung
   (früherer Bug: Lücke zwischen letzter Fahrt und "heute", bzw. bei
   dünner Datenlage zerfallende Ist-Kurve). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { densifyPmc, segmentsFor } from "./pmc-series.js";
import { densifyDays } from "./days.js";

test("densifyPmc: dichte Serie ohne Lücken übernimmt Ride-Werte 1:1", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rides = [
    { dateISO: "2026-06-01", ctl: 40, atl: 30 },
    { dateISO: "2026-06-02", ctl: 41, atl: 31 },
    { dateISO: "2026-06-03", ctl: 42, atl: 32 },
  ];
  const { ctlVals, atlVals } = densifyPmc(skeleton, rides, [], -1);
  assert.deepEqual(ctlVals, [40, 41, 42]);
  assert.deepEqual(atlVals, [30, 31, 32]);
});

test("densifyPmc: Lücke VOR der ersten bekannten Fahrt bleibt null (keine erfundene Vorgeschichte)", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rides = [{ dateISO: "2026-06-03", ctl: 42, atl: 32 }];
  const { ctlVals } = densifyPmc(skeleton, rides, [], -1);
  assert.deepEqual(ctlVals, [null, null, 42]);
});

test("densifyPmc: Lücke NACH einer bekannten Fahrt wird über projectPmc() fortgeschrieben, nicht auf 0 gesetzt", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-04");
  const rides = [
    { dateISO: "2026-06-01", ctl: 40, atl: 30 },
    { dateISO: "2026-06-04", ctl: 44, atl: 28 },
  ];
  const { ctlVals, atlVals } = densifyPmc(skeleton, rides, [], -1);
  // Tag 2/3 (Index 1/2) fehlen als Ride-Zeile, dürfen aber nicht 0/null sein —
  // Fortschreibung von Tag 1 aus (TSS=0-Zerfall), nicht der Wert von Tag 4.
  assert.equal(ctlVals[0], 40);
  assert.ok(ctlVals[1] != null && ctlVals[1] < 40);
  assert.ok(ctlVals[2] != null && ctlVals[2] < ctlVals[1]);
  assert.ok(atlVals[1] != null && atlVals[1] < 30);
});

test("densifyPmc: ab todayIdx werden ausschließlich projectionDays übernommen, nie selbst weitergerechnet", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-03");
  const rides = [{ dateISO: "2026-06-01", ctl: 40, atl: 30 }];
  const projectionDays = [
    { date: "2026-06-02", ctl: 999, atl: 999, tsb: 0 },
    { date: "2026-06-03", ctl: 1000, atl: 1000, tsb: 0 },
  ];
  const { ctlVals } = densifyPmc(skeleton, rides, projectionDays, 1);
  // Index 1 (06-02) und 2 (06-03) liegen ab todayIdx=1 — müssen exakt aus
  // projectionDays kommen, nicht aus einer eigenen Fortschreibung von Tag 1.
  assert.deepEqual(ctlVals, [40, 999, 1000]);
});

test("densifyPmc: Ride-Zeilen ohne ctl/atl werden ignoriert (kein Absturz, keine Teilwerte)", () => {
  const skeleton = densifyDays("2026-06-01", "2026-06-02");
  const rides = [
    { dateISO: "2026-06-01", ctl: null, atl: null },
    { dateISO: "2026-06-02", ctl: 41, atl: 31 },
  ];
  const { ctlVals } = densifyPmc(skeleton, rides, [], -1);
  assert.deepEqual(ctlVals, [null, 41]);
});

test("segmentsFor: bricht bei null-Lücken in mehrere Segmente auf", () => {
  const vals = [1, 2, null, 5, 6, 7];
  const segments = segmentsFor(vals, 0, 5);
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].map((p) => p.index), [0, 1]);
  assert.deepEqual(segments[1].map((p) => p.index), [3, 4, 5]);
});

test("segmentsFor: Ein-Punkt-Segmente werden verworfen (kein sichtbarer Strich)", () => {
  const vals = [null, 5, null];
  assert.deepEqual(segmentsFor(vals, 0, 2), []);
});

test("segmentsFor: respektiert from/to als Teilfenster", () => {
  const vals = [1, 2, 3, 4, 5];
  const segments = segmentsFor(vals, 1, 3);
  assert.deepEqual(segments[0].map((p) => p.index), [1, 2, 3]);
});
