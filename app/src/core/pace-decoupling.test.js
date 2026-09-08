/* Tests: core/pace-decoupling.js — Pace:HF-Drift (Fahrplan 10 E7).
   Nur synthetisch: rides-N.json trägt für Lauf/Schwimm weder Streams
   noch ein decoupling-Feld. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  paceHrDecoupling,
  paceDecouplingTrend,
  DECOUPLING_MIN_POINTS,
} from "./pace-decoupling.js";

const flat = (n, speed, hr) => Array.from({ length: n }, (_, i) => ({ t: i, speed, hr }));

test("paceHrDecoupling: konstante Einheit → 0 % Drift", () => {
  const r = paceHrDecoupling(flat(8, 3, 150));
  assert.equal(r.decouplingPct, 0);
  assert.equal(r.efFirst, 0.02);
  assert.equal(r.efSecond, 0.02);
  assert.equal(r.nSamples, 8);
});

test("paceHrDecoupling: HF driftet nach oben → positives Decoupling", () => {
  const samples = [...flat(4, 3, 150), ...flat(4, 3, 165)];
  const r = paceHrDecoupling(samples);
  // ef1 = 3/150 = 0,02 · ef2 = 3/165 = 0,018182 · (0,02−0,018182)/0,02 = 9,09 %
  assert.ok(Math.abs(r.decouplingPct - 9.1) < 0.1);
});

test("paceHrDecoupling: < MIN_SAMPLES oder fehlende HF → null", () => {
  assert.equal(paceHrDecoupling(flat(5, 3, 150)), null);
  assert.equal(paceHrDecoupling(null), null);
  // 8 Samples, aber nur 4 mit gültiger HF
  const mixed = [...flat(4, 3, 150), ...flat(4, 3, 0)];
  assert.equal(paceHrDecoupling(mixed), null);
});

test("paceDecouplingTrend: nur vergleichbare Einheiten, Median + stabiler Anteil", () => {
  const comparable = { types: ["Dauerlauf", "Longrun"], minDurationMin: 40 };
  const mk = (date, value, typ = "Dauerlauf", min = 60) => ({
    dateISO: date,
    decoupling: value,
    typ,
    min,
  });
  const acts = [
    mk("2026-06-01", 6.0),
    mk("2026-06-08", 5.0),
    mk("2026-06-15", 4.0),
    mk("2026-06-22", 3.0),
    mk("2026-06-29", 2.0),
    mk("2026-06-30", 9.9, "Intervalle"), // falscher Typ → raus
    mk("2026-07-01", 9.9, "Dauerlauf", 20), // zu kurz → raus
  ];
  const t = paceDecouplingTrend(acts, comparable);
  assert.ok(t);
  assert.equal(t.n, 5);
  assert.equal(t.median, 4);
  assert.equal(t.stableShare, 60); // 3 von 5 unter 5 %
  assert.ok(t.slopePer30d < 0);
  assert.equal(paceDecouplingTrend(acts.slice(0, DECOUPLING_MIN_POINTS - 1), comparable), null);
});

test("paceDecouplingTrend: ohne Vergleichskriterien → null", () => {
  assert.equal(paceDecouplingTrend([], null), null);
});
