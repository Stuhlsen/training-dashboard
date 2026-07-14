/* Tests: countEmpty (ui/chart-visibility.js) — reine Zählfunktion für den
   Badge im "Leere Charts einblenden"-Button. Regression: der Button zeigte
   bisher gar keine Anzahl an; countEmpty muss dieselben Verfügbarkeits-
   Flags zählen, die apply() auch für die chart-empty-Klasse verwendet
   (keine zweite, abweichende Zählung). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { countEmpty } from "../assets/js/ui/chart-visibility.js";

test("countEmpty: zählt nur die nicht verfügbaren (false) Flags", () => {
  assert.equal(countEmpty([true, true, true]), 0);
  assert.equal(countEmpty([false, false, true]), 2);
  assert.equal(countEmpty([false, false, false]), 3);
  assert.equal(countEmpty([]), 0);
});
