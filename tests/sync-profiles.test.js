/* Tests: sync-profiles.js — welche Profile ein eigenes Sync-Verhalten haben
   (Fahrplan 26 E5). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { slugForName, hasOwnSyncBehavior } from "../scripts/lib/sync-profiles.js";

test("slugForName: Pseudonym → Slug, case-insensitiv und getrimmt", () => {
  assert.equal(slugForName("Stuhlsen"), "athlete1");
  assert.equal(slugForName("  HC_DIZEE "), "athlete2");
  assert.equal(slugForName("hendrik"), "athlete3");
  assert.equal(slugForName("Bentastiic"), "athlete4");
});

test("slugForName: unbekannt, leer oder fehlend → undefined", () => {
  assert.equal(slugForName("jemand.anders"), undefined);
  assert.equal(slugForName(""), undefined);
  assert.equal(slugForName(null), undefined);
  assert.equal(slugForName(undefined), undefined);
});

test("hasOwnSyncBehavior: nur athlete1–4, nie ein profile:-Schlüssel", () => {
  for (const k of ["athlete1", "athlete2", "athlete3", "athlete4"]) assert.equal(hasOwnSyncBehavior(k), true);
  assert.equal(hasOwnSyncBehavior("profile:abc"), false);
  assert.equal(hasOwnSyncBehavior("athlete5"), false);
});
