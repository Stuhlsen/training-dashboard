/* Tests: core/plan-shift.js — Ganzen Plan um N Wochen verschieben.
   Reine Patch-Berechnung; die Wochen-/Phasen-Neuvergabe kommt aus dem
   (offset-fähigen) core/plan-week-model.js. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { planShiftPatches } from "./plan-shift.js";

const TODAY = "2026-09-03"; // Do, KW36 (Athlet-4-Vorlage läuft ab 2026-08-31)

/** Athlet-4-Karten rund um „heute": zwei künftige, eine vergangene, eine
 *  ausgefallene künftige. */
const CARDS = [
  { id: "past", date: "2026-09-01", name: "Lockere Einheit" }, // Di, vor heute
  { id: "sat36", date: "2026-09-06", name: "Lange ruhige Ausfahrt" }, // Sa KW36
  { id: "sun36", date: "2026-09-07", name: "Längere lockere Ausfahrt" }, // So KW36
  { id: "cx", date: "2026-09-13", name: "abgesagt", cancelled: true },
];

test("Delta 0 → keine Patches", () => {
  const r = planShiftPatches(CARDS, 0, TODAY, "athlete4", 0);
  assert.deepEqual(r, { ok: true, patches: [] });
});

test("+1 Woche später: nur künftige, nicht ausgefallene Karten, je +7 Tage", () => {
  const r = planShiftPatches(CARDS, 1, TODAY, "athlete4", 1);
  assert.equal(r.ok, true);
  const ids = r.patches.map((p) => p.id).sort();
  assert.deepEqual(ids, ["sat36", "sun36"]); // 'past' + 'cx' übersprungen
  const byId = Object.fromEntries(r.patches.map((p) => [p.id, p]));
  assert.equal(byId.sat36.plannedDate, "2026-09-13");
  assert.equal(byId.sun36.plannedDate, "2026-09-14");
  // week/phase je Zielzeile aus dem offset-fähigen Modell — Phase der
  // Vorlagenwoche bleibt erhalten (Woche 1 = „Einstieg", nur 7 Tage später).
  assert.equal(byId.sat36.phase, "Einstieg");
});

test("−1 Woche früher: Karte würde vor heute landen → ok:false + Grund", () => {
  const r = planShiftPatches(CARDS, -1, TODAY, "athlete4", 0);
  assert.equal(r.ok, false);
  assert.match(r.reason, /vor heute/);
});

test("−1 Woche früher, aber alle Zielzeilen ab heute → ok", () => {
  const laterCards = [
    { id: "a", date: "2026-09-20", name: "A" },
    { id: "b", date: "2026-09-27", name: "B" },
  ];
  const r = planShiftPatches(laterCards, -1, TODAY, "athlete4", 0);
  assert.equal(r.ok, true);
  assert.equal(r.patches.length, 2);
  assert.equal(r.patches[0].plannedDate, "2026-09-13");
});

test("einzeln verschobene Karte: originalDate wandert mit (movedFromDate im Patch)", () => {
  const cards = [{ id: "moved", date: "2026-09-20", name: "M", originalDate: "2026-09-13" }];
  const r = planShiftPatches(cards, 1, TODAY, "athlete4", 1);
  assert.equal(r.ok, true);
  assert.equal(r.patches[0].plannedDate, "2026-09-27");
  assert.equal(r.patches[0].movedFromDate, "2026-09-20"); // 2026-09-13 + 7
});

test("leerer/fehlender Kartenstand → keine Patches, kein Wurf", () => {
  assert.deepEqual(planShiftPatches([], 2, TODAY, "athlete4", 2), { ok: true, patches: [] });
  assert.deepEqual(planShiftPatches(undefined, 2, TODAY, "athlete4", 2), { ok: true, patches: [] });
});

test("Fahrplan 8 E7: week/phase der Ziel-Patches kommen aus dem übergebenen weekModel", () => {
  const cards = [{ id: "s", date: "2026-09-06", name: "Lange Ausfahrt" }];
  const weekModel = [
    { week: "P-KW02", phase: "Grundlage", start: "2026-09-07", end: "2026-09-13", trainingWeekdays: [2, 4, 6], targetTss: 300 },
  ];
  // +1 Woche → Zieldatum 2026-09-13 (2026-09-06 + 7) liegt in P-KW02 des Modells.
  const r = planShiftPatches(cards, 1, TODAY, "athlete4", 1, weekModel);
  assert.equal(r.ok, true);
  assert.equal(r.patches[0].plannedDate, "2026-09-13");
  assert.equal(r.patches[0].week, "P-KW02");
  assert.equal(r.patches[0].phase, "Grundlage"); // aus weekModel, nicht "Einstieg" der Code-Vorlage
});
