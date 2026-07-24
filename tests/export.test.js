/* Tests: state/export.js — Claude-Export-Text zusammenziehen
   (Phase 4, Export/Import-Workflow-Konzept §2). data-access wird analog zu
   tests/proposals.test.js/tests/plan-cards-move.test.js per mock.module()
   gestubbt (--experimental-test-module-mocks, s. package.json). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const PLAN_CARDS_SEED = [
  { id: "card-past", date: "2020-01-01", sortOrder: 0, name: "Alt", typ: "Z2 Dauer", updatedAt: "2020-01-01T00:00:00Z" },
  { id: "card-future", date: "2099-01-01", sortOrder: 0, name: "Zukunft", typ: "Sweet Spot", tssPlanned: 65, updatedAt: "2026-07-20T00:00:00Z" },
];
const EVENTS_SEED = [{ id: "ev-1", title: "GFNY Bremen", eventDate: "2099-02-01", type: "race", priority: "A" }];
const WELLBEING_SEED = [{ id: "w-1", date: "2026-07-23", energy: 4, muscleFeel: 3, mood: 4, note: "Kopf dicht" }];

mock.module(u("data-access/supabase/plan-cards.js"), {
  exports: {
    listPlanCards: async () => ({ ok: true, cards: PLAN_CARDS_SEED.map((c) => ({ ...c })) }),
    updatePlanCard: async () => ({ ok: true, card: {} }),
    createPlanCard: async () => ({ ok: true, card: {} }),
    removePlanCard: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: { findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }) },
});
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});
mock.module(u("data-access/supabase/events.js"), {
  exports: {
    listEvents: async () => ({ ok: true, events: EVENTS_SEED.map((e) => ({ ...e })) }),
    createEvent: async () => ({ ok: true, event: {} }),
    updateEvent: async () => ({ ok: true, event: {} }),
    removeEvent: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/wellbeing.js"), {
  exports: {
    getRange: async () => ({ ok: true, checkins: WELLBEING_SEED.map((w) => ({ ...w })) }),
    getSharedRange: async () => ({ ok: true, checkins: [] }),
    upsertToday: async () => ({ ok: true, checkin: {} }),
  },
});
mock.module(u("state/session.js"), {
  exports: {
    getSession: () => ({ id: "athlete-1-uuid", displayName: "Stuhlsen" }),
    onSessionChange: () => () => {},
    isCoach: () => false,
    isAthlete: () => true,
  },
});

const { buildClaudeExport } = await import(u("state/export.js"));
const { loadPlanCards } = await import(u("state/plan-cards.js"));
const { loadEvents } = await import(u("state/events.js"));

test("buildClaudeExport: zieht Plan (nur ab heute), Events, Wellbeing zusammen und baut den Export-Text", async () => {
  await loadPlanCards("athlete1");
  await loadEvents("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.equal(result.ok, true);
  assert.ok(result.text.startsWith("Du bist mein Radsport-Trainer."));
  assert.match(result.text, /card-future/);
  assert.doesNotMatch(result.text, /card-past/, "vergangene Karten dürfen nicht im Plan-Fenster stehen");
  assert.match(result.text, /GFNY Bremen/);
  assert.match(result.text, /Kopf dicht/);
});

test("buildClaudeExport: FTP-Dreiklang aus CONFIG.athleteConfig, nicht Data.ftpValue()", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.text, /FTP: 193 W \(Ziel: 210 W\)/);
});

test("buildClaudeExport: 'athlete' im JSON-Anhang ist die Session-UUID, nicht die interne Kennung", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  const jsonBlock = result.text.match(/```json\n([\s\S]*?)\n```/)[1];
  const parsed = JSON.parse(jsonBlock);
  assert.equal(parsed.athlete, "athlete-1-uuid");
});

test("buildClaudeExport: liefert einen fileName im erwarteten Format", async () => {
  await loadPlanCards("athlete1");
  const result = await buildClaudeExport("athlete1");
  assert.match(result.fileName, /^claude-briefing-athlete1-\d{4}-\d{2}-\d{2}\.md$/);
});
