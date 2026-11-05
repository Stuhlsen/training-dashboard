/* Tests: core/group-ride-duration.js — Dauer-Schätzung für Gruppenfahrten,
   getrennt nach drinnen (Zwift & Co.) und draußen. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  GROUP_RIDE_INDOOR_FALLBACK_MIN,
  estimateGroupRideMin,
  groupRideEstimates,
} from "./group-ride-duration.js";

const ride = (dateISO, name, min, typPlanned = null) => ({ dateISO, name, min, typPlanned, sport: "ride" });

const outdoor = [
  ride("2026-08-04", "Gruppenfahrt", 150, "Gruppenfahrt"),
  ride("2026-08-11", "Gruppenfahrt", 70, "Gruppenfahrt"),
  ride("2026-09-08", "Gruppenfahrt", 160, "Gruppenfahrt"),
];
const indoor = [
  ride("2026-11-02", "Zwift - Group Ride: Team Tuesday", 60, "Gruppenfahrt"),
  ride("2026-11-04", "Zwift - Group Workout", 75),
  ride("2026-11-09", "Gruppenfahrt Zwift", 90, "Gruppenfahrt"),
];

test("draußen: Schnitt nur aus Gruppenfahrten ohne Indoor-Bezug, auf 5 min gerundet", () => {
  assert.equal(estimateGroupRideMin([...outdoor, ...indoor], "outdoor"), 125);
});

test("drinnen: Schnitt nur aus Zwift-Gruppenfahrten", () => {
  assert.equal(estimateGroupRideMin([...outdoor, ...indoor], "indoor"), 75);
});

test("weniger als 3 passende Fahrten: keine Schätzung", () => {
  assert.equal(estimateGroupRideMin(outdoor, "indoor"), null);
  assert.equal(estimateGroupRideMin(outdoor.slice(0, 2), "outdoor"), null);
});

test("nur die letzten 6 Fahrten zählen, Reihenfolge der Eingabe ist egal", () => {
  const old = [1, 2, 3, 4, 5, 6].map((i) => ride(`2026-06-0${i}`, "Gruppenfahrt", 60, "Gruppenfahrt"));
  const old2 = ride("2026-05-01", "Gruppenfahrt", 300, "Gruppenfahrt");
  assert.equal(estimateGroupRideMin([old2, ...old.reverse()], "outdoor"), 60);
});

test("andere Sportarten, normale Fahrten und Fahrten ohne Dauer zählen nicht", () => {
  const rides = [
    ...outdoor,
    { ...ride("2026-09-09", "Gruppenlauf", 500), sport: "run" },
    ride("2026-09-10", "Radfahren", 500),
    ride("2026-09-11", "Gruppenfahrt", null, "Gruppenfahrt"),
  ];
  assert.equal(estimateGroupRideMin(rides, "outdoor"), 125);
});

test("leere oder fehlende Liste: keine Schätzung", () => {
  assert.equal(estimateGroupRideMin([], "indoor"), null);
  assert.equal(estimateGroupRideMin(null, "outdoor"), null);
});

test("groupRideEstimates: Zwift fällt ohne Daten auf den Startwert zurück, draußen bleibt leer", () => {
  assert.deepEqual(groupRideEstimates([]), { indoor: GROUP_RIDE_INDOOR_FALLBACK_MIN, outdoor: null });
  assert.equal(GROUP_RIDE_INDOOR_FALLBACK_MIN, 90);
  assert.deepEqual(groupRideEstimates([...outdoor, ...indoor]), { indoor: 75, outdoor: 125 });
});
