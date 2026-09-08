/* Tests: core/pace-zones.js — Pace-Zonen aus geschätzter Schwelle
   (Fahrplan 10 E7). Sport-neutral: mit Lauf- UND Schwimm-Profil geprüft. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  computePaceZones,
  paceScaleMax,
  paceBandShares,
  PACE_FROM_KMH,
  PACE_FROM_MPS_PER_100M,
} from "./pace-zones.js";
import { runningZones } from "../sports/running/zones.js";
import { swimmingZones } from "../sports/swimming/zones.js";

test("computePaceZones(12, runningZones): 5 Zonen, lückenlose Geschwindigkeitskette", () => {
  const z = computePaceZones(12, runningZones);
  assert.equal(z.length, 5);
  assert.deepEqual(
    z.map((x) => x.id),
    ["e", "m", "t", "i", "r"]
  );
  for (let i = 0; i < z.length - 1; i++) {
    assert.equal(z[i].bisSpeed, z[i + 1].vonSpeed);
  }
  assert.equal(z[0].vonSpeed, 0);
  assert.equal(z[4].bisSpeed, 14.4); // 12 × 1,2
});

test("computePaceZones: Zone 1 startet bei Geschwindigkeit 0 → vonPaceSec null", () => {
  const z = computePaceZones(12, runningZones);
  assert.equal(z[0].vonPaceSec, null);
  assert.equal(z[4].bisPaceSec, 250); // 3600 / 14,4
  // schneller ⇒ kleinere Pace
  assert.ok(z[0].bisPaceSec > z[4].bisPaceSec);
});

test("computePaceZones: ungültige Schwelle → leeres Array", () => {
  assert.deepEqual(computePaceZones(0, runningZones), []);
  assert.deepEqual(computePaceZones(12, null), []);
});

test("computePaceZones: sport-neutral — Schwimm-Profil + m/100 m-Umrechner", () => {
  const z = computePaceZones(1.4, swimmingZones, PACE_FROM_MPS_PER_100M);
  assert.equal(z.length, 5);
  assert.equal(z[0].vonPaceSec, null);
  // Geschwindigkeit aufsteigend, Pace absteigend
  for (let i = 0; i < z.length - 1; i++) {
    assert.ok(z[i].bisSpeed < z[i + 1].bisSpeed);
    assert.ok(z[i + 1].bisPaceSec < z[i].bisPaceSec);
  }
  // CSS-Zone (index 2, upperPct 1,0) endet bei 1,4 m/s → 100/1,4 ≈ 71 s/100 m
  assert.equal(z[2].bisPaceSec, 71);
});

test("PACE_FROM_KMH / PACE_FROM_MPS_PER_100M: ≤ 0 → null", () => {
  assert.equal(PACE_FROM_KMH(12), 300);
  assert.equal(PACE_FROM_KMH(0), null);
  assert.equal(PACE_FROM_MPS_PER_100M(2), 50);
  assert.equal(PACE_FROM_MPS_PER_100M(-1), null);
});

test("paceScaleMax: Ende der letzten Zone (Geschwindigkeit)", () => {
  assert.equal(paceScaleMax(12, runningZones), 14.4);
  assert.equal(paceScaleMax(0, runningZones), 0);
});

test("paceBandShares: Ø-Tempo-Bänderung, dauergewichtet, nur die passende Sportart", () => {
  const rides = [
    { sport: "run", kmh: 9, min: 60 }, // frac 0,75 < lowMax 0,88 → low
    { sport: "run", kmh: 12, min: 30 }, // frac 1,00 → mid
    { sport: "run", kmh: 14, min: 20 }, // frac 1,166 > midMax 1,08 → high
    { sport: "ride", kmh: 30, min: 60 }, // andere Sportart → raus (Guardrail 4)
    { sport: "run", km: 10, min: 60 }, // kein kmh → aus km/min: 10 km/h → low
  ];
  const b = paceBandShares(rides, 12, runningZones);
  assert.equal(b.nActivities, 4);
  assert.equal(b.source, "avg-pace");
  assert.equal(b.total, 60 * 60 + 30 * 60 + 20 * 60 + 60 * 60);
  assert.ok(b.shares.low > b.shares.mid && b.shares.mid > b.shares.high);
});

test("paceBandShares: keine passenden Aktivitäten oder ungültige Schwelle → null", () => {
  assert.equal(paceBandShares([{ sport: "ride", kmh: 30, min: 60 }], 12, runningZones), null);
  assert.equal(paceBandShares([{ sport: "run", kmh: 9, min: 60 }], 0, runningZones), null);
});
