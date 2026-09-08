/* Tests: HFmax-Schätzung nach Tanaka (scripts/lib/hr.js)
   HFmax ≈ 208 − 0,7 × Alter · Alter in ganzen Jahren zum Stichtag. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ageFromBirthdate, tanakaHrMax } from "../scripts/lib/hr.js";

test("ageFromBirthdate: ganze Jahre, Geburtstag als Grenze", () => {
  // Geburtstag heute → volles Jahr
  assert.equal(ageFromBirthdate("1990-09-08", "2026-09-08"), 36);
  // Geburtstag morgen → noch ein Jahr jünger
  assert.equal(ageFromBirthdate("1990-09-09", "2026-09-08"), 35);
  // Geburtstag gestern → schon gehabt
  assert.equal(ageFromBirthdate("1990-09-07", "2026-09-08"), 36);
  // Monatsgrenze
  assert.equal(ageFromBirthdate("1990-10-01", "2026-09-30"), 35);
});

test("ageFromBirthdate: fehlender / ungültiger / zukünftiger Eingang → null", () => {
  assert.equal(ageFromBirthdate(null, "2026-09-08"), null);
  assert.equal(ageFromBirthdate(undefined, "2026-09-08"), null);
  assert.equal(ageFromBirthdate("", "2026-09-08"), null);
  assert.equal(ageFromBirthdate("1990", "2026-09-08"), null);
  assert.equal(ageFromBirthdate("08.09.1990", "2026-09-08"), null);
  assert.equal(ageFromBirthdate("2030-01-01", "2026-09-08"), null); // Zukunft
});

test("tanakaHrMax: 208 − 0,7 × Alter, gerundet", () => {
  // 36 Jahre → 208 − 25,2 = 182,8 → 183
  assert.equal(tanakaHrMax("1990-09-08", "2026-09-08"), 183);
  // 20 Jahre → 208 − 14 = 194
  assert.equal(tanakaHrMax("2006-01-01", "2026-09-08"), 194);
  // 50 Jahre → 208 − 35 = 173
  assert.equal(tanakaHrMax("1976-01-01", "2026-09-08"), 173);
});

test("tanakaHrMax: kein Geburtsdatum → null", () => {
  assert.equal(tanakaHrMax(null, "2026-09-08"), null);
  assert.equal(tanakaHrMax("kaputt", "2026-09-08"), null);
});
