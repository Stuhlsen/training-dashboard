/* Tests: api/supabase/goals.ts — Port von data-access/supabase/goals.js
 * (Vanilla), bisher unportiert. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getGoals, saveGoal, deactivateGoal } = await import("./goals");

describe("getGoals", () => {
  it("mappt nur aktive Ziele, älteste zuerst", async () => {
    let filters: unknown[] = [];
    let order: unknown;
    fakeClient.handlers.goals = (calls) => {
      filters = calls.filters;
      order = calls.order;
      return {
        data: [{ id: "g1", kind: "ftp", target_value: 210, target_date: "2026-09-19", note: null, is_active: true }],
        error: null,
      };
    };
    const result = await getGoals("athlete-1");
    expect(result).toEqual({
      ok: true,
      goals: [{ id: "g1", kind: "ftp", targetValue: 210, targetDate: "2026-09-19", note: null, isActive: true }],
    });
    expect(filters).toEqual([
      { op: "eq", col: "athlete_id", val: "athlete-1" },
      { op: "eq", col: "is_active", val: true },
    ]);
    expect(order).toEqual({ col: "created_at", ascending: true });
  });
});

describe("saveGoal", () => {
  it("legt ein neues Ziel für den Athleten an", async () => {
    let payload: Record<string, unknown> = {};
    fakeClient.handlers.goals = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: { id: "g2" }, error: null };
    };
    const result = await saveGoal("athlete-1", { kind: "ftp", targetValue: 210, targetDate: "2026-09-19", note: null });
    expect(result).toEqual({ ok: true, id: "g2" });
    expect(payload).toEqual({
      athlete_id: "athlete-1",
      kind: "ftp",
      target_value: 210,
      target_date: "2026-09-19",
      note: null,
    });
  });
});

describe("deactivateGoal", () => {
  it("setzt is_active=false statt zu löschen", async () => {
    let payload: Record<string, unknown> = {};
    let filters: unknown[] = [];
    fakeClient.handlers.goals = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      filters = calls.filters;
      return { data: null, error: null };
    };
    const result = await deactivateGoal("g1");
    expect(result).toEqual({ ok: true });
    expect(payload).toEqual({ is_active: false });
    expect(filters).toEqual([{ op: "eq", col: "id", val: "g1" }]);
  });
});
