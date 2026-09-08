/* Tests: core/trimp.js — Banister-TRIMP (Primärpfad, HF) und der RPE-Ersatz
   (Schwimmen ohne HF, Vertrag V3 / OF-3). Reine Funktionen, keine Mocks. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { banisterTrimp, rpeTrimp, BANISTER_A, BANISTER_B, RPE_FACTORS } from "./trimp.js";

/* ── banisterTrimp: bekannte Handrechnung ─────────────────────── */

test("banisterTrimp: 60 min, HFavg 140, HFrest 50, HFmax 190 → 85 (Handrechnung)", () => {
  const p = { durationMin: 60, hrAvg: 140, hrRest: 50, hrMax: 190 };
  // HRr = 90/140 = 0,642857 ; TRIMP = 60 · HRr · 0,64 · e^(1,92·HRr) ≈ 84,82
  assert.equal(banisterTrimp(p), 85);
});

test("banisterTrimp: Ergebnis entspricht der Formel mit den exportierten Konstanten", () => {
  const p = { durationMin: 48, hrAvg: 155, hrRest: 48, hrMax: 188 };
  const hrr = (p.hrAvg - p.hrRest) / (p.hrMax - p.hrRest);
  const expected = Math.round(p.durationMin * hrr * BANISTER_A * Math.exp(BANISTER_B * hrr));
  assert.equal(banisterTrimp(p), expected);
});

test("banisterTrimp: höhere HFavg → höhere Last (Monotonie)", () => {
  const base = { durationMin: 45, hrRest: 50, hrMax: 190 };
  assert.ok(
    banisterTrimp({ ...base, hrAvg: 160 }) > banisterTrimp({ ...base, hrAvg: 120 })
  );
});

/* ── banisterTrimp: null bei fehlendem/unplausiblem Eingang ───── */

test("banisterTrimp: null, wenn ein Wert fehlt oder nicht-endlich ist", () => {
  assert.equal(banisterTrimp(), null);
  assert.equal(banisterTrimp({ durationMin: 60, hrAvg: 140, hrRest: 50 }), null); // hrMax fehlt
  assert.equal(banisterTrimp({ durationMin: 60, hrAvg: null, hrRest: 50, hrMax: 190 }), null);
  assert.equal(banisterTrimp({ durationMin: NaN, hrAvg: 140, hrRest: 50, hrMax: 190 }), null);
});

test("banisterTrimp: null bei Dauer ≤ 0, HFmax ≤ HFrest und HRr außerhalb (0,1)", () => {
  assert.equal(banisterTrimp({ durationMin: 0, hrAvg: 140, hrRest: 50, hrMax: 190 }), null);
  assert.equal(banisterTrimp({ durationMin: 60, hrAvg: 140, hrRest: 190, hrMax: 190 }), null);
  assert.equal(banisterTrimp({ durationMin: 60, hrAvg: 195, hrRest: 50, hrMax: 190 }), null); // HRr ≥ 1
  assert.equal(banisterTrimp({ durationMin: 60, hrAvg: 40, hrRest: 50, hrMax: 190 }), null); // HRr ≤ 0
});

/* ── rpeTrimp: Ersatzpfad Schwimmen ──────────────────────────── */

test("RPE_FACTORS: locker/moderat/hart = 0,6 / 1,0 / 1,5 (UNKALIBRIERT)", () => {
  assert.deepEqual({ ...RPE_FACTORS }, { locker: 0.6, moderat: 1.0, hart: 1.5 });
});

test("rpeTrimp: Dauer × Faktor je Klasse (synthetische HF-lose Aktivität, 40 min)", () => {
  assert.equal(rpeTrimp(40, "locker"), 24);
  assert.equal(rpeTrimp(40, "moderat"), 40);
  assert.equal(rpeTrimp(40, "hart"), 60);
});

test("rpeTrimp: unbekannte/fehlende Klasse → 'moderat'", () => {
  assert.equal(rpeTrimp(40), 40);
  assert.equal(rpeTrimp(40, "gibt-es-nicht"), 40);
});

test("rpeTrimp: null bei ungültiger Dauer", () => {
  assert.equal(rpeTrimp(0, "moderat"), null);
  assert.equal(rpeTrimp(-5, "moderat"), null);
  assert.equal(rpeTrimp(NaN, "moderat"), null);
});
