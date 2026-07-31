/* Tests: state/proposals.js — Laden, Anlegen (Trainer), Annehmen/Ablehnen,
   Gruppen-Annahme (Phase 4, Umsetzung Trainer-Dashboard).

   Annehmen wendet den Vorschlag über die BEREITS GETESTETEN plan-cards-
   Aktionen an (state/plan-cards.js, s. tests/plan-cards-move.test.js) — hier
   wird nur geprüft, dass proposals.js die richtige Aktion mit den richtigen
   Feldern aufruft und Status/Stale-Folgen korrekt setzt. data-access wird
   analog zu tests/plan-cards-move.test.js per mock.module() gestubbt
   (--experimental-test-module-mocks, s. package.json). */

import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import path from "node:path";

const JS = path.resolve(fileURLToPath(new URL("../assets/js", import.meta.url)));
const u = (p) => pathToFileURL(path.join(JS, p)).href;

const PLAN_CARDS_SEED = [
  { id: "card-A", date: "2026-07-28", sortOrder: 0, name: "Sweet Spot 3×12", typ: "Sweet Spot", updatedAt: "2026-07-20T00:00:00Z" },
];

let updatePlanCardShouldFail = false;

mock.module(u("data-access/supabase/plan-cards.js"), {
  exports: {
    listPlanCards: async () => ({ ok: true, cards: PLAN_CARDS_SEED.map((c) => ({ ...c })) }),
    updatePlanCard: async (id, patch) =>
      updatePlanCardShouldFail
        ? { ok: false, error: { code: "HTTP", message: "500" } }
        : { ok: true, card: { ...PLAN_CARDS_SEED.find((c) => c.id === id), ...patch, id } },
    createPlanCard: async (athleteId, card) => ({ ok: true, card: { id: "new-card-1", ...card } }),
    removePlanCard: async () => ({ ok: true }),
  },
});
mock.module(u("data-access/supabase/profiles.js"), {
  exports: { findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }) },
});
mock.module(u("data-access/intervals/push.js"), {
  exports: { pushCardWorkout: async () => ({ ok: true }) },
});
mock.module(u("state/session.js"), {
  exports: { getSession: () => ({ id: "trainer-1" }), isCoach: () => true },
});

let inserted = [];
let decided = [];
let staled = [];
let seq = 0;

mock.module(u("data-access/supabase/proposals.js"), {
  exports: {
    listProposals: async () => ({
      ok: true,
      proposals: SEED_PROPOSALS.map((p) => ({ ...p })),
    }),
    insertProposals: async (athleteId, createdBy, items) => {
      const rows = items.map((item) => ({
        id: `new-${++seq}`,
        athleteId,
        createdBy,
        source: item.source,
        groupId: item.groupId ?? null,
        op: item.op,
        targetCardId: item.targetCardId ?? null,
        targetUpdatedAt: item.targetUpdatedAt ?? null,
        payload: item.payload,
        reason: item.reason ?? null,
        status: "open",
        createdAt: "2026-07-24T00:00:00Z",
        decidedAt: null,
      }));
      inserted.push(...rows);
      return { ok: true, proposals: rows };
    },
    decideProposal: async (id, status) => {
      decided.push({ id, status });
      return { ok: true, proposal: { id, status, decidedAt: "2026-07-24T01:00:00Z" } };
    },
    markProposalsStale: async (ids) => {
      staled.push(ids);
      return { ok: true, proposals: ids.map((id) => ({ id, status: "stale" })) };
    },
  },
});

const SEED_PROPOSALS = [
  {
    id: "prop-1",
    athleteId: "profile-uuid-1",
    createdBy: "trainer-1",
    source: "trainer",
    groupId: null,
    op: "replace",
    targetCardId: "card-A",
    targetUpdatedAt: "2026-07-20T00:00:00Z",
    payload: { title: "Entschärft", type: "Z2 Dauer", plan_date: "2026-07-28", target_tss: 40 },
    reason: "TSB zu tief",
    status: "open",
    createdAt: "2026-07-23T00:00:00Z",
    decidedAt: null,
  },
  {
    id: "prop-2",
    athleteId: "profile-uuid-1",
    createdBy: "trainer-1",
    source: "trainer",
    groupId: null,
    op: "move",
    targetCardId: "card-A",
    targetUpdatedAt: "2026-07-20T00:00:00Z",
    payload: { plan_date: "2026-07-30" },
    reason: null,
    status: "open",
    createdAt: "2026-07-22T00:00:00Z",
    decidedAt: null,
  },
];

const {
  loadProposals,
  createTrainerProposal,
  acceptProposal,
  acceptGroup,
  rejectProposal,
  withdrawProposal,
  previewClaudeImport,
  importClaudeProposals,
  getState,
} = await import(u("state/proposals.js"));
const { loadPlanCards } = await import(u("state/plan-cards.js"));

async function seed() {
  inserted = [];
  decided = [];
  staled = [];
  updatePlanCardShouldFail = false;
  await loadPlanCards("athlete1");
  return loadProposals("athlete1");
}

/* ── loadProposals ───────────────────────────────────────────── */

test("loadProposals: lädt und speichert alle Vorschläge (jeder Status)", async () => {
  await seed();
  const { proposals, loadedForAthleteId } = getState();
  assert.equal(proposals.length, 2);
  assert.equal(loadedForAthleteId, "athlete1");
});

/* ── createTrainerProposal ───────────────────────────────────── */

test("createTrainerProposal: legt genau einen Vorschlag mit source=trainer an, keine groupId", async () => {
  await seed();
  const result = await createTrainerProposal("athlete1", {
    op: "add",
    targetCardId: null,
    targetUpdatedAt: null,
    payload: { title: "Neu", type: "Z2 Dauer", plan_date: "2026-08-01", target_tss: 50 },
    reason: "Lücke im Plan",
  });
  assert.equal(result.ok, true);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].source, "trainer");
  assert.equal(inserted[0].groupId, null);
  assert.equal(inserted[0].createdBy, "trainer-1");
  assert.equal(getState().proposals.some((p) => p.id === result.proposal.id), true, "landet im lokalen State");
});

/* ── acceptProposal ──────────────────────────────────────────── */

test("acceptProposal (replace): ruft updatePlanCard mit den Payload-Feldern auf und setzt accepted", async () => {
  await seed();
  const p = getState().proposals.find((x) => x.id === "prop-1");
  const result = await acceptProposal("athlete1", p);
  assert.equal(result.ok, true);
  assert.deepEqual(decided[0], { id: "prop-1", status: "accepted" });
  assert.equal(getState().proposals.find((x) => x.id === "prop-1").status, "accepted");
});

test("acceptProposal: bricht ab und markiert sich selbst als stale, wenn die Karte seitdem geändert wurde", async () => {
  await seed();
  const p = { ...getState().proposals.find((x) => x.id === "prop-1"), targetUpdatedAt: "2026-07-19T00:00:00Z" };
  const result = await acceptProposal("athlete1", p);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "SCHEMA");
  assert.deepEqual(staled[0], ["prop-1"]);
  assert.equal(decided.length, 0, "kein decideProposal-Aufruf — die Karte wird nicht angefasst");
  assert.equal(getState().proposals.find((x) => x.id === "prop-1").status, "stale");
});

test("acceptProposal: markiert konkurrierende offene Vorschläge auf dieselbe Karte als stale", async () => {
  await seed();
  const p = getState().proposals.find((x) => x.id === "prop-1");
  await acceptProposal("athlete1", p);
  assert.deepEqual(staled[0], ["prop-2"], "prop-2 zielt ebenfalls auf card-A und war offen");
  assert.equal(getState().proposals.find((x) => x.id === "prop-2").status, "stale");
});

test("acceptProposal: bricht bei fehlgeschlagener Kartenänderung ab, OHNE den Vorschlag zu entscheiden", async () => {
  await seed();
  updatePlanCardShouldFail = true;
  const p = getState().proposals.find((x) => x.id === "prop-1");
  const result = await acceptProposal("athlete1", p);
  assert.equal(result.ok, false);
  assert.equal(decided.length, 0, "kein decideProposal-Aufruf bei Kartenfehler");
  assert.equal(staled.length, 0, "keine Stale-Folge bei Kartenfehler");
  assert.equal(getState().proposals.find((x) => x.id === "prop-1").status, "open", "bleibt offen");
});

test("acceptProposal (move): nutzt movePlanCard über den bereits geladenen Kartenstand", async () => {
  await seed();
  const p = getState().proposals.find((x) => x.id === "prop-2");
  const result = await acceptProposal("athlete1", p);
  assert.equal(result.ok, true);
  assert.deepEqual(decided[0], { id: "prop-2", status: "accepted" });
});

/* ── acceptGroup ─────────────────────────────────────────────── */

test("acceptGroup: übernimmt sequentiell alle offenen Vorschläge einer Gruppe", async () => {
  await seed();
  // Zwei weitere Vorschläge derselben Gruppe simulieren, ohne einen zweiten
  // Server-Roundtrip zu brauchen — direkt über createTrainerProposal anlegen.
  await createTrainerProposal("athlete1", {
    op: "add",
    targetCardId: null,
    targetUpdatedAt: null,
    payload: { title: "A", type: "Z2 Dauer", plan_date: "2026-08-02", target_tss: 40 },
    reason: null,
  });
  // groupId wird von insertProposals im Mock nicht automatisch vergeben —
  // hier direkt am lokalen State nachjustieren, um eine Gruppe zu simulieren.
  const { proposals } = getState();
  proposals.find((p) => p.id === "prop-1").groupId = "group-x";
  proposals.find((p) => p.id.startsWith("new-")).groupId = "group-x";

  const result = await acceptGroup("athlete1", "group-x");
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
});

/* ── rejectProposal ──────────────────────────────────────────── */

test("rejectProposal: setzt den Vorschlag auf rejected", async () => {
  await seed();
  const result = await rejectProposal("prop-1");
  assert.equal(result.ok, true);
  assert.deepEqual(decided[0], { id: "prop-1", status: "rejected" });
  assert.equal(getState().proposals.find((x) => x.id === "prop-1").status, "rejected");
});

/* ── withdrawProposal (bislang ohne UI-Pfad, s. docs/offene-punkte.md) ── */

test("withdrawProposal: setzt den Vorschlag auf withdrawn", async () => {
  await seed();
  const result = await withdrawProposal("prop-1");
  assert.equal(result.ok, true);
  assert.deepEqual(decided[0], { id: "prop-1", status: "withdrawn" });
  assert.equal(getState().proposals.find((x) => x.id === "prop-1").status, "withdrawn");
});

/* ── previewClaudeImport / importClaudeProposals (Export/Import-Workflow) ── */

// plan_date-Werte bewusst weit in der Zukunft (2099, wie tests/export.test.js
// mit "card-future"): previewClaudeImport() reicht kein festes `today` an
// validateImport() durch, die Regel "plan_date nicht in der Vergangenheit"
// prüft also gegen das ECHTE Datum des Testlaufs. Ein 2026er Fixdatum war
// bei Erstellung dieses Tests noch gültig, ist es aber nach dem 28.07.2026
// nicht mehr — genau das hat diesen Test zeitverzögert rot werden lassen.
const VALID_IMPORT_TEXT = `Alles passt bis auf eine Einheit, hier mein Vorschlag.

\`\`\`json
{
  "schema_version": 1,
  "athlete": "trainer-1",
  "source": "claude",
  "proposals": [
    {
      "op": "replace",
      "target_card_id": "card-A",
      "target_updated_at": "2026-07-20T00:00:00Z",
      "reason": "TSB zu tief vor dem Event",
      "payload": { "title": "Entschärft", "type": "Z2 Dauer", "plan_date": "2099-07-28", "target_tss": 40 }
    },
    {
      "op": "add",
      "payload": { "title": "Neue Einheit", "type": "Z2 Dauer", "plan_date": "2099-08-05" }
    }
  ]
}
\`\`\``;

test("previewClaudeImport: extrahiert + validiert, beide Vorschläge valide (bekannte Karte, eigene athlete_id)", async () => {
  await seed();
  const result = previewClaudeImport(VALID_IMPORT_TEXT);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].valid, true);
  assert.equal(result.results[1].valid, true);
});

test("previewClaudeImport: kein JSON-Block → harter Abbruch, eigener Fehlerzweig", async () => {
  await seed();
  const result = previewClaudeImport("Ich würde nichts ändern.");
  assert.equal(result.ok, false);
  assert.match(result.error.message, /Kein JSON-Block/);
});

test("previewClaudeImport: fremde athlete_id im JSON → harter Abbruch", async () => {
  await seed();
  const text = VALID_IMPORT_TEXT.replace('"athlete": "trainer-1"', '"athlete": "jemand-anderes"');
  const result = previewClaudeImport(text);
  assert.equal(result.ok, false);
  assert.match(result.error.message, /anderen Account/);
});

test("previewClaudeImport: unbekannte target_card_id → dieser Eintrag invalide, Rest bleibt geprüft (Teilerfolg)", async () => {
  await seed();
  const text = VALID_IMPORT_TEXT.replace('"card-A"', '"card-ghost"');
  const result = previewClaudeImport(text);
  assert.equal(result.ok, true);
  assert.equal(result.results[0].valid, false);
  assert.equal(result.results[1].valid, true);
});

test("importClaudeProposals: legt alle validen Einträge mit source=claude und geteilter groupId an", async () => {
  await seed();
  const preview = previewClaudeImport(VALID_IMPORT_TEXT);
  const validOnes = preview.results.filter((r) => r.valid).map((r) => r.proposal);
  const result = await importClaudeProposals("athlete1", validOnes);
  assert.equal(result.ok, true);
  assert.equal(inserted.length, 2);
  assert.ok(inserted.every((row) => row.source === "claude"));
  assert.ok(inserted.every((row) => row.createdBy === "trainer-1"));
  assert.equal(inserted[0].groupId, inserted[1].groupId);
  assert.ok(inserted[0].groupId, "groupId ist gesetzt, nicht null");
  assert.equal(getState().proposals.filter((p) => p.source === "claude").length, 2);
});

test("importClaudeProposals: leere Liste ist ein No-Op, kein Insert-Aufruf", async () => {
  await seed();
  const before = inserted.length;
  const result = await importClaudeProposals("athlete1", []);
  assert.equal(result.ok, true);
  assert.equal(inserted.length, before);
});
