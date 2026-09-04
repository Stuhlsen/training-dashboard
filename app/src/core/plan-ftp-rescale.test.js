/* Tests: core/plan-ftp-rescale.js — Watt-Bänder künftiger Karten nach einem
   FTP-Test neu rechnen. Reine Patch-Berechnung; pct + Struktur bleiben. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { planFtpRescale, rescaledWorkout } from "./plan-ftp-rescale.js";

const TODAY = "2026-09-04";

/** Sweet-Spot-Workout, gebaut mit alter FTP 250 → watts = [88%,92%] × 250. */
const ssWorkout = () => ({
  warmup: 15,
  intervals: 3,
  duration: 12,
  rest: 5,
  cooldown: 10,
  zone: "Sweet Spot",
  pct: [88, 92],
  watts: [220, 230],
  label: "Sweet Spot 3×12",
});

const CARDS = [
  { id: "past", date: "2026-09-01", workout: ssWorkout() }, // vor heute
  { id: "today", date: "2026-09-04", workout: ssWorkout() }, // heute zählt
  { id: "fut1", date: "2026-09-11", workout: ssWorkout() },
  { id: "z2", date: "2026-09-12", workout: { pct: [60, 70], watts: [150, 175], zone: "Z2" } },
  { id: "cx", date: "2026-09-13", cancelled: true, workout: ssWorkout() },
  { id: "test", date: "2026-09-18", workout: null }, // FTP-Testtag: kein Workout
];

test("nur Karten ab heute, nicht ausgefallene, mit pct-Band", () => {
  const { patches, affectedCount } = planFtpRescale({ cards: CARDS, newFtp: 265, todayISO: TODAY });
  assert.deepEqual(
    patches.map((p) => p.id).sort(),
    ["fut1", "today", "z2"],
  );
  assert.equal(affectedCount, 3);
});

test("watts = round(pct/100 × neueFTP), pct + übrige Felder unverändert", () => {
  const { patches } = planFtpRescale({ cards: CARDS, newFtp: 265, todayISO: TODAY });
  const ss = patches.find((p) => p.id === "fut1");
  assert.deepEqual(ss.workout.watts, [233, 244]); // 0.88×265=233.2, 0.92×265=243.8
  assert.deepEqual(ss.workout.pct, [88, 92]);
  assert.equal(ss.workout.label, "Sweet Spot 3×12");
  assert.equal(ss.workout.warmup, 15);
  const z2 = patches.find((p) => p.id === "z2");
  assert.deepEqual(z2.workout.watts, [159, 186]); // 0.60×265=159, 0.70×265=185.5
});

test("identische FTP → keine Patches (No-Op)", () => {
  const { patches } = planFtpRescale({ cards: CARDS, newFtp: 250, todayISO: TODAY });
  assert.deepEqual(patches, []);
});

test("Karte ohne workout / ohne pct bleibt unangetastet", () => {
  const cards = [
    { id: "a", date: "2026-09-20", workout: null },
    { id: "b", date: "2026-09-21", workout: { zone: "Z2" } },
    { id: "c", date: "2026-09-22", workout: { pct: ["x", 92] } },
  ];
  assert.deepEqual(planFtpRescale({ cards, newFtp: 265, todayISO: TODAY }).patches, []);
});

test("ungültige neue FTP → keine Patches", () => {
  for (const bad of [0, -5, NaN, Infinity, null, undefined]) {
    assert.deepEqual(
      planFtpRescale({ cards: CARDS, newFtp: /** @type {number} */ (bad), todayISO: TODAY }).patches,
      [],
    );
  }
});

test("deterministisch: gleicher Input → gleicher Output", () => {
  const a = planFtpRescale({ cards: CARDS, newFtp: 265, todayISO: TODAY });
  const b = planFtpRescale({ cards: CARDS, newFtp: 265, todayISO: TODAY });
  assert.deepEqual(a, b);
});

test("rescaledWorkout: fügt watts hinzu, wenn vorher keins da war", () => {
  const out = rescaledWorkout({ pct: [98, 102], zone: "Schwelle" }, 265);
  assert.deepEqual(out.watts, [260, 270]);
  assert.deepEqual(out.pct, [98, 102]);
});

test("rescaledWorkout: null bei fehlendem pct-Band oder gleichem Ergebnis", () => {
  assert.equal(rescaledWorkout({ zone: "Z2" }, 265), null);
  assert.equal(rescaledWorkout(ssWorkout(), 250), null);
  assert.equal(rescaledWorkout(null, 265), null);
});
