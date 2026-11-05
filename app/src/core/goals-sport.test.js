/* Tests: core/goals.js::goalsForSport — Sportfilter vor goalPlanProfile()
   (Fahrplan 43 E5). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { goalsForSport, goalPlanProfile } from "./goals.js";

const ftp = { goalKey: "ftp" };
const run = { goalKey: "laufen_starten" };
const endurance = { goalKey: "ausdauer" };

test("goalsForSport: Laufen starten wirkt nie auf Rad", () => {
  const { main, side } = goalsForSport({ main: run, side: endurance }, "ride");
  assert.equal(main, null);
  assert.equal(side, endurance);
  assert.equal(goalPlanProfile(main, null).level, null);
  assert.equal(goalPlanProfile(main, null).ramp, null);
});

test("goalsForSport: FTP wirkt nie auf Lauf", () => {
  const { main } = goalsForSport({ main: ftp, side: null }, "run");
  assert.equal(main, null);
  assert.equal(goalPlanProfile(main, null).intensityFocus, null);
});

test("goalsForSport: passende Ziele bleiben, Rollen unverändert", () => {
  assert.deepEqual(goalsForSport({ main: ftp, side: endurance }, "ride"), { main: ftp, side: endurance });
  assert.deepEqual(goalsForSport({ main: run, side: null }, "run"), { main: run, side: null });
});

test("goalsForSport: leer, unbekannter Schlüssel, Freitext-Altziel", () => {
  assert.deepEqual(goalsForSport({ main: null, side: null }, "ride"), { main: null, side: null });
  assert.deepEqual(goalsForSport({ main: { goalKey: "gibtsnicht" }, side: { goalKey: null } }, "ride"), {
    main: null,
    side: null,
  });
  assert.deepEqual(goalsForSport({}, "ride"), { main: null, side: null });
});

test("goalsForSport: Schwimmen kennt Ausdauer, aber nicht FTP", () => {
  assert.equal(goalsForSport({ main: endurance, side: ftp }, "swim").main, endurance);
  assert.equal(goalsForSport({ main: endurance, side: ftp }, "swim").side, null);
});
