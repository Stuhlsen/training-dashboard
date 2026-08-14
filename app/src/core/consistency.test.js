/* Tests: core/consistency.js::weeklyConsistency — Port von
   tests/features.test.js (Vanilla), identischer Fall. Bisher nur indirekt
   über ConsistencyCalendar.test.tsx auf Komponentenebene abgedeckt, nicht
   als Unit-Test der reinen Funktion. */

import { test } from "vitest";
import assert from "node:assert/strict";
import { weeklyConsistency } from "./consistency.js";

test("weeklyConsistency: Wochen-Buckets, Lücken, Serien und Ø Tage/Woche", () => {
  const rides = [
    { dateISO: "2026-06-01", km: 30 }, // Mo – Woche 1
    { dateISO: "2026-06-03", km: 40 }, // Mi – Woche 1
    { dateISO: "2026-06-08", km: 50 }, // Mo – Woche 2
    // Woche 3 (ab 2026-06-15) bleibt leer → Lücke
    { dateISO: "2026-06-22", km: 60 }, // Mo – Woche 4
  ];
  const wc = weeklyConsistency(rides, "2026-06-24");
  assert.ok(wc);
  assert.equal(wc.totalWeeks, 4);
  assert.equal(wc.weeks[0].days, 2); // Mo + Mi
  assert.equal(wc.weeks[1].days, 1);
  assert.equal(wc.weeks[2].days, 0); // Lücke bleibt sichtbar
  assert.equal(wc.weeks[3].days, 1);
  assert.equal(wc.activeWeeks, 3);
  assert.equal(wc.activeDays, 4);
  assert.equal(wc.streakLongest, 2); // Woche 1 + 2
  assert.equal(wc.streakCurrent, 1); // aktuelle Woche aktiv, davor Lücke
  assert.equal(wc.avgDays, 1); // 4 Tage / 4 Wochen
  assert.equal(weeklyConsistency([], "2026-06-24"), null);
});
