/* Tests: core/cadence.js::cadenceCoach — Port von tests/features.test.js
   (Vanilla), identische Fälle. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { cadenceCoach } from "./cadence.js";

test("cadenceCoach: Entwicklung, Zielquote, Typ-Aufschlüsselung", () => {
  const rides = [];
  for (let i = 0; i < 20; i++) {
    rides.push({
      dateISO: `2026-05-${String(i + 1).padStart(2, "0")}`,
      kad: i < 10 ? 80 : 92,
      typ: i % 2 ? "Z2 Lang" : "Sweet Spot",
    });
  }
  const c = cadenceCoach(rides, 90);
  assert.equal(c.startAvg, 80);
  assert.equal(c.recentAvg, 92);
  assert.equal(c.delta, 12);
  assert.equal(c.shareAbove, 50);
  assert.equal(c.perType.length, 2);
});

test("cadenceCoach: zu wenig Daten → null", () => {
  assert.equal(cadenceCoach([{ dateISO: "2026-05-01", kad: 80 }], 90), null);
});
