/* Tests: core/pace-curve.js — Distanz-Bucket-Bestwerte + Pace-Curve
   (Fahrplan 10 E7). Nur Ganzfahrt-km/min, keine Streams. */

import { test } from "vitest";
import assert from "node:assert/strict";
import {
  bestEffortPerBucket,
  buildPaceCurve,
  STANDARD_RUN_DISTANCES_KM,
} from "./pace-curve.js";

test("bestEffortPerBucket: je Bucket die schnellste passende Fahrt, ein Bucket je Fahrt", () => {
  const rides = [
    { km: 1.0, min: 5 }, // Bucket 1, 300 s/km
    { km: 1.0, min: 4 }, // Bucket 1, 240 s/km → gewinnt
    { km: 10.5, min: 50 }, // größter Bucket ≤ 10,5 = 10, 285,7 s/km
    { km: 5.2, min: 30 }, // Bucket 5, 346,2 s/km
  ];
  const out = bestEffortPerBucket(rides, STANDARD_RUN_DISTANCES_KM);
  assert.deepEqual(
    out.map((e) => e.bucket),
    [1, 5, 10]
  );
  assert.equal(Math.round(out[0].paceSec), 240);
  assert.equal(out[0].distance, 1.0);
  assert.equal(Math.round(out[2].paceSec), 286); // 3000 / 10,5
});

test("bestEffortPerBucket: Fahrt unter dem kleinsten Bucket fällt raus", () => {
  const out = bestEffortPerBucket([{ km: 0.6, min: 4 }], STANDARD_RUN_DISTANCES_KM);
  assert.equal(out.length, 0);
});

test("bestEffortPerBucket: km/min ≤ 0 oder fehlend wird ignoriert", () => {
  const out = bestEffortPerBucket(
    [{ km: 0, min: 20 }, { km: 5, min: 0 }, { km: 5 }, { min: 20 }, { km: 5, min: 25 }],
    STANDARD_RUN_DISTANCES_KM
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].bucket, 5);
});

test("buildPaceCurve: Anzeige-Punkte mit gerundeter Pace + Label, HM-Sonderfall", () => {
  const curve = buildPaceCurve(
    [
      { km: 1.0, min: 4 },
      { km: 10.2, min: 51 },
      { km: 21.5, min: 120 },
    ],
    STANDARD_RUN_DISTANCES_KM
  );
  assert.deepEqual(
    curve.map((p) => p.label),
    ["1 km", "10 km", "HM"]
  );
  assert.equal(curve[0].paceSec, 240);
  assert.equal(curve[1].actualDistance, 10.2);
});

test("buildPaceCurve: leere Eingabe → leere Curve", () => {
  assert.deepEqual(buildPaceCurve([], STANDARD_RUN_DISTANCES_KM), []);
  assert.deepEqual(buildPaceCurve(null), []);
});
