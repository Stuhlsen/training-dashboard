/* Tests: core/records.js::recordProgression — Port von tests/features.test.js
   (Vanilla), identische Fälle. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { recordProgression } from "./records.js";

test("recordProgression: Ablöse-Historie chronologisch, NP nur ≥20min", () => {
  const rides = [
    { dateISO: "2026-04-01", km: 50, min: 130, np: 180, kmh: 24, name: "A" },
    { dateISO: "2026-05-01", km: 100, min: 260, np: 210, kmh: 26, name: "B" },
    { dateISO: "2026-05-15", km: 60, min: 15, np: 260, kmh: 30, name: "Sprint (zu kurz)" },
    { dateISO: "2026-06-01", km: 138, min: 320, np: 200, kmh: 27, name: "C" },
  ];
  const recs = recordProgression(rides);
  const km = recs.find((r) => r.key === "km");
  assert.equal(km.value, 138);
  assert.deepEqual(
    km.history.map((h) => h.value),
    [50, 100],
  );
  const np = recs.find((r) => r.key === "np20");
  assert.equal(np.value, 210); // 260 zählt nicht (15 min)
  const week = recs.find((r) => r.key === "weekKm");
  assert.ok(week.value > 0);
});
