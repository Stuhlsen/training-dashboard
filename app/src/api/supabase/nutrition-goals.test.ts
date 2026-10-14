/* Tests: api/supabase/nutrition-goals.ts — Result-Konvention wie goals.ts.
 * getActiveNutritionGoal: newest row, null when none, error forwarding.
 * addNutritionGoal: validation on app layer (pace for lose/gain, NaN,
 * target_weight_kg > 0). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getActiveNutritionGoal, addNutritionGoal } = await import("./nutrition-goals");

describe("getActiveNutritionGoal", () => {
  it("gibt das neueste Ziel zurück (absteigend created_at, limit 1)", async () => {
    let seenQuery: Record<string, unknown> = {};
    fakeClient.handlers.nutrition_goals = (calls) => {
      seenQuery = { table: calls.table, filters: calls.filters, order: calls.order, limit: calls.limit };
      return {
        data: {
          id: "goal-2",
          profile_id: "profile-1",
          goal_type: "lose",
          target_weight_kg: 75,
          pace_per_week_kg: 0.5,
          target_date: "2026-12-31",
          created_at: "2026-10-07T12:00:00Z",
        },
        error: null,
      };
    };
    const result = await getActiveNutritionGoal("profile-1");
    expect(result).toEqual({
      ok: true,
      goal: {
        id: "goal-2",
        profileId: "profile-1",
        goalType: "lose",
        targetWeightKg: 75,
        pacePerWeekKg: 0.5,
        targetDate: "2026-12-31",
        createdAt: "2026-10-07T12:00:00Z",
      },
    });
    expect(seenQuery.table).toBe("nutrition_goals");
    expect(seenQuery.order).toEqual({ col: "created_at", ascending: false });
  });

  it("gibt null zurück, wenn keine Zeile existiert", async () => {
    fakeClient.handlers.nutrition_goals = () => ({ data: null, error: null });
    const result = await getActiveNutritionGoal("profile-2");
    expect(result).toEqual({ ok: true, goal: null });
  });

  it("gibt Fehler bei DB-Fehler weiter", async () => {
    fakeClient.handlers.nutrition_goals = () => ({ data: null, error: { message: "connection lost", code: "PGRST301" } });
    const result = await getActiveNutritionGoal("profile-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNKNOWN");
    }
  });
});

describe("addNutritionGoal", () => {
  it("legt ein maintain-Ziel an (kein pace nötig)", async () => {
    let seenInsert: Record<string, unknown> = {};
    fakeClient.handlers.nutrition_goals = (calls) => {
      seenInsert = { payload: calls.payload };
      return { data: { id: "goal-new" }, error: null };
    };
    const result = await addNutritionGoal("profile-1", { goalType: "maintain" });
    expect(result).toEqual({ ok: true, id: "goal-new" });
    expect(seenInsert).toEqual({ payload: { profile_id: "profile-1", goal_type: "maintain", target_weight_kg: null, pace_per_week_kg: null, target_date: null } });
  });

  it("lehnt lose ohne pace ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "lose" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
      expect(result.error.message).toContain("erforderlich");
    }
  });

  it("lehnt lose mit pace <= 0 ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "lose", pacePerWeekKg: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
    }
  });

  it("lehnt lose mit negativem pace ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "lose", pacePerWeekKg: -0.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
    }
  });

  it("lehnt gain ohne pace ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "gain" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
    }
  });

  it("erlaubt maintain mit targetWeightKg ohne pace", async () => {
    fakeClient.handlers.nutrition_goals = () => ({ data: { id: "goal-m" }, error: null });
    const result = await addNutritionGoal("profile-1", { goalType: "maintain", targetWeightKg: 70 });
    expect(result).toEqual({ ok: true, id: "goal-m" });
  });

  it("lehnt NaN als target_weight_kg ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "maintain", targetWeightKg: Number("") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
    }
  });

  it("lehnt NaN als pace_per_week_kg ab", async () => {
    const result = await addNutritionGoal("profile-1", { goalType: "lose", pacePerWeekKg: Number("") });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("SCHEMA");
    }
  });
});