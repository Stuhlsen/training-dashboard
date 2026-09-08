/* Tests: core/activity-sport.js — Sportart-Feld + Rad-Filter (Fahrplan 10 E1) */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  activitySport,
  isCyclingActivity,
  onlyCyclingRides,
  ridesForSport,
} from "./activity-sport.js";

test("activitySport: explizite Werte werden durchgereicht", () => {
  assert.equal(activitySport({ sport: "ride" }), "ride");
  assert.equal(activitySport({ sport: "run" }), "run");
  assert.equal(activitySport({ sport: "swim" }), "swim");
  assert.equal(activitySport({ sport: "other" }), "other");
});

test("activitySport: fehlendes/leeres/unbekanntes sport ⇒ 'ride' (non-breaking)", () => {
  assert.equal(activitySport({}), "ride");
  assert.equal(activitySport({ sport: null }), "ride");
  assert.equal(activitySport({ sport: undefined }), "ride");
  assert.equal(activitySport({ sport: "" }), "ride");
  assert.equal(activitySport({ sport: "kayak" }), "ride");
});

test("isCyclingActivity: Rad + Bestand-ohne-Feld true, Lauf/Schwimm false", () => {
  assert.equal(isCyclingActivity({ sport: "ride" }), true);
  assert.equal(isCyclingActivity({}), true); // Regression: Alt-Payload / Bestandsathlet
  assert.equal(isCyclingActivity({ sport: "run" }), false);
  assert.equal(isCyclingActivity({ sport: "swim" }), false);
});

test("onlyCyclingRides: hält Lauf/Schwimm draußen, Reihenfolge + Rad-Zeilen unverändert", () => {
  const rides = [
    { id: 1, sport: "ride" },
    { id: 2 }, // kein sport → zählt als Rad
    { id: 3, sport: "run" },
    { id: 4, sport: "swim" },
    { id: 5, sport: "ride" },
  ];
  assert.deepEqual(
    onlyCyclingRides(rides).map((r) => r.id),
    [1, 2, 5],
  );
});

test("onlyCyclingRides: leere/fehlende Liste → leeres Array", () => {
  assert.deepEqual(onlyCyclingRides([]), []);
  assert.deepEqual(onlyCyclingRides(undefined), []);
});

test("ridesForSport: Sport-Gate (E7) — filtert auf genau eine Sportart", () => {
  const rides = [
    { id: 1, sport: "run" },
    { id: 2, sport: "ride" },
    { id: 3 }, // kein sport → zählt als Rad
    { id: 4, sport: "swim" },
    { id: 5, sport: "run" },
  ];
  assert.deepEqual(
    ridesForSport(rides, "run").map((r) => r.id),
    [1, 5],
  );
  // "ride" schließt die feldlose Alt-Zeile ein — deckungsgleich mit onlyCyclingRides
  assert.deepEqual(
    ridesForSport(rides, "ride").map((r) => r.id),
    onlyCyclingRides(rides).map((r) => r.id),
  );
  assert.deepEqual(ridesForSport(null, "run"), []);
});
