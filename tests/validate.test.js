/* Tests: Laufzeit-Schema-Validierung (core/validate.js) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkObject, validateRidesPayload, RIDE_SCHEMA } from "../assets/js/core/validate.js";

const validRide = { date: "2026-07-01", name: "Z2 Lang", km: 85.2, hf: 140, weather: { temp: 20 } };

test("checkObject: gültiges Objekt liefert keine Probleme", () => {
  assert.deepEqual(checkObject(validRide, RIDE_SCHEMA, "ride"), []);
});

test("checkObject meldet falsche Typen mit Feldpfad", () => {
  const problems = checkObject({ date: "2026-07-01", km: "85" }, RIDE_SCHEMA, "ride");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ride\.km/);
  assert.match(problems[0], /number\?/);
});

test("checkObject: Pflichtfeld null → Problem, optionales null → ok", () => {
  const problems = checkObject({ date: null, km: null }, RIDE_SCHEMA, "ride");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ride\.date/);
});

test("validateRidesPayload: intaktes Payload → keine Probleme", () => {
  const payload = {
    rides: [validRide],
    wellness: [{ date: "2026-07-01", sleepHours: 7.2 }],
    updated: "2026-07-01T06:00:00Z",
  };
  assert.deepEqual(validateRidesPayload(payload), []);
});

test("validateRidesPayload: fehlende oder leere rides sind fatal", () => {
  assert.ok(validateRidesPayload({}).some((p) => p.startsWith("payload.rides")));
  assert.ok(validateRidesPayload({ rides: [] }).some((p) => p.startsWith("payload.rides")));
  assert.ok(validateRidesPayload(null).length > 0);
});

test("validateRidesPayload prüft Stichprobe der ersten Einträge", () => {
  const payload = { rides: [{ date: 123 }, validRide] };
  const problems = validateRidesPayload(payload);
  assert.ok(problems.some((p) => p.startsWith("rides[0].date")));
});
