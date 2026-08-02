/* Tests: scripts/lib/compliance.js::attachCompliance() — Rückfall auf
   core/workout-structure-derive.js, wenn eine Karte keine echte
   workout_structure trägt (Auftrag "Rückwirkende Strukturableitung").
   Segmente/FTP nach demselben Muster wie tests/compliance-match.test.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { attachCompliance } from "../scripts/lib/compliance.js";

const FTP = 200;
const FTP_HISTORY = [{ ftpWatt: FTP, validFrom: "2026-01-01" }];

/** Drei saubere 600s-Arbeitsblöcke (Sweet Spot 3×10min-Muster), Fade gering. */
function threeCleanBlocks() {
  return [
    { start_time: 0, end_time: 600, average_watts: 185 },
    { start_time: 600, end_time: 900, average_watts: 100 },
    { start_time: 900, end_time: 1500, average_watts: 183 },
    { start_time: 1500, end_time: 1800, average_watts: 100 },
    { start_time: 1800, end_time: 2400, average_watts: 181 },
  ];
}

function baseRide(overrides = {}) {
  return { date: "2026-07-02", typ: "Sweet Spot", tss: 70, min: 90, ...overrides };
}

test("attachCompliance: echte workout_structure gewinnt immer vor Ableitung, kein derived-Flag", () => {
  const rides = [baseRide()];
  const activities = [{ id: "act-1" }];
  const realStructure = {
    version: 1,
    steps: [
      { kind: "set", reps: 3, work: { duration_s: 600, target_pct_ftp: 90 }, recovery: { duration_s: 300, target_pct_ftp: 50 } },
    ],
  };
  const cards = [{ id: "card-1", date: "2026-07-02", name: "Sweet Spot 3×10 min", typ: "Sweet Spot", workoutStructure: realStructure, status: "geplant" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 1);
  assert.equal(rides[0].compliance.matchedCardId, "card-1");
  assert.equal(rides[0].compliance.derived, undefined);
});

test("attachCompliance: Karte ohne echte Struktur wird aus dem Titel abgeleitet, derived:true", () => {
  const rides = [baseRide()];
  const activities = [{ id: "act-1" }];
  const cards = [{ id: "card-1", date: "2026-07-02", name: "Sweet Spot 3×10 min", typ: "Sweet Spot", workoutStructure: null, status: "geplant" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 1);
  assert.equal(rides[0].compliance.matchedCardId, "card-1");
  assert.equal(rides[0].compliance.derived, true);
  assert.equal(rides[0].compliance.intervalsCompleted, 3);
});

test("attachCompliance: ausgefallene Karte löst niemals eine Ableitung aus", () => {
  const rides = [baseRide()];
  const activities = [{ id: "act-1" }];
  const cards = [{ id: "card-1", date: "2026-07-02", name: "Sweet Spot 3×10 min", typ: "Sweet Spot", workoutStructure: null, status: "ausgefallen" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 0);
  assert.equal(rides[0].compliance, undefined);
});

test("attachCompliance: rest-Karte löst niemals eine Ableitung aus (D6.1)", () => {
  const rides = [baseRide({ typ: "Ruhetag" })];
  const activities = [{ id: "act-1" }];
  const cards = [{ id: "card-1", date: "2026-07-02", name: "Sweet Spot 3×10 min", typ: "rest", workoutStructure: null, status: "geplant" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 0);
  assert.equal(rides[0].compliance, undefined);
});

test("attachCompliance: Karte mit (leerer/ungültiger) echter workoutStructure wird nicht überschrieben, keine Ableitung", () => {
  const rides = [baseRide()];
  const activities = [{ id: "act-1" }];
  // steps: [] ist strukturell vorhanden, aber shouldEvaluateCard() lehnt sie ab —
  // resolveEvaluableCard() darf trotzdem nicht auf den Titel ausweichen, weil
  // card.workoutStructure bereits (wenn auch leer) gesetzt ist.
  const cards = [{ id: "card-1", date: "2026-07-02", name: "Sweet Spot 3×10 min", typ: "Sweet Spot", workoutStructure: { version: 1, steps: [] }, status: "geplant" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 0);
  assert.equal(rides[0].compliance, undefined);
});

test("attachCompliance: Titel nicht ableitbar ('MyWhoosh Crit') → keine Compliance", () => {
  const rides = [baseRide({ typ: "VO2max" })];
  const activities = [{ id: "act-1" }];
  const cards = [{ id: "card-1", date: "2026-07-02", name: "MyWhoosh Crit", typ: "VO2max", workoutStructure: null, status: "geplant" }];
  const cache = { "act-1": { segments: threeCleanBlocks() } };

  const counts = attachCompliance(rides, activities, cards, cache, FTP_HISTORY, FTP);

  assert.equal(counts.evaluated, 0);
  assert.equal(rides[0].compliance, undefined);
});
