/* Tests: core/progress-indicators.js (F1, Fenster E1a) */

import test from "node:test";
import assert from "node:assert/strict";
import {
  eftpProgressSummary,
  bestEffortComparison,
  BEST_EFFORT_DURATIONS,
} from "../assets/js/core/progress-indicators.js";

/* ── eftpProgressSummary ─────────────────────────────────────── */

test("eftpProgressSummary: null bei leerer Historie", () => {
  assert.equal(eftpProgressSummary([]), null);
  assert.equal(eftpProgressSummary(null), null);
});

test("eftpProgressSummary: first/last/nPoints auch bei < 3 Punkten, aber slope null", () => {
  const history = [
    { date: "2026-07-01", eftp: 190 },
    { date: "2026-07-15", eftp: 192 },
  ];
  const result = eftpProgressSummary(history);
  assert.equal(result.first, 190);
  assert.equal(result.last, 192);
  assert.equal(result.nPoints, 2);
  assert.equal(result.slopePerWeek, null);
});

test("eftpProgressSummary: steigender Trend liefert positive slopePerWeek", () => {
  const history = [
    { date: "2026-06-01", eftp: 185 },
    { date: "2026-06-15", eftp: 190 },
    { date: "2026-06-29", eftp: 195 },
    { date: "2026-07-13", eftp: 200 },
  ];
  const result = eftpProgressSummary(history);
  // +15W über 6 Wochen ≈ +2.5W/Woche
  assert.ok(result.slopePerWeek > 2 && result.slopePerWeek < 3, `slopePerWeek=${result.slopePerWeek}`);
});

test("eftpProgressSummary: lastRampTest wird nur durchgereicht, nicht verändert", () => {
  const history = [{ date: "2026-07-01", eftp: 190 }];
  const rampTest = { date: "2026-05-01", ftpWatt: 193 };
  const result = eftpProgressSummary(history, rampTest);
  assert.deepEqual(result.lastRampTest, { date: "2026-05-01", ftpWatt: 193 });
});

test("eftpProgressSummary: ohne lastRampTest bleibt das Feld null", () => {
  const result = eftpProgressSummary([{ date: "2026-07-01", eftp: 190 }]);
  assert.equal(result.lastRampTest, null);
});

/* ── bestEffortComparison ────────────────────────────────────── */

function curveBlock(secs, watts) {
  return { curve: { secs, watts } };
}

test("bestEffortComparison: liefert 5min + 20min mit Delta", () => {
  const recent = curveBlock([60, 300, 1200], [280, 230, 200]);
  const previous = curveBlock([60, 300, 1200], [270, 220, 190]);
  const result = bestEffortComparison(recent, previous);
  assert.equal(result.length, 2);
  const five = result.find((r) => r.label === "5min");
  const twenty = result.find((r) => r.label === "20min");
  assert.deepEqual(five, { label: "5min", secs: 300, recentW: 230, previousW: 220, deltaW: 10 });
  assert.deepEqual(twenty, { label: "20min", secs: 1200, recentW: 200, previousW: 190, deltaW: 10 });
});

test("bestEffortComparison: fehlender Block liefert leere Liste statt Fehler", () => {
  assert.deepEqual(bestEffortComparison(null, null), []);
  assert.deepEqual(bestEffortComparison(curveBlock([300], [230]), null), []);
});

test("bestEffortComparison: Block ohne Kurve für diese Dauer wird übersprungen", () => {
  // Kurve hat nur 5min, kein 20min-Wert in der Nähe genug (nearestWatts findet
  // trotzdem den nächstliegenden Punkt — hier bewusst BEIDE Dauern abdecken,
  // damit der "fehlt komplett"-Fall separat bleibt: leere secs/watts.
  const recent = curveBlock([], []);
  const previous = curveBlock([300, 1200], [220, 190]);
  assert.deepEqual(bestEffortComparison(recent, previous), []);
});

test("BEST_EFFORT_DURATIONS: genau 5min und 20min, in dieser Reihenfolge", () => {
  assert.deepEqual(
    BEST_EFFORT_DURATIONS.map((d) => d.label),
    ["5min", "20min"]
  );
});
