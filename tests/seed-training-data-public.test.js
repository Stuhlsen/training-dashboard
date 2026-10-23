/* Tests: scripts/seed-training-data-public.js::planSeed — reine Auswahl, kein I/O. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { planSeed } from "../scripts/seed-training-data-public.js";

test("planSeed: wählt nur die Bestandsathleten mit ausgeschaltetem Schalter", () => {
  const { toSet, alreadyOn, missing } = planSeed([
    { id: "u1", display_name: "Stuhlsen", training_data_public: false },
    { id: "u2", display_name: "bentastiic", training_data_public: true },
    { id: "u9", display_name: "irgendwer", training_data_public: false },
  ]);
  assert.deepEqual(toSet, [{ id: "u1", slug: "athlete1" }]);
  assert.deepEqual(alreadyOn, ["athlete4"]);
  assert.deepEqual(missing, ["athlete2", "athlete3"]);
});

test("planSeed: Name wird ohne Rücksicht auf Groß/Kleinschreibung und Randleerzeichen erkannt", () => {
  const { toSet } = planSeed([
    { id: "u1", display_name: "  stuhlsen ", training_data_public: false },
  ]);
  assert.deepEqual(toSet, [{ id: "u1", slug: "athlete1" }]);
});

test("planSeed: fremde Accounts und Profile ohne Namen bleiben unberührt", () => {
  const { toSet, alreadyOn, missing } = planSeed([
    { id: "u8", display_name: null, training_data_public: false },
    { id: "u9", display_name: "irgendwer", training_data_public: false },
  ]);
  assert.deepEqual(toSet, []);
  assert.deepEqual(alreadyOn, []);
  assert.deepEqual(missing, ["athlete1", "athlete2", "athlete3", "athlete4"]);
});
