/* Tests: Power-Curve-Parsing (core/powercurve.js) — beide intervals.icu-Formate */

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPowerCurve, nearestWatts, buildCurveData } from "../assets/js/core/powercurve.js";

test("extractPowerCurve: list-Format (erstes Element = beste Kurve)", () => {
  const pc = { list: [{ secs: [1, 60], watts: [800, 300] }, { secs: [1], watts: [100] }] };
  assert.deepEqual(extractPowerCurve(pc), { secs: [1, 60], watts: [800, 300] });
});

test("extractPowerCurve: flaches secs/watts-Format", () => {
  const pc = { secs: [5, 300], watts: [600, 250] };
  assert.deepEqual(extractPowerCurve(pc), { secs: [5, 300], watts: [600, 250] });
});

test("extractPowerCurve: null/unbekanntes Format → leer", () => {
  assert.deepEqual(extractPowerCurve(null), { secs: [], watts: [] });
  assert.deepEqual(extractPowerCurve({ foo: 1 }), { secs: [], watts: [] });
  assert.deepEqual(extractPowerCurve({ list: [] }), { secs: [], watts: [] });
});

test("nearestWatts findet den nächstliegenden Sekunden-Key", () => {
  const map = { 1: 800, 60: 300, 3600: 180 };
  assert.equal(nearestWatts(map, 55), 300);
  assert.equal(nearestWatts(map, 2), 800);
  assert.equal(nearestWatts(map, 100000), 180);
  assert.equal(nearestWatts({}, 60), null);
});

test("buildCurveData mappt auf Standard-Intervalle und filtert 0/negativ", () => {
  const pc = { secs: [1, 5, 60, 3600], watts: [900, 700, 320, 0] };
  const data = buildCurveData(pc);
  // 3600s hat watts=0 → gefiltert; nearest-Zuordnung liefert für jedes
  // Standard-Intervall den nächstliegenden gültigen Wert
  assert.ok(data.every((d) => d.watts > 0));
  const oneSec = data.find((d) => d.secs === 1);
  assert.equal(oneSec.watts, 900);
  assert.equal(oneSec.label, "1s");
  const oneMin = data.find((d) => d.secs === 60);
  assert.equal(oneMin.watts, 320);
});

test("buildCurveData: keine Daten → leeres Array", () => {
  assert.deepEqual(buildCurveData(null), []);
  assert.deepEqual(buildCurveData({ secs: [], watts: [] }), []);
});
