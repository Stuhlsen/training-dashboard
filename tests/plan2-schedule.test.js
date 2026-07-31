/* Tests: Datum→Woche/Phase-Lookup für Plan 2 (core/plan2-schedule.js)
   Geteilt zwischen scripts/lib/plan2.js (Ride-Tagging beim Sync) und
   ui/charts/wellness.js (HRV/Ruhepuls-Segmentierung direkt aus
   Data.wellness, unabhängig von Ride-Objekten — Bugfix-Nachtrag zu
   Phase 5 Schritt 7). Muss für JEDES Datum ein Ergebnis liefern, auch für
   Tage ohne Ride (Ruhetage). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAN2_SCHEDULE, getPlan2WeekPhase } from "../assets/js/core/plan2-schedule.js";

test("getPlan2WeekPhase: exakter Start-Tag einer Woche", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-06-29"), { week: "2026-KW27", phase: "Sweet Spot" });
});

test("getPlan2WeekPhase: exakter End-Tag einer Woche", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-07-05"), { week: "2026-KW27", phase: "Sweet Spot" });
});

test("getPlan2WeekPhase: Tag mitten in der Woche, kein Ride nötig", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-07-02"), { week: "2026-KW27", phase: "Sweet Spot" });
});

test("getPlan2WeekPhase: Übergangswoche (W0) speziell erkannt", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-06-24"), { week: "2026-KW26", phase: "Übergang" });
});

test("getPlan2WeekPhase: Wochenübergang lückenlos (Ende W1 / Anfang W2 direkt aufeinanderfolgend)", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-07-05"), { week: "2026-KW27", phase: "Sweet Spot" });
  assert.deepEqual(getPlan2WeekPhase("2026-07-06"), { week: "2026-KW28", phase: "Sweet Spot" });
});

test("getPlan2WeekPhase: Tag vor Schedule-Beginn (Plan-1-Ära) → null/null", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-06-21"), { week: null, phase: null });
  assert.deepEqual(getPlan2WeekPhase("2026-01-01"), { week: null, phase: null });
});

test("getPlan2WeekPhase: Tag nach Schedule-Ende (Saison noch nicht aktualisiert) → null/null", () => {
  assert.deepEqual(getPlan2WeekPhase("2026-09-21"), { week: null, phase: null });
});

test("PLAN2_SCHEDULE: lückenlose, chronologische Kette ohne Überlappung", () => {
  for (let i = 1; i < PLAN2_SCHEDULE.length; i++) {
    const prevEnd = new Date(PLAN2_SCHEDULE[i - 1].end + "T00:00:00");
    const curStart = new Date(PLAN2_SCHEDULE[i].start + "T00:00:00");
    const dayAfterPrevEnd = new Date(prevEnd);
    dayAfterPrevEnd.setDate(dayAfterPrevEnd.getDate() + 1);
    assert.equal(
      curStart.getTime(),
      dayAfterPrevEnd.getTime(),
      `Lücke/Überlappung zwischen ${PLAN2_SCHEDULE[i - 1].week} und ${PLAN2_SCHEDULE[i].week}`
    );
  }
});
