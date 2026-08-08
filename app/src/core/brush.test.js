/* Tests: core/brush.js — Zeitfenster-Mathematik fürs Brushing (Etappe 8b)
   Hintergrund: docs/phase-5-konzept-explorer.md §4 (Brush) + §7.2 Schritt 1. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { clampWindow, presetWindow } from "./brush.js";

const BOUNDS = { anchorISO: "2026-06-01", horizonEndISO: "2026-09-20" };

test("clampWindow: Fenster ganz innerhalb der Bounds bleibt unverändert", () => {
  const win = clampWindow({ fromISO: "2026-07-01", toISO: "2026-07-31" }, BOUNDS);
  assert.deepEqual(win, { fromISO: "2026-07-01", toISO: "2026-07-31" });
});

test("clampWindow: fromISO vor dem Anker wird auf den Anker geklemmt", () => {
  const win = clampWindow({ fromISO: "2026-01-01", toISO: "2026-07-01" }, BOUNDS);
  assert.equal(win.fromISO, BOUNDS.anchorISO);
});

test("clampWindow: toISO nach dem Horizont wird auf den Horizont geklemmt", () => {
  const win = clampWindow({ fromISO: "2026-07-01", toISO: "2027-01-01" }, BOUNDS);
  assert.equal(win.toISO, BOUNDS.horizonEndISO);
});

test("clampWindow: vertauschtes Fenster (from > to) wird geradegerückt", () => {
  const win = clampWindow({ fromISO: "2026-08-01", toISO: "2026-07-01" }, BOUNDS);
  assert.ok(win.fromISO <= win.toISO);
});

test("clampWindow: Mindestlänge wird durchgesetzt, ohne vor den Anker zu schieben", () => {
  const win = clampWindow({ fromISO: "2026-07-10", toISO: "2026-07-11" }, { ...BOUNDS, minDays: 5 });
  assert.equal(win.toISO, "2026-07-11");
  assert.equal(win.fromISO, "2026-07-06");
});

test("clampWindow: Mindestlänge größer als der verfügbare Horizont bleibt am Anker stehen", () => {
  const win = clampWindow(
    { fromISO: "2026-06-01", toISO: "2026-06-02" },
    { anchorISO: "2026-06-01", horizonEndISO: "2026-06-02", minDays: 30 },
  );
  assert.equal(win.fromISO, "2026-06-01");
  assert.equal(win.toISO, "2026-06-02");
});

const P_BOUNDS = {
  todayISO: "2026-08-08",
  anchorISO: "2026-03-01",
  horizonEndISO: "2026-09-20",
  plan2StartISO: "2026-06-22",
};

test("presetWindow: '30' ist heute minus 30 Tage bis zum Horizont", () => {
  const win = presetWindow("30", P_BOUNDS);
  assert.deepEqual(win, { fromISO: "2026-07-09", toISO: "2026-09-20" });
});

test("presetWindow: '90' ist heute minus 90 Tage bis zum Horizont", () => {
  const win = presetWindow("90", P_BOUNDS);
  assert.deepEqual(win, { fromISO: "2026-05-10", toISO: "2026-09-20" });
});

test("presetWindow: '365' wird am Anker geklemmt (weiter zurück gibt es nichts)", () => {
  const win = presetWindow("365", P_BOUNDS);
  assert.equal(win.fromISO, P_BOUNDS.anchorISO);
  assert.equal(win.toISO, P_BOUNDS.horizonEndISO);
});

test("presetWindow: 'all' ist Anker bis Horizont", () => {
  const win = presetWindow("all", P_BOUNDS);
  assert.deepEqual(win, { fromISO: P_BOUNDS.anchorISO, toISO: P_BOUNDS.horizonEndISO });
});

test("presetWindow: 'plan2' ist Plan-2-Start bis Horizont", () => {
  const win = presetWindow("plan2", P_BOUNDS);
  assert.deepEqual(win, { fromISO: "2026-06-22", toISO: "2026-09-20" });
});

test("presetWindow: 'plan2' ohne plan2StartISO liefert null (Athlet ohne Plan 2)", () => {
  const win = presetWindow("plan2", { ...P_BOUNDS, plan2StartISO: null });
  assert.equal(win, null);
});

test("presetWindow: unbekanntes Preset liefert null", () => {
  assert.equal(presetWindow("nope", P_BOUNDS), null);
});
