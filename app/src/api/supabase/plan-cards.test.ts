/* Tests: api/supabase/plan-cards.ts — die Fahrplan-8-E6-Ergänzungen
 * createPlanCards() (Bulk-Insert mit plan_id/week/phase/sort_order) und
 * deleteFuturePlanCardsForPlan() (zwei Schritte: IDs holen, dann .in()
 * löschen; ausgefallene + vergangene Karten bleiben). */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const {
  createPlanCards,
  deleteFuturePlanCardsForPlan,
  deleteFuturePlanlessPlanCards,
  deletePlanCardsForPlan,
} = await import("./plan-cards");

const cardRow = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  planned_date: "2026-09-08",
  sort_order: 0,
  title: "Q1",
  workout_type: "SS Intervalle",
  km: null,
  duration_min: 75,
  tss_planned: 78,
  status: null,
  note: null,
  workout: null,
  workout_structure: null,
  cancel_reason: null,
  moved_from_date: null,
  move_reason: null,
  week: "2026-KW37",
  phase: "Sweet Spot",
  pushed_external_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const draft = (over: Record<string, unknown> = {}) => ({
  date: "2026-09-08",
  name: "Q1",
  typ: "SS Intervalle",
  phase: "Sweet Spot",
  week: "2026-KW37",
  tssPlanned: 78,
  durationMin: 75,
  km: null,
  workout: null,
  workoutStructure: null,
  sortOrder: 0,
  ...over,
});

describe("createPlanCards", () => {
  it("schickt ein insert-Array mit plan_id/week/phase/sort_order je Karte", async () => {
    let payload: Record<string, unknown>[] | undefined;
    fakeClient.handlers.plan_cards = (calls) => {
      payload = calls.payload as Record<string, unknown>[];
      return { data: [cardRow(), cardRow({ id: "c2", sort_order: 1 })], error: null };
    };
    const res = await createPlanCards("prof-a", "plan-9", [
      draft(),
      draft({ name: "Q1 Zusatz", sortOrder: 1 }),
    ]);
    expect(res.ok).toBe(true);
    expect(payload).toHaveLength(2);
    expect(payload?.[0]).toMatchObject({
      athlete_id: "prof-a",
      plan_id: "plan-9",
      planned_date: "2026-09-08",
      sort_order: 0,
      title: "Q1",
      workout_type: "SS Intervalle",
      week: "2026-KW37",
      phase: "Sweet Spot",
      tss_planned: 78,
      duration_min: 75,
    });
    expect(payload?.[1]).toMatchObject({ sort_order: 1, title: "Q1 Zusatz" });
  });

  it("leere Liste -> erfolgreicher No-Op ohne DB-Aufruf", async () => {
    fakeClient.handlers.plan_cards = () => {
      throw new Error("sollte nicht aufgerufen werden");
    };
    expect(await createPlanCards("prof-a", "plan-9", [])).toEqual({ ok: true, cards: [] });
  });
});

describe("deleteFuturePlanCardsForPlan", () => {
  it("löscht nur die zukünftigen, nicht ausgefallenen Karten des Plans", async () => {
    const calls: { method?: string; filters: unknown }[] = [];
    fakeClient.handlers.plan_cards = (c) => {
      calls.push({ method: c.method, filters: c.filters });
      if (c.method === "delete") return { data: null, error: null };
      return {
        data: [
          { id: "c1", status: null },
          { id: "c2", status: "ausgefallen" },
          { id: "c3", status: null },
        ],
        error: null,
      };
    };
    const res = await deleteFuturePlanCardsForPlan("plan-9", "2026-09-03");
    expect(res).toEqual({ ok: true, deleted: 2 });
    // Schritt 1: Filter auf plan_id + planned_date >= from
    expect(calls[0].filters).toEqual([
      { op: "eq", col: "plan_id", val: "plan-9" },
      { op: "gte", col: "planned_date", val: "2026-09-03" },
    ]);
    // Schritt 2: delete().in("id", [nicht-ausgefallene])
    expect(calls[1].method).toBe("delete");
    expect(calls[1].filters).toEqual([{ op: "in", col: "id", val: ["c1", "c3"] }]);
  });

  it("behält Karten mit eigenem Status (nicht nur ausgefallene) — nur null/'geplant' wird ersetzt", async () => {
    const calls: { method?: string; filters: unknown }[] = [];
    fakeClient.handlers.plan_cards = (c) => {
      calls.push({ method: c.method, filters: c.filters });
      if (c.method === "delete") return { data: null, error: null };
      return {
        data: [
          { id: "c1", status: null },
          { id: "c2", status: "geplant" },
          { id: "c3", status: "erledigt" },
          { id: "c4", status: "ausgefallen" },
        ],
        error: null,
      };
    };
    const res = await deleteFuturePlanCardsForPlan("plan-9", "2026-09-03");
    expect(res).toEqual({ ok: true, deleted: 2 });
    expect(calls[1].filters).toEqual([{ op: "in", col: "id", val: ["c1", "c2"] }]);
  });

  it("löscht nichts, wenn nur ausgefallene/keine künftigen Karten übrig sind", async () => {
    let deleteCalled = false;
    fakeClient.handlers.plan_cards = (c) => {
      if (c.method === "delete") {
        deleteCalled = true;
        return { data: null, error: null };
      }
      return { data: [{ id: "c2", status: "ausgefallen" }], error: null };
    };
    expect(await deleteFuturePlanCardsForPlan("plan-9", "2026-09-03")).toEqual({
      ok: true,
      deleted: 0,
    });
    expect(deleteCalled).toBe(false);
  });

  it("löscht IDs blockweise (max 100 pro .in()) für lange Pläne", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `c${i}`);
    const inCalls: number[] = [];
    fakeClient.handlers.plan_cards = (c) => {
      if (c.method === "delete") {
        const f = c.filters.find((x) => x.op === "in");
        inCalls.push((f?.val as string[]).length);
        return { data: null, error: null };
      }
      return { data: ids.map((id) => ({ id, status: null })), error: null };
    };
    const res = await deleteFuturePlanCardsForPlan("plan-9", "2026-09-03");
    expect(res).toEqual({ ok: true, deleted: 230 });
    expect(inCalls).toEqual([100, 100, 30]);
  });
});

describe("deleteFuturePlanlessPlanCards", () => {
  it("filtert auf athlete_id + plan_id IS NULL + planned_date >= from", async () => {
    const calls: { method?: string; filters: unknown }[] = [];
    fakeClient.handlers.plan_cards = (c) => {
      calls.push({ method: c.method, filters: c.filters });
      if (c.method === "delete") return { data: null, error: null };
      return { data: [{ id: "t1", status: null }], error: null };
    };
    const res = await deleteFuturePlanlessPlanCards("prof-a", "2026-09-03");
    expect(res).toEqual({ ok: true, deleted: 1 });
    expect(calls[0].filters).toEqual([
      { op: "eq", col: "athlete_id", val: "prof-a" },
      { op: "is", col: "plan_id", val: null },
      { op: "gte", col: "planned_date", val: "2026-09-03" },
    ]);
    expect(calls[1].filters).toEqual([{ op: "in", col: "id", val: ["t1"] }]);
  });
});

describe("deletePlanCardsForPlan", () => {
  it("löscht per plan_id-Filter in einem Aufruf", async () => {
    let seen: { method?: string; filters: unknown } | undefined;
    fakeClient.handlers.plan_cards = (c) => {
      seen = { method: c.method, filters: c.filters };
      return { data: null, error: null };
    };
    const res = await deletePlanCardsForPlan("plan-9");
    expect(res.ok).toBe(true);
    expect(seen?.method).toBe("delete");
    expect(seen?.filters).toEqual([{ op: "eq", col: "plan_id", val: "plan-9" }]);
  });
});
