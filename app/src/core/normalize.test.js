/* Tests: core/normalize.js — Port von tests/normalize.test.js (Vanilla),
   identische Fälle (nur der normalize.js-Teil — die format.js-Fälle aus
   derselben Vanilla-Datei sind hier nicht Gegenstand, s.
   docs/v0-funktionsabgleich-bericht.md §4). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { normalizeFeel, normalizeRide, normalizeWellness } from "./normalize.js";

test("normalizeFeel: Kurzformen werden auf Labels + CSS-Klassen gemappt", () => {
  assert.deepEqual(normalizeFeel("Ischwer"), { label: "Irgendwie schwer", cls: "ischwer" });
  assert.deepEqual(normalizeFeel("Hart"), { label: "Hart", cls: "hart" });
  assert.deepEqual(normalizeFeel(null), { label: "–", cls: "" });
  assert.deepEqual(normalizeFeel("Unbekannt"), { label: "Unbekannt", cls: "" });
});

test("normalizeRide: dateISO/dateShort/efficiency werden ergänzt", () => {
  const r = normalizeRide({ date: "2026-06-12", watt: 190, hf: 160, feel: "Sleicht" });
  assert.equal(r.dateISO, "2026-06-12");
  assert.equal(r.dateShort, "12.06");
  assert.equal(r.efficiency, 1.19); // 190/160 auf 2 Nachkommastellen
  assert.equal(r.feel, "Sehr leicht");
  assert.equal(r.feelCls, "sleicht");
});

test("normalizeRide: keine Effizienz ohne Watt oder HF", () => {
  assert.equal(normalizeRide({ date: "2026-06-12", watt: 190 }).efficiency, null);
  assert.equal(normalizeRide({ date: "2026-06-12", hf: 150 }).efficiency, null);
});

test("normalizeWellness ergänzt Anzeige-Datum", () => {
  const w = normalizeWellness({ date: "2026-07-01", sleepHours: 7.5 });
  assert.equal(w.dateISO, "2026-07-01");
  assert.equal(w.dateShort, "01.07");
});
