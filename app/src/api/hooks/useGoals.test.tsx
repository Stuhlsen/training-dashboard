/* Tests: die Goals-Hooks (Settings, Etappe 9) — session-gebunden wie
 * useFtpHistory, nicht Athleten-Toggle-gebunden. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal, GoalInput } from "../types";

let stored: Record<string, Goal[]> = {};
let saveCalls: Array<{ athleteId: string; goal: GoalInput }> = [];
let deactivateCalls: string[] = [];
let replaceCalls: Array<{ athleteId: string; oldGoalId: string | null; goal: GoalInput }> = [];
let replaceResult: { ok: true; id: string } | { ok: false; error: { code: "UNKNOWN"; message: string } } = {
  ok: true,
  id: "goal-replaced",
};

vi.mock("../supabase/goals", () => ({
  replaceGoal: async (athleteId: string, oldGoalId: string | null, goal: GoalInput) => {
    replaceCalls.push({ athleteId, oldGoalId, goal });
    return replaceResult;
  },
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
const { useGoals, useSaveGoal, useDeactivateGoal, useReplaceGoal } = await import("./useGoals");

beforeEach(() => {
  stored = {};
  saveCalls = [];
  deactivateCalls = [];
  replaceCalls = [];
  replaceResult = { ok: true, id: "goal-replaced" };
});

describe("useGoals", () => {
  it("lädt die aktiven Ziele des eingeloggten Profils", async () => {
    stored["athlete-1"] = [{ id: "g1", kind: "ftp", targetValue: 210, targetDate: null, note: null, isActive: true, goalKey: null, role: null }];
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
    stored["athlete-1"] = [{ id: "g1", kind: "ftp", targetValue: 210, targetDate: null, note: null, isActive: true, goalKey: null, role: null }];
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

describe("useReplaceGoal", () => {
  const goal: GoalInput = { kind: "FTP", goalKey: "ftp", role: "main", targetValue: 280 };

  it("ersetzt das alte Ziel unter der eingeloggten Profil-ID und lädt die Ziele neu", async () => {
    stored["athlete-1"] = [{ id: "g-old", kind: "Ausdauer", targetValue: null, targetDate: null, note: null, isActive: true, goalKey: "ausdauer", role: "main" }];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const goalsView = renderHook(() => useGoals(), { wrapper });
    await waitFor(() => expect(goalsView.result.current.goals).toHaveLength(1));

    stored["athlete-1"] = [{ id: "goal-replaced", kind: "FTP", targetValue: 280, targetDate: null, note: null, isActive: true, goalKey: "ftp", role: "main" }];
    const view = renderHook(() => useReplaceGoal(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.replace("g-old", goal);
    });
    expect(result).toEqual({ ok: true, id: "goal-replaced" });
    expect(replaceCalls).toEqual([{ athleteId: "athlete-1", oldGoalId: "g-old", goal }]);
    await waitFor(() => expect(goalsView.result.current.goals[0]?.id).toBe("goal-replaced"));
  });

  it("ohne altes Ziel (Rolle frei) wird oldGoalId = null durchgereicht", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useReplaceGoal(), { wrapper });
    await act(async () => {
      await view.result.current.replace(null, goal);
    });
    expect(replaceCalls[0].oldGoalId).toBeNull();
  });

  it("Fehler aus dem Adapter kommt als Result.ok=false an (Fehlerfall)", async () => {
    replaceResult = { ok: false, error: { code: "UNKNOWN", message: "insert kaputt" } };
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useReplaceGoal(), { wrapper });
    let result: { ok: boolean; error?: { message: string } } | undefined;
    await act(async () => {
      result = await view.result.current.replace("g-old", goal);
    });
    expect(result?.ok).toBe(false);
    expect(result?.error?.message).toContain("insert kaputt");
  });

  it("lädt die Ziele auch nach einem Fehler neu (Zustand kann sich geändert haben)", async () => {
    stored["athlete-1"] = [];
    const { wrapper, queryClient } = createHarness({ userId: "athlete-1" });
    const goalsView = renderHook(() => useGoals(), { wrapper });
    await waitFor(() => expect(goalsView.result.current.isLoading).toBe(false));
    replaceResult = { ok: false, error: { code: "UNKNOWN", message: "boom" } };
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const view = renderHook(() => useReplaceGoal(), { wrapper });
    await act(async () => {
      await view.result.current.replace("g-old", goal);
    });
    expect(spy).toHaveBeenCalled();
  });

  it("ohne Session -> Fehler, kein Aufruf", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useReplaceGoal(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.replace("g-old", goal);
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(replaceCalls).toEqual([]);
  });
});
