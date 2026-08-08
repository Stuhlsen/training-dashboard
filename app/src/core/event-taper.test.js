/* Tests: core/event-taper.js::isInEventTaper() (Auftrag "Taper-Erkennung
   für 'Auf Event hin'"). Gating-Fälle spiegeln die K-EVENT-Tests in
   tests/conflicts.test.js (nur type:"race" + gesetzte priority zählen). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { isInEventTaper } from "./event-taper.js";
import { CONFLICT_THRESHOLDS } from "./plan-config.js";

const raceMain = { eventDate: "2026-08-09", type: "race", priority: "main" };

test("isInEventTaper: kein Event -> false", () => {
  assert.equal(isInEventTaper(null, "2026-08-02"), false);
  assert.equal(isInEventTaper(undefined, "2026-08-02"), false);
});

test("isInEventTaper: Event ohne priority -> false", () => {
  const ev = { eventDate: "2026-08-09", type: "race", priority: null };
  assert.equal(isInEventTaper(ev, "2026-08-02"), false);
});

test("isInEventTaper: type 'other' zählt nicht, auch mit priority -> false", () => {
  const ev = { eventDate: "2026-08-09", type: "other", priority: "main" };
  assert.equal(isInEventTaper(ev, "2026-08-02"), false);
});

test("isInEventTaper: innerhalb des Taper-Fensters -> true", () => {
  // eventDate - 5 Tage, Default-Fenster 7 Tage
  assert.equal(isInEventTaper(raceMain, "2026-08-04"), true);
});

test("isInEventTaper: Grenzfall genau am Fensterrand (taperDays Tage vorher) -> true", () => {
  assert.equal(isInEventTaper(raceMain, "2026-08-02", 7), true); // 2026-08-09 - 7 Tage
});

test("isInEventTaper: Grenzfall am Eventtag selbst (0 Tage) -> true", () => {
  assert.equal(isInEventTaper(raceMain, "2026-08-09"), true);
});

test("isInEventTaper: einen Tag außerhalb des Fensters -> false", () => {
  assert.equal(isInEventTaper(raceMain, "2026-08-01", 7), false); // 2026-08-09 - 8 Tage
});

test("isInEventTaper: Event bereits in der Vergangenheit -> false", () => {
  assert.equal(isInEventTaper(raceMain, "2026-08-10"), false);
});

test("isInEventTaper: nutzt CONFLICT_THRESHOLDS.eventTaperDays als Default", () => {
  const justInside = { eventDate: "2026-08-09", type: "race", priority: "secondary" };
  const today = "2026-08-09"; // 0 Tage, immer drin
  assert.equal(isInEventTaper(justInside, today), true);
  assert.equal(typeof CONFLICT_THRESHOLDS.eventTaperDays, "number");
});
