/* Tests: nutrition-taxonomy mirror consistency (Drift-Wächter).
   scripts/lib/core/nutrition-taxonomy.js muss byte-identisch zu
   app/src/core/nutrition-taxonomy.js sein — same pattern as
   plan-week-model-consistency.test.js. */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_PATH = path.resolve(__dirname, "..", "app", "src", "core", "nutrition-taxonomy.js");
const SCRIPTS_PATH = path.resolve(
  __dirname,
  "..",
  "scripts",
  "lib",
  "core",
  "nutrition-taxonomy.js",
);

test("scripts/lib/core/nutrition-taxonomy.js ist byte-identisch zu app/src/core/nutrition-taxonomy.js", () => {
  const appSrc = readFileSync(APP_PATH, "utf-8");
  const scriptsSrc = readFileSync(SCRIPTS_PATH, "utf-8");
  assert.equal(
    scriptsSrc,
    appSrc,
    "scripts/lib/core/nutrition-taxonomy.js weicht von app/src/core/nutrition-taxonomy.js ab — " +
      "beide gemeinsam pflegen (siehe Kommentar in der app-Version).",
  );
});