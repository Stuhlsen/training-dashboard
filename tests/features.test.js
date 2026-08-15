/* Tests: Plan-2-Blöcke (Sync) */

import { test } from "node:test";
import assert from "node:assert/strict";
import { getPlan2Blocks } from "../scripts/lib/plan2.js";

/* ── Plan-2-Blöcke (Sync) ───────────────────────────────────── */

test("getPlan2Blocks: Notion-Ära + begonnene Phasenblöcke, laufender Block gekappt", () => {
  const blocks = getPlan2Blocks("2026-07-04");
  assert.equal(blocks[0].key, "plan1");
  const ss = blocks.find((b) => b.label === "Sweet Spot");
  assert.ok(ss);
  assert.equal(ss.to, "2026-07-04"); // läuft noch → auf heute gekappt
  assert.equal(
    blocks.find((b) => b.label === "VO2max"),
    undefined
  ); // noch nicht begonnen
});

test("getPlan2Blocks: nach Saisonende alle Blöcke mit vollen Zeiträumen", () => {
  const blocks = getPlan2Blocks("2026-10-01");
  const labels = blocks.map((b) => b.label);
  assert.deepEqual(labels, ["Notion-Ära", "Sweet Spot", "Schwelle", "VO2max"]);
  assert.ok(blocks[1].to > blocks[1].from);
});
