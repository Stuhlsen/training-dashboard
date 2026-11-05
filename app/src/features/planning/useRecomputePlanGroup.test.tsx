/* Tests: features/planning/useRecomputePlanGroup.ts — Fahrplan 44 E6.
   Der Hook reicht nur die betroffenen Pläne an den Schreibweg weiter, schreibt
   bei einem Rechenfehler gar nicht, und hängt Login-Prüfung + Cache-Invalidierung
   an. Der Schreibweg selbst ist in group-recompute-write.test.ts geprüft. */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];

vi.mock("../../api/hooks/useAthleteProfileId", () => ({
  fetchAthleteProfileId: async () => "prof-a",
}));

vi.mock("../../api/supabase/plan-cards", () => ({
  listReplaceablePlanCardsForPlan: async (planId: string) => {
    calls.push(`list(${planId})`);
    return { ok: true, cards: [] };
  },
  deleteFuturePlanCardsForPlan: async (planId: string) => {
    calls.push(`delete(${planId})`);
    return { ok: true, deleted: 0 };
  },
  createPlanCards: async (_p: string, planId: string) => {
    calls.push(`create(${planId})`);
    return { ok: true, cards: [] };
  },
}));

vi.mock("../../api/supabase/training-plans", () => ({
  updateTrainingPlan: async (planId: string) => {
    calls.push(`update(${planId})`);
    return { ok: true, plan: { id: planId } };
  },
  restoreTrainingPlanValues: async (planId: string) => {
    calls.push(`restoreRow(${planId})`);
    return { ok: true, plan: { id: planId } };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useRecomputePlanGroup } = await import("./useRecomputePlanGroup");

const card = (date: string) => ({
  date,
  name: "x",
  typ: "Z2",
  phase: "G",
  isoWeek: "k",
  tssPlanned: 10,
  durationMin: 30,
  km: null,
  workout: null,
  workoutStructure: null,
  isQuality: false,
  isTest: false,
});

function item(sport: "ride" | "run", affected: boolean) {
  return {
    sport,
    selected: true,
    affected,
    weeklyHours: 3,
    droppedFixedWeekdays: [],
    plan: { id: `plan-${sport}`, sport, weekModel: [], trainingWeekdays: [1], params: {} },
    ...(affected
      ? {
          generated: { weeks: [{ start: "2026-10-05", cards: [card("2026-10-08")] }], weekModel: [], warnings: [] },
          patch: { weekModel: [], params: {}, trainingWeekdays: [1, 3] },
        }
      : {}),
  };
}

const okBuild = (items: ReturnType<typeof item>[]) =>
  ({
    ok: true,
    items,
    replaceFrom: "2026-10-07",
    affectedSports: items.filter((i) => i.affected).map((i) => i.sport),
  }) as never;

function setup(userId: string | null = "prof-a") {
  const { wrapper, queryClient } = createHarness({ userId });
  const spy = vi.spyOn(queryClient, "invalidateQueries");
  const hook = renderHook(() => useRecomputePlanGroup("athlete2"), { wrapper });
  return { ...hook, spy };
}

beforeEach(() => {
  calls.length = 0;
});

describe("useRecomputePlanGroup", () => {
  it("schreibt nur die betroffenen Pläne — eine abgewählte oder unberührte Sportart bekommt keinen Aufruf", async () => {
    const { result } = setup();
    const res = await result.current.recomputeGroup(okBuild([item("ride", false), item("run", true)]));
    expect(res.ok).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.includes("plan-run"))).toBe(true);
    expect(calls.some((c) => c.includes("plan-ride"))).toBe(false);
  });

  it("ein Rechenfehler (build nicht ok) schreibt nichts und gibt die Meldung zurück", async () => {
    const { result } = setup();
    const res = await result.current.recomputeGroup({ ok: false, reason: "Laufen: kaputt" } as never);
    expect(res).toEqual({ ok: false, error: { code: "VALIDATION", message: "Laufen: kaputt" } });
    expect(calls).toEqual([]);
  });

  it("ohne Login: Fehler, kein Schreibaufruf", async () => {
    const { result } = setup(null);
    const res = await result.current.recomputeGroup(okBuild([item("run", true)]));
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("invalidiert Karten, aktive Pläne aller Sportarten und die Gruppe", async () => {
    const { result, spy } = setup();
    await result.current.recomputeGroup(okBuild([item("run", true)]));
    const keys = spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys.some((k) => k.includes("plan-cards"))).toBe(true);
    for (const s of ["ride", "run", "swim"]) {
      expect(keys.some((k) => k.includes("active-training-plan") && k.includes(s))).toBe(true);
    }
    expect(keys.some((k) => k.includes("plan-group"))).toBe(true);
  });
});
