/* Tests: core/chart-availability.js::countEmpty — Port von
   tests/chart-visibility.test.js (Vanilla, identische Fälle). Regression:
   der Umschalter-Badge zeigte bisher gar keine Anzahl an; countEmpty muss
   dieselben Verfügbarkeits-Flags zählen, die ExplorerSection.tsx auch für das
   Aus-/Einblenden verwendet (keine zweite, abweichende Zählung). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { countEmpty } from "./chart-availability.js";

test("countEmpty: zählt nur die nicht verfügbaren (false) Flags", () => {
  assert.equal(countEmpty([true, true, true]), 0);
  assert.equal(countEmpty([false, false, true]), 2);
  assert.equal(countEmpty([false, false, false]), 3);
  assert.equal(countEmpty([]), 0);
});
