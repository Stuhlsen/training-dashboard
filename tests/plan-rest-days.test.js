import test from "node:test";
import assert from "node:assert/strict";
import { fillRestDays } from "../assets/js/core/plan-rest-days.js";

const phaseOf = (date) => (date <= "2026-07-08" ? { week: "2026-KW28", phase: "Sweet Spot" } : { week: "2026-KW29", phase: "Sweet Spot" });

test("fillRestDays ergänzt jeden fehlenden Tag im Bereich als Ruhetag-Karte", () => {
  const sessions = { "2026-07-06": { name: "Z2 Locker", typ: "Z2 Dauer" } };
  const filled = fillRestDays(sessions, "2026-07-06", "2026-07-08", phaseOf);
  assert.deepEqual(Object.keys(filled).sort(), ["2026-07-07", "2026-07-08"]);
  assert.equal(filled["2026-07-07"].typ, "Ruhetag");
  assert.equal(filled["2026-07-07"].km, 0);
  assert.equal(filled["2026-07-07"].week, "2026-KW28");
  assert.equal(filled["2026-07-07"].phase, "Sweet Spot");
});

test("fillRestDays lässt bereits definierte Tage unangetastet (liefert sie nicht erneut)", () => {
  const sessions = {
    "2026-07-06": { name: "Z2 Locker", typ: "Z2 Dauer" },
    "2026-07-07": { name: "Gruppenfahrt", typ: "Gruppenfahrt" },
  };
  const filled = fillRestDays(sessions, "2026-07-06", "2026-07-07", phaseOf);
  assert.deepEqual(filled, {});
});

test("fillRestDays deckt den kompletten Bereich ab, auch über eine Wochengrenze hinweg", () => {
  const filled = fillRestDays({}, "2026-07-06", "2026-07-09", phaseOf);
  assert.deepEqual(Object.keys(filled).sort(), [
    "2026-07-06",
    "2026-07-07",
    "2026-07-08",
    "2026-07-09",
  ]);
  assert.equal(filled["2026-07-08"].phase, "Sweet Spot");
  assert.equal(filled["2026-07-09"].week, "2026-KW29");
});

test("fillRestDays: einzelner Tag (fromISO === toISO)", () => {
  const filled = fillRestDays({}, "2026-07-06", "2026-07-06", phaseOf);
  assert.deepEqual(Object.keys(filled), ["2026-07-06"]);
});

test("fillRestDays mutiert das übergebene sessions-Objekt nicht", () => {
  const sessions = { "2026-07-06": { name: "Z2 Locker", typ: "Z2 Dauer" } };
  const before = JSON.stringify(sessions);
  fillRestDays(sessions, "2026-07-06", "2026-07-08", phaseOf);
  assert.equal(JSON.stringify(sessions), before);
});
