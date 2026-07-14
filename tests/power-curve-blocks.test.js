/* Tests: Power-Curve-Query-Aufbau (scripts/lib/intervals.js) + Block-
   Struktur (scripts/lib/plan2.js). Regression für den Bug, dass Block-
   Kurven ohne `curves=r.<von>.<bis>` identisch zur Gesamtkurve waren
   (intervals.icu ignoriert `oldest` ohne diesen Range-Spezifizierer). */

import { test } from "node:test";
import assert from "node:assert/strict";
import { powerCurveQuery } from "../scripts/lib/intervals.js";
import { getPlan2Blocks } from "../scripts/lib/plan2.js";

test("powerCurveQuery ohne curves: nur oldest/newest/type (Gesamtkurve-Preset)", () => {
  assert.equal(powerCurveQuery("2026-03-24", "2026-07-13"), "oldest=2026-03-24&newest=2026-07-13&type=Ride");
});

test("powerCurveQuery mit curves: Range-Spezifizierer für zeitraumgebundene Kurve", () => {
  const q = powerCurveQuery("2026-06-29", "2026-07-13", "r.2026-06-29.2026-07-13");
  assert.match(q, /curves=r\.2026-06-29\.2026-07-13/);
});

test("getPlan2Blocks-Ergebnis liefert für jeden Block ein von/bis-Paar, das sich zu einem gültigen curves-Range-Spezifizierer zusammenbauen lässt", () => {
  const blocks = getPlan2Blocks("2026-07-14");
  assert.ok(blocks.length >= 2, "mindestens Plan 1 + ein begonnener Phasenblock erwartet");
  for (const b of blocks) {
    const spec = `r.${b.from}.${b.to}`;
    assert.match(spec, /^r\.\d{4}-\d{2}-\d{2}\.\d{4}-\d{2}-\d{2}$/);
    assert.ok(b.from <= b.to);
  }
});
