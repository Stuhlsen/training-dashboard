/* Tests: core/proposal-summary.js — kompakte Prognose-Kurzfassung für die
   Vorschlagsliste (Phase 4, Vorschlags-Schema-Konzept §5). Reine Funktion,
   Preview-Objekte werden von Hand gebaut statt über projectLoad/detectConflicts
   zu laufen — die sind bereits eigenständig getestet. */

import test from "node:test";
import assert from "node:assert/strict";
import { summarizeProposalImpact } from "../assets/js/core/proposal-summary.js";

function mkPreview({ beforeTsb = null, afterTsb = null, beforeConflicts = [], afterConflicts = [] } = {}) {
  const day = (tsb) => (tsb == null ? [] : [{ date: "2026-08-05", tsb, tss: 0, cardIds: [] }]);
  return {
    before: { days: day(beforeTsb), horizonEnd: "2026-08-12" },
    after: { days: day(afterTsb), horizonEnd: "2026-08-12" },
    beforeConflicts,
    afterConflicts,
  };
}

test("summarizeProposalImpact: zeigt TSB-Delta am nächsten Eventtag", () => {
  const preview = mkPreview({ beforeTsb: -4, afterTsb: 11 });
  const events = [{ type: "race", eventDate: "2026-08-05", title: "GFNY" }];
  const text = summarizeProposalImpact(preview, events, "2026-07-24");
  assert.equal(text, "TSB GFNY: -4 → 11");
});

test("summarizeProposalImpact: kein Text, wenn sich der TSB am Eventtag nicht ändert", () => {
  const preview = mkPreview({ beforeTsb: 5, afterTsb: 5 });
  const events = [{ type: "race", eventDate: "2026-08-05", title: "GFNY" }];
  assert.equal(summarizeProposalImpact(preview, events, "2026-07-24"), null);
});

test("summarizeProposalImpact: meldet gelösten Konflikt ohne Event im Horizont", () => {
  const preview = mkPreview({
    beforeConflicts: [{ rule: "K-OVERLAP", dates: ["2026-07-28"], message: "…" }],
    afterConflicts: [],
  });
  assert.equal(summarizeProposalImpact(preview, [], "2026-07-24"), "löst K-OVERLAP");
});

test("summarizeProposalImpact: meldet neu verursachten Konflikt", () => {
  const preview = mkPreview({
    beforeConflicts: [],
    afterConflicts: [{ rule: "K-HART", dates: ["2026-07-29"], message: "…" }],
  });
  assert.equal(summarizeProposalImpact(preview, [], "2026-07-24"), "verursacht K-HART");
});

test("summarizeProposalImpact: null ohne Event-TSB-Änderung und ohne Konfliktwechsel", () => {
  const preview = mkPreview({
    beforeConflicts: [{ rule: "K-RAMPE", dates: ["2026-07-29"], message: "…" }],
    afterConflicts: [{ rule: "K-RAMPE", dates: ["2026-07-29"], message: "…" }],
  });
  assert.equal(summarizeProposalImpact(preview, [], "2026-07-24"), null);
});
