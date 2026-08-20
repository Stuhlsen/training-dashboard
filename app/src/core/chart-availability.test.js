/* Tests: core/chart-availability.js::countEmpty — Port von
   tests/chart-visibility.test.js (Vanilla, identische Fälle). Regression:
   der Umschalter-Badge zeigte bisher gar keine Anzahl an; countEmpty muss
   dieselben Verfügbarkeits-Flags zählen, die ExplorerSection.tsx auch für das
   Aus-/Einblenden verwendet (keine zweite, abweichende Zählung).

   Zweiter Block: core/chart-availability.js::efficiencyAvailable —
   Regression zur EF-Trendlinie + Scatter-Etappe (20.08.2026). efficiency
   (normalize.js) kommt ausschließlich aus np+hf, das Verfügbarkeits-
   Prädikat muss dasselbe Feld prüfen, sonst gilt eine Sektion als
   "verfügbar", obwohl der Chart keinen Punkt zeichnen kann (Notion-
   Altbestand: watt+hf ohne np). */

import { test } from "vitest";
import assert from "node:assert/strict";
import { countEmpty, efficiencyAvailable } from "./chart-availability.js";

test("countEmpty: zählt nur die nicht verfügbaren (false) Flags", () => {
  assert.equal(countEmpty([true, true, true]), 0);
  assert.equal(countEmpty([false, false, true]), 2);
  assert.equal(countEmpty([false, false, false]), 3);
  assert.equal(countEmpty([]), 0);
});

test("efficiencyAvailable: prüft np (nicht watt) — Notion-Altbestand ohne np zählt nicht", () => {
  const legacyOnly = [
    { watt: 150, hf: 100, min: 90 },
    { watt: 155, hf: 100, min: 90 },
  ];
  assert.equal(efficiencyAvailable(legacyOnly), false);

  const withNp = [
    { np: 150, hf: 100, min: 90 },
    { np: 155, hf: 100, min: 90 },
  ];
  assert.equal(efficiencyAvailable(withNp), true);
});
