/* Tests: features/planning/useRecomputeRemainingPlan.ts — Fahrplan 8 E13.
   Schreib-Reihenfolge (löschen → einfügen → Plan-Zeile patchen → invalidieren)
   und die Fehlermeldung, wenn nach dem Löschen etwas abbricht. Adapter
   gemockt, Orchestrierung echt. */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../api/types";

const calls: string[] = [];
let createCardsResult: Result<{ cards: unknown[] }> = { ok: true, cards: [] };

vi.mock("../../api/hooks/useAthleteProfileId", () => ({
  fetchAthleteProfileId: async () => "prof-a",
}));

vi.mock("../../api/supabase/plan-cards", () => ({
  deleteFuturePlanCardsForPlan: async (planId: string, from: string) => {
    calls.push(`deleteFuture(${planId},${from})`);
    return { ok: true, deleted: 3 };
  },
  createPlanCards: async (_a: string, planId: string, cards: unknown[]) => {
    calls.push(`createPlanCards(${planId},n=${cards.length})`);
    return createCardsResult;
  },
}));

vi.mock("../../api/supabase/training-plans", () => ({
  updateTrainingPlan: async (id: string) => {
    calls.push(`updateTrainingPlan(${id})`);
    return { ok: true, plan: { id } };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useRecomputeRemainingPlan } = await import("./useRecomputeRemainingPlan");

const activePlan = { id: "tp1", params: { form: { weeks: 8 } } };

const generated = {
  weeks: [
    { index: 0, isoWeek: "2026-KW37", start: "2026-09-07", end: "2026-09-13", phase: "Grundlage", targetTss: 300, isRecovery: false, cards: [] },
    {
      index: 1,
      isoWeek: "2026-KW41",
      start: "2026-10-05",
      end: "2026-10-11",
      phase: "Schwelle",
      targetTss: 380,
      isRecovery: false,
      cards: [
        {
          date: "2026-10-06",
          name: "Schwelle",
          typ: "Schwelle",
          phase: "Schwelle",
          isoWeek: "2026-KW41",
          tssPlanned: 70,
          durationMin: 75,
          km: null,
          workout: null,
          workoutStructure: null,
          isQuality: true,
          isTest: false,
        },
      ],
    },
  ],
  weekModel: [
    { week: "2026-KW37", phase: "Grundlage", start: "2026-09-07", end: "2026-09-13", trainingWeekdays: [2, 4, 6], targetTss: 300 },
    { week: "2026-KW41", phase: "Schwelle", start: "2026-10-05", end: "2026-10-11", trainingWeekdays: [2, 4, 6], targetTss: 380 },
  ],
  ftpTarget: 210,
  warnings: ["Restberechnung: CTL-Rampe am oberen Limit (6.4)."],
};

const input = {
  startDate: "2026-09-07",
  mode: "open" as const,
  trainingWeekdays: [2, 4, 6],
  weeklyHours: 6,
  currentFtp: 205,
  ftpMeasuredDate: "2026-09-30",
  ftpTarget: 210,
  indoorShare: 0.4,
  focus: "allgemein" as const,
  level: "fortgeschritten" as const,
  model: "pyramidal" as const,
  regenerateFrom: "2026-10-05",
  history: { weeklyActualTss: [380, 390, 400, 410] },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const args = { plan: activePlan, generated, input } as any;

function setup() {
  const { wrapper } = createHarness({ userId: "prof-a" });
  return renderHook(() => useRecomputeRemainingPlan("athlete2"), { wrapper });
}

beforeEach(() => {
  calls.length = 0;
  createCardsResult = { ok: true, cards: [] };
});

describe("useRecomputeRemainingPlan", () => {
  it("löscht Zukunft → schreibt nur Tail-Karten → patcht die Plan-Zeile", async () => {
    const { result } = setup();
    const res = await result.current.recompute(args);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      "deleteFuture(tp1,2026-10-05)",
      "createPlanCards(tp1,n=1)", // nur die eine Karte der nicht-eingefrorenen Woche
      "updateTrainingPlan(tp1)",
    ]);
  });

  it("bricht das Einfügen ab → Fehlermeldung weist auf entfernte Karten hin", async () => {
    createCardsResult = { ok: false, error: { code: "UNKNOWN", message: "insert kaputt" } };
    const { result } = setup();
    const res = await result.current.recompute(args);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toMatch(/insert kaputt/);
    expect(res.error.message).toMatch(/erneut ausführen/);
    expect(calls).toEqual(["deleteFuture(tp1,2026-10-05)", "createPlanCards(tp1,n=1)"]);
  });
});
