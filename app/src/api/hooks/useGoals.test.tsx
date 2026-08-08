/* Tests: die Goals-Hooks (Settings, Etappe 9) — session-gebunden wie
 * useFtpHistory, nicht Athleten-Toggle-gebunden. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal, GoalInput } from "../types";

let stored: Record<string, Goal[]> = {};
let saveCalls: Array<{ athleteId: string; goal: GoalInput }> = [];
let deactivateCalls: string[] = [];

vi.mock("../supabase/goals", () => ({
  getGoals: async (athleteId: string) => ({ ok: true, goals: stored[athleteId] ?? [] }),
  saveGoal: async (athleteId: string, goal: GoalInput) => {
    saveCalls.push({ athleteId, goal });
    return { ok: true, id: "goal-new" };
  },
  deactivateGoal: async (goalId: string) => {
    deactivateCalls.push(goalId);
    return { ok: true };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useGoals, useSaveGoal, useDeactivateGoal } = await import("./useGoals");

beforeEach(() => {
  stored = {};
  saveCalls = [];
  deactivateCalls = [];
});

describe("useGoals", () => {
  it("lädt die aktiven Ziele des eingeloggten Profils", async () => {
    stored["athlete-1"] = [{ id: "g1", kind: "ftp", targetValue: 210, targetDate: null, note: null, isActive: true }];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useGoals(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.goals).toEqual(stored["athlete-1"]);
  });

  it("ohne Session -> leeres Array, kein Ladeversuch", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useGoals(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.goals).toEqual([]);
  });
});

describe("useSaveGoal", () => {
  it("legt ein Ziel unter der eingeloggten Profil-ID an", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useSaveGoal(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.save({ kind: "ftp", targetValue: 210 });
    });
    expect(result).toEqual({ ok: true, id: "goal-new" });
    expect(saveCalls).toEqual([{ athleteId: "athlete-1", goal: { kind: "ftp", targetValue: 210 } }]);
  });

  it("ohne Session -> Fehler, kein Aufruf", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSaveGoal(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.save({ kind: "ftp", targetValue: 210 });
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(saveCalls).toEqual([]);
  });
});

describe("useDeactivateGoal", () => {
  it("entfernt das Ziel aus dem Cache, statt es zu löschen", async () => {
    stored["athlete-1"] = [{ id: "g1", kind: "ftp", targetValue: 210, targetDate: null, note: null, isActive: true }];
    const { wrapper, queryClient } = createHarness({ userId: "athlete-1" });
    const goalsView = renderHook(() => useGoals(), { wrapper });
    await waitFor(() => expect(goalsView.result.current.isLoading).toBe(false));

    const deactivateView = renderHook(() => useDeactivateGoal(), { wrapper });
    await act(async () => {
      await deactivateView.result.current.deactivate("g1");
    });
    expect(deactivateCalls).toEqual(["g1"]);
    expect(queryClient.getQueryData(["goals", "athlete-1"])).toEqual([]);
  });
});
