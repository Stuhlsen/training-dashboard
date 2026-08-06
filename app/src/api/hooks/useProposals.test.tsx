/* Tests: die Vorschlags-Hooks — Anlegen (Trainer), Annehmen/Ablehnen,
 * Stale-Folgen, Gruppen-Annahme, Claude-Import.
 *
 * Verhaltens-Spezifikation ist tests/proposals.test.js (Vanilla). Wie dort
 * gilt: Annehmen wendet den Vorschlag über die bereits geprüften
 * Karten-Aktionen an — hier wird nur geprüft, dass die richtige Aktion mit
 * den richtigen Feldern aufgerufen wird und Status/Stale-Folgen stimmen. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanCard, PlanCardPatch, Proposal, ProposalInput } from "../types";

const PLAN_CARDS_SEED: PlanCard[] = [
  {
    id: "card-A",
    date: "2026-07-28",
    sortOrder: 0,
    name: "Sweet Spot 3×12",
    typ: "Sweet Spot",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-07-20T00:00:00Z",
    updatedAt: "2026-07-20T00:00:00Z",
  },
];

let updatePlanCardShouldFail = false;
let inserted: Array<Record<string, unknown>> = [];
let decided: Array<{ id: string; status: string }> = [];
let staled: string[][] = [];
let seq = 0;

vi.mock("../supabase/plan-cards", () => ({
  listPlanCards: async () => ({ ok: true, cards: PLAN_CARDS_SEED.map((c) => ({ ...c })) }),
  updatePlanCard: async (id: string, patch: PlanCardPatch) =>
    updatePlanCardShouldFail
      ? { ok: false, error: { code: "HTTP", message: "500" } }
      : { ok: true, card: { ...PLAN_CARDS_SEED.find((c) => c.id === id), ...patch, id } },
  createPlanCard: async (_athleteId: string, card: Record<string, unknown>) => ({
    ok: true,
    card: { id: "new-card-1", ...card },
  }),
  removePlanCard: async () => ({ ok: true }),
}));

vi.mock("../supabase/profiles", () => ({
  findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }),
  getProfile: async (id: string) => ({
    ok: true,
    profile: {
      id,
      displayName: "Trainer-ST",
      role: "coach",
      coachId: null,
      wellbeingPublic: false,
      isAdmin: false,
      ladderProgressionEnabled: false,
    },
  }),
}));

vi.mock("../supabase/proposals", () => ({
  listProposals: async () => ({ ok: true, proposals: SEED_PROPOSALS.map((p) => ({ ...p })) }),
  insertProposals: async (athleteId: string, createdBy: string, items: ProposalInput[]) => {
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
  decideProposal: async (id: string, status: string) => {
    decided.push({ id, status });
    return { ok: true, proposal: { id, status, decidedAt: "2026-07-24T01:00:00Z" } };
  },
  markProposalsStale: async (ids: string[]) => {
    if (!ids?.length) return { ok: true, proposals: [] };
    staled.push(ids);
    return { ok: true, proposals: ids.map((id) => ({ id, status: "stale" })) };
  },
}));

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
] as unknown as Proposal[];

const { createHarness } = await import("../../test/harness");
const { __resetWriteGuards } = await import("../write-guard");
const { qk } = await import("../keys");
const { usePlanCards } = await import("./usePlanCards");
const {
  useProposals,
  useCreateTrainerProposal,
  useAcceptProposal,
  useAcceptGroup,
  useRejectProposal,
  useWithdrawProposal,
  usePreviewClaudeImport,
  useImportClaudeProposals,
} = await import("./useProposals");

/** Lädt Karten UND Vorschläge und gibt Handles auf alle Aktionen zurück. */
async function setup() {
  const harness = createHarness({ userId: "trainer-1" });
  const view = renderHook(
    () => ({
      cards: usePlanCards("athlete1"),
      proposals: useProposals("athlete1"),
      createTrainer: useCreateTrainerProposal("athlete1"),
      accept: useAcceptProposal("athlete1"),
      acceptGroup: useAcceptGroup("athlete1"),
      reject: useRejectProposal("athlete1"),
      withdraw: useWithdrawProposal("athlete1"),
      preview: usePreviewClaudeImport("athlete1"),
      importProposals: useImportClaudeProposals("athlete1"),
    }),
    { wrapper: harness.wrapper },
  );
  await waitFor(() => {
    expect(view.result.current.cards.data).toHaveLength(1);
    expect(view.result.current.proposals.data).toHaveLength(2);
  });
  const current = () =>
    harness.queryClient.getQueryData<Proposal[]>(qk.proposals("athlete1")) ?? [];
  const byId = (id: string) => current().find((p) => p.id === id);
  return { ...harness, view, current, byId };
}

beforeEach(() => {
  inserted = [];
  decided = [];
  staled = [];
  updatePlanCardShouldFail = false;
  __resetWriteGuards();
});

describe("useProposals", () => {
  it("lädt alle Vorschläge, jeden Status", async () => {
    const { current } = await setup();
    expect(current()).toHaveLength(2);
  });
});

describe("useCreateTrainerProposal", () => {
  it("legt genau einen Vorschlag mit source=trainer und ohne groupId an", async () => {
    const { view, byId } = await setup();
    const result = await view.result.current.createTrainer.create({
      op: "add",
      targetCardId: null,
      targetUpdatedAt: null,
      payload: { title: "Neu", type: "Z2 Dauer", plan_date: "2026-08-01", target_tss: 50 },
      reason: "Lücke im Plan",
    });
    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ source: "trainer", groupId: null, createdBy: "trainer-1" });
    expect(result.ok && byId(result.proposal.id)).toBeDefined();
  });
});

describe("useAcceptProposal", () => {
  it("wendet einen replace-Vorschlag an und setzt ihn auf accepted", async () => {
    const { view, byId } = await setup();
    const result = await view.result.current.accept.accept(byId("prop-1")!);
    expect(result.ok).toBe(true);
    expect(decided[0]).toEqual({ id: "prop-1", status: "accepted" });
    expect(byId("prop-1")?.status).toBe("accepted");
  });

  it("nutzt für move den Kartenpfad und setzt danach accepted", async () => {
    const { view, byId } = await setup();
    const result = await view.result.current.accept.accept(byId("prop-2")!);
    expect(result.ok).toBe(true);
    expect(decided[0]).toEqual({ id: "prop-2", status: "accepted" });
  });

  it("bricht ab und markiert sich selbst als stale, wenn die Karte seitdem geändert wurde", async () => {
    const { view, byId } = await setup();
    const outdated = { ...byId("prop-1")!, targetUpdatedAt: "2026-07-19T00:00:00Z" };
    const result = await view.result.current.accept.accept(outdated);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("SCHEMA");
    expect(staled[0]).toEqual(["prop-1"]);
    // Die Karte wird gar nicht erst angefasst — also auch keine Entscheidung.
    expect(decided).toHaveLength(0);
    expect(byId("prop-1")?.status).toBe("stale");
  });

  it("markiert konkurrierende offene Vorschläge auf dieselbe Karte als stale", async () => {
    const { view, byId } = await setup();
    await view.result.current.accept.accept(byId("prop-1")!);
    expect(staled[0]).toEqual(["prop-2"]);
    expect(byId("prop-2")?.status).toBe("stale");
  });

  it("entscheidet nichts, wenn die Kartenänderung fehlschlägt", async () => {
    const { view, byId } = await setup();
    updatePlanCardShouldFail = true;
    const result = await view.result.current.accept.accept(byId("prop-1")!);
    expect(result.ok).toBe(false);
    expect(decided).toHaveLength(0);
    expect(staled).toHaveLength(0);
    expect(byId("prop-1")?.status).toBe("open");
  });

  it("schreibt nicht ohne Login", async () => {
    const harness = createHarness({ userId: null });
    const view = renderHook(() => useAcceptProposal("athlete1"), { wrapper: harness.wrapper });
    const result = await view.result.current.accept(SEED_PROPOSALS[0]);
    expect(result.ok).toBe(false);
    expect(decided).toHaveLength(0);
  });
});

describe("useAcceptGroup", () => {
  it("übernimmt alle offenen Vorschläge einer Gruppe sequentiell", async () => {
    const { view, queryClient } = await setup();
    // Zwei Vorschläge derselben Gruppe simulieren, ohne zweiten Roundtrip.
    queryClient.setQueryData<Proposal[]>(qk.proposals("athlete1"), (proposals) =>
      (proposals ?? []).map((p) =>
        p.id === "prop-1" || p.id === "prop-2" ? { ...p, groupId: "group-x" } : p,
      ),
    );
    const result = await view.result.current.acceptGroup.acceptGroup("group-x");
    expect(result.results).toHaveLength(2);
    // prop-2 zielt auf dieselbe Karte wie prop-1 und wird durch dessen
    // Annahme stale — der zweite Durchlauf findet ihn nicht mehr als offen
    // vor, scheitert aber auch nicht daran.
    expect(decided.map((d) => d.id)).toContain("prop-1");
  });
});

describe("useRejectProposal / useWithdrawProposal", () => {
  it("setzt auf rejected", async () => {
    const { view, byId } = await setup();
    const result = await view.result.current.reject.reject("prop-1");
    expect(result.ok).toBe(true);
    expect(decided[0]).toEqual({ id: "prop-1", status: "rejected" });
    expect(byId("prop-1")?.status).toBe("rejected");
  });

  it("setzt auf withdrawn (eigener Vorschlag, anders als ablehnen)", async () => {
    const { view, byId } = await setup();
    const result = await view.result.current.withdraw.withdraw("prop-1");
    expect(result.ok).toBe(true);
    expect(decided[0]).toEqual({ id: "prop-1", status: "withdrawn" });
    expect(byId("prop-1")?.status).toBe("withdrawn");
  });
});

/* ── Claude-Import ───────────────────────────────────────────────
   plan_date bewusst weit in der Zukunft (2099): previewClaudeImport()
   reicht kein festes `today` an validateImport() durch, die Regel
   "plan_date nicht in der Vergangenheit" prüft also gegen das ECHTE Datum
   des Testlaufs. Ein 2026er Fixdatum hat den Vanilla-Test genau deshalb
   zeitverzögert rot werden lassen. */

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

describe("usePreviewClaudeImport", () => {
  it("extrahiert und validiert beide Vorschläge", async () => {
    const { view } = await setup();
    const result = view.result.current.preview(VALID_IMPORT_TEXT);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results).toHaveLength(2);
    expect(result.ok && result.results.every((r: { valid: boolean }) => r.valid)).toBe(true);
  });

  it("bricht ohne JSON-Block hart ab", async () => {
    const { view } = await setup();
    const result = view.result.current.preview("Ich würde nichts ändern.");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/Kein JSON-Block/);
  });

  it("bricht bei fremder athlete_id hart ab", async () => {
    const { view } = await setup();
    const text = VALID_IMPORT_TEXT.replace('"athlete": "trainer-1"', '"athlete": "jemand-anderes"');
    const result = view.result.current.preview(text);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toMatch(/anderen Account/);
  });

  it("lässt bei unbekannter target_card_id den Rest geprüft (Teilerfolg)", async () => {
    const { view } = await setup();
    const text = VALID_IMPORT_TEXT.replace('"card-A"', '"card-ghost"');
    const result = view.result.current.preview(text);
    expect(result.ok).toBe(true);
    expect(result.ok && result.results[0].valid).toBe(false);
    expect(result.ok && result.results[1].valid).toBe(true);
  });
});

describe("useImportClaudeProposals", () => {
  it("legt alle validen Einträge mit source=claude und geteilter groupId an", async () => {
    const { view, current } = await setup();
    const preview = view.result.current.preview(VALID_IMPORT_TEXT);
    const validOnes = (preview as { results: Array<{ valid: boolean; proposal: unknown }> }).results
      .filter((r) => r.valid)
      .map((r) => r.proposal);

    const result = await view.result.current.importProposals.importProposals(
      validOnes as Parameters<typeof view.result.current.importProposals.importProposals>[0],
    );
    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(2);
    expect(inserted.every((row) => row.source === "claude")).toBe(true);
    expect(inserted.every((row) => row.createdBy === "trainer-1")).toBe(true);
    expect(inserted[0].groupId).toBe(inserted[1].groupId);
    expect(inserted[0].groupId).toBeTruthy();
    expect(current().filter((p) => p.source === "claude")).toHaveLength(2);
  });

  it("ist bei leerer Liste ein No-Op", async () => {
    const { view } = await setup();
    const result = await view.result.current.importProposals.importProposals([]);
    expect(result.ok).toBe(true);
    expect(inserted).toHaveLength(0);
  });
});
