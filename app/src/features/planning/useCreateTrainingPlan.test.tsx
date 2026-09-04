/* Tests: features/planning/useCreateTrainingPlan.ts — die Schreib-Reihenfolge
 * (Fahrplan 8 E6) und der Best-Effort-Rückbau bei Teilausfall. Alles ab
 * api/supabase/* ist gemockt; die Orchestrierung im Hook läuft echt. */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../api/types";

const calls: string[] = [];
let listActiveResult: Result<{ plan: { id: string } | null }> = { ok: true, plan: null };
let activateResult: Result<{ plan: unknown }> = { ok: true, plan: {} };

vi.mock("../../api/hooks/useAthleteProfileId", () => ({
  fetchAthleteProfileId: async () => "prof-a",
}));

vi.mock("../../api/supabase/events", () => ({
  createEvent: async () => {
    calls.push("createEvent");
    return { ok: true, event: { id: "ev-new" } };
  },
  removeEvent: async () => {
    calls.push("removeEvent");
    return { ok: true };
  },
}));

vi.mock("../../api/supabase/training-plans", () => ({
  listActiveTrainingPlan: async () => {
    calls.push("listActive");
    return listActiveResult;
  },
  createTrainingPlan: async () => {
    calls.push("createTrainingPlan");
    return { ok: true, plan: { id: "new-1" } };
  },
  setTrainingPlanActive: async (id: string, active: boolean) => {
    calls.push(`setActive(${id},${active})`);
    return active ? activateResult : { ok: true, plan: {} };
  },
  deleteTrainingPlan: async (id: string) => {
    calls.push(`deleteTrainingPlan(${id})`);
    return { ok: true };
  },
}));

vi.mock("../../api/supabase/plan-cards", () => ({
  createPlanCards: async (_a: string, planId: string) => {
    calls.push(`createPlanCards(${planId})`);
    return { ok: true, cards: [] };
  },
  deleteFuturePlanCardsForPlan: async (planId: string) => {
    calls.push(`deleteFuturePlanCardsForPlan(${planId})`);
    return { ok: true, deleted: 0 };
  },
  deleteFuturePlanlessPlanCards: async () => {
    calls.push("deleteFuturePlanlessPlanCards");
    return { ok: true, deleted: 0 };
  },
  deletePlanCardsForPlan: async (planId: string) => {
    calls.push(`deletePlanCardsForPlan(${planId})`);
    return { ok: true, deleted: 0 };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useCreateTrainingPlan } = await import("./useCreateTrainingPlan");

const generated = {
  weeks: [
    {
      index: 0,
      isoWeek: "2026-KW37",
      start: "2026-09-07",
      end: "2026-09-13",
      phase: "Grundlage",
      targetTss: 300,
      isRecovery: false,
      cards: [
        {
          date: "2026-09-08",
          name: "Z2",
          typ: "Z2 Dauer",
          phase: "Grundlage",
          isoWeek: "2026-KW37",
          tssPlanned: 50,
          durationMin: 60,
          km: null,
          workout: null,
          workoutStructure: null,
          isQuality: false,
          isTest: false,
        },
      ],
    },
  ],
  weekModel: [{ week: "2026-KW37", phase: "Grundlage", trainingWeekdays: [2] }],
  ftpTarget: 210,
  warnings: [],
};

const input = {
  startDate: "2026-09-07",
  mode: "open" as const,
  weeks: 1,
  trainingWeekdays: [2],
  weeklyHours: 6,
  currentFtp: 193,
  ftpMeasuredDate: null,
  ftpTarget: null,
  indoorShare: 0.4,
  focus: "allgemein" as const,
  level: "fortgeschritten" as const,
  model: "linear" as const,
};

const form = {
  mode: "open" as const,
  eventId: "",
  newEventDate: "",
  newEventName: "",
  weeks: 1,
  startDate: "2026-09-07",
  trainingWeekdays: [2],
  weeklyHours: 6,
  currentFtp: 193,
  ftpMeasuredDate: null,
  ftpTarget: null,
  indoorPct: 40,
  focus: "allgemein" as const,
  level: "fortgeschritten" as const,
  model: "linear" as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const args = { generated, input, form, createdBy: "prof-a" } as any;

function setup() {
  const { wrapper } = createHarness({ userId: "prof-a" });
  return renderHook(() => useCreateTrainingPlan("athlete1"), { wrapper });
}

beforeEach(() => {
  calls.length = 0;
  listActiveResult = { ok: true, plan: null };
  activateResult = { ok: true, plan: {} };
});

describe("useCreateTrainingPlan", () => {
  it("Erstlauf ohne aktiven Plan: Zeile → Karten → planlose Vorlagen weg → scharf schalten", async () => {
    const { result } = setup();
    const res = await result.current.createPlan(args);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      "listActive",
      "createTrainingPlan",
      "createPlanCards(new-1)",
      "deleteFuturePlanlessPlanCards",
      "setActive(new-1,true)",
    ]);
  });

  it("mit aktivem Alt-Plan: dessen Zukunftskarten weg, deaktivieren, dann neuen scharf schalten", async () => {
    listActiveResult = { ok: true, plan: { id: "old-9" } };
    const { result } = setup();
    const res = await result.current.createPlan(args);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      "listActive",
      "createTrainingPlan",
      "createPlanCards(new-1)",
      "deleteFuturePlanCardsForPlan(old-9)",
      "deleteFuturePlanlessPlanCards",
      "setActive(old-9,false)",
      "setActive(new-1,true)",
    ]);
  });

  it("bricht vor jedem Schreibzugriff ab, wenn der Alt-Plan-Read scheitert", async () => {
    listActiveResult = { ok: false, error: { code: "UNKNOWN", message: "read kaputt" } };
    const { result } = setup();
    const res = await result.current.createPlan(args);
    expect(res.ok).toBe(false);
    expect(calls).toEqual(["listActive"]);
  });

  it("Rollback: scheitert das Scharfschalten, werden neue Karten + Zeile entfernt und der Alt-Plan reaktiviert", async () => {
    listActiveResult = { ok: true, plan: { id: "old-9" } };
    activateResult = { ok: false, error: { code: "UNKNOWN", message: "unique index" } };
    const { result } = setup();
    const res = await result.current.createPlan(args);
    expect(res.ok).toBe(false);
    expect(calls).toEqual([
      "listActive",
      "createTrainingPlan",
      "createPlanCards(new-1)",
      "deleteFuturePlanCardsForPlan(old-9)",
      "deleteFuturePlanlessPlanCards",
      "setActive(old-9,false)",
      "setActive(new-1,true)",
      "setActive(old-9,true)",
      "deletePlanCardsForPlan(new-1)",
      "deleteTrainingPlan(new-1)",
    ]);
  });
});
