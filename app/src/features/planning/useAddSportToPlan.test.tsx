/* Tests: features/planning/useAddSportToPlan.ts — Schreibweg „Sportart
 * hinzufügen" (Fahrplan 44 E5). Alles ab api/supabase/* ist gemockt; die
 * Phasen aus plan-write-phases.ts laufen echt. Kernbeweis: am laufenden Plan
 * ändert sich höchstens seine Gruppe — nichts wird gelöscht oder umgeschaltet. */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../api/types";

const calls: string[] = [];
const drafts: Array<Record<string, unknown>> = [];
let activeRunPlan: string | null = null;
let failCards = false;
let failActivate = false;
let failSetGroup = false;

const ok = { ok: true } as const;
const fail = (message: string): Result<never> =>
  ({ ok: false, error: { code: "UNKNOWN", message } }) as Result<never>;

vi.mock("../../api/hooks/useAthleteProfileId", () => ({
  fetchAthleteProfileId: async () => "prof-a",
}));

vi.mock("../../api/supabase/events", () => ({
  createEvent: async () => ({ ok: true, event: { id: "ev" } }),
  removeEvent: async () => ok,
}));

vi.mock("../../api/supabase/training-plans", () => ({
  listActiveTrainingPlan: async (_p: string, sport: string) => {
    calls.push(`listActive(${sport})`);
    return { ok: true, plan: sport === "run" && activeRunPlan ? { id: activeRunPlan } : null };
  },
  createTrainingPlan: async (_p: string, _u: string, draft: Record<string, unknown>) => {
    calls.push(`createTrainingPlan(${draft.sport})`);
    drafts.push(draft);
    return { ok: true, plan: { id: `new-${draft.sport}` } };
  },
  setTrainingPlanActive: async (id: string, active: boolean) => {
    calls.push(`setActive(${id},${active})`);
    if (active && failActivate) return fail("unique index");
    return { ok: true, plan: {} };
  },
  setTrainingPlanGroup: async (id: string, group: string | null) => {
    calls.push(`setGroup(${id},${group})`);
    if (group !== null && failSetGroup) return fail("gruppe kaputt");
    return { ok: true, plan: {} };
  },
  deleteTrainingPlan: async (id: string) => {
    calls.push(`deleteTrainingPlan(${id})`);
    return ok;
  },
}));

vi.mock("../../api/supabase/plan-cards", () => ({
  createPlanCards: async (_a: string, planId: string) => {
    calls.push(`createPlanCards(${planId})`);
    return failCards ? fail("karten kaputt") : { ok: true, cards: [] };
  },
  deleteFuturePlanCardsForPlan: async (planId: string) => {
    calls.push(`deleteFuturePlanCardsForPlan(${planId})`);
    return { ok: true, deleted: 0 };
  },
  deleteFuturePlanlessPlanCards: async (_p: string, _d: string, sport: string) => {
    calls.push(`deleteFuturePlanlessPlanCards(${sport})`);
    return { ok: true, deleted: 0 };
  },
  deletePlanCardsForPlan: async (planId: string) => {
    calls.push(`deletePlanCardsForPlan(${planId})`);
    return { ok: true, deleted: 0 };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useAddSportToPlan } = await import("./useAddSportToPlan");

const generated = {
  weeks: [
    {
      index: 0,
      isoWeek: "2026-KW46",
      start: "2026-11-09",
      end: "2026-11-15",
      phase: "Grundlage",
      targetTss: 100,
      isRecovery: false,
      cards: [
        {
          date: "2026-11-09",
          name: "Z2",
          typ: "Z2 Dauer",
          phase: "Grundlage",
          isoWeek: "2026-KW46",
          tssPlanned: 40,
          durationMin: 40,
          km: null,
          workout: null,
          workoutStructure: null,
          isQuality: false,
          isTest: false,
        },
      ],
    },
  ],
  weekModel: [{ week: "2026-KW46", phase: "Grundlage", trainingWeekdays: [1] }],
  ftpTarget: null,
  warnings: [],
};

const baseForm = {
  mode: "open" as const,
  eventId: "",
  newEventDate: "",
  newEventName: "",
  weeks: 4,
  startDate: "2026-11-09",
  trainingWeekdays: [1, 3, 7],
  weeklyHours: 3,
  currentFtp: null,
  ftpMeasuredDate: null,
  ftpTarget: null,
  focus: "allgemein" as const,
  level: "einsteiger" as const,
  model: "linear" as const,
};

const runItem = {
  generated,
  input: { ...baseForm, sport: "run" as const },
  form: baseForm,
  createdBy: "prof-a",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ridePlan = (planGroupId: string | null): any => ({ id: "plan-ride", sport: "ride", planGroupId });

function setup() {
  const { wrapper } = createHarness({ userId: "prof-a" });
  return renderHook(() => useAddSportToPlan("athlete1"), { wrapper });
}

const groupOf = (c: string) => /^setGroup\(plan-ride,(.+)\)$/.exec(c)?.[1] ?? null;

beforeEach(() => {
  calls.length = 0;
  drafts.length = 0;
  activeRunPlan = null;
  failCards = false;
  failActivate = false;
  failSetGroup = false;
});

describe("useAddSportToPlan", () => {
  it("Erfolg ohne Gruppe: neuer Plan, Gruppe auf den Radplan, neuen Plan scharf — sonst nichts", async () => {
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(res.ok).toBe(true);
    const gid = groupOf(calls[3]);
    expect(gid).toEqual(expect.any(String));
    expect(calls).toEqual([
      "listActive(run)",
      "createTrainingPlan(run)",
      "createPlanCards(new-run)",
      `setGroup(plan-ride,${gid})`,
      "deleteFuturePlanlessPlanCards(run)",
      "setActive(new-run,true)",
    ]);
    expect(drafts[0].planGroupId).toBe(gid);
  });

  it("rührt Karten, Plan-Zeile und Sportart des laufenden Plans nie an", async () => {
    const { result } = setup();
    await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(calls.some((c) => c.startsWith("deleteFuturePlanCardsForPlan"))).toBe(false);
    expect(calls.some((c) => c.startsWith("deletePlanCardsForPlan(plan-ride"))).toBe(false);
    expect(calls.some((c) => c.startsWith("setActive(plan-ride"))).toBe(false);
    expect(calls.some((c) => c === "listActive(ride)")).toBe(false);
    expect(calls.some((c) => c.includes("deleteTrainingPlan(plan-ride"))).toBe(false);
    // einzige Berührung: die Gruppe
    expect(calls.filter((c) => c.includes("plan-ride"))).toHaveLength(1);
  });

  it("hat der laufende Plan schon eine Gruppe, nimmt der neue sie — der alte Plan wird gar nicht angefasst", async () => {
    const { result } = setup();
    await result.current.addSport({ runningPlans: [ridePlan("g-old")], item: runItem });
    expect(drafts[0].planGroupId).toBe("g-old");
    expect(calls.some((c) => c.startsWith("setGroup"))).toBe(false);
  });

  it("scheitert das Scharfschalten nach dem Setzen, geht die Gruppe wieder auf null", async () => {
    failActivate = true;
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(res.ok).toBe(false);
    expect(calls).toContain("setGroup(plan-ride,null)");
    expect(calls).toContain("deleteTrainingPlan(new-run)");
    expect(calls).toContain("deletePlanCardsForPlan(new-run)");
    // Radplan weder deaktiviert noch seine Karten gelöscht
    expect(calls.some((c) => c.startsWith("setActive(plan-ride"))).toBe(false);
    expect(calls.some((c) => c.startsWith("deleteFuturePlanCardsForPlan"))).toBe(false);
  });

  it("scheitert die Vorbereitung (Karten), wurde die Gruppe noch nicht gesetzt — kein Rückbau nötig", async () => {
    failCards = true;
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(res.ok).toBe(false);
    expect(calls.some((c) => c.startsWith("setGroup"))).toBe(false);
    expect(calls).toContain("deleteTrainingPlan(new-run)");
  });

  it("scheitert das Setzen der Gruppe selbst: Neues wird zurückgenommen, die Gruppe nicht zusätzlich auf null gesetzt", async () => {
    failSetGroup = true;
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(res.ok).toBe(false);
    expect(calls.filter((c) => c.startsWith("setGroup") && c.endsWith(",null)"))).toEqual([]);
    expect(calls).toContain("deleteTrainingPlan(new-run)");
  });

  it("scheitert etwas bei einem Plan MIT bestehender Gruppe, wird diese Gruppe nie gelöst", async () => {
    failActivate = true;
    const { result } = setup();
    await result.current.addSport({ runningPlans: [ridePlan("g-old")], item: runItem });
    expect(calls.some((c) => c.startsWith("setGroup"))).toBe(false);
  });

  it("läuft für die Sportart schon ein Plan, wird nichts geschrieben (kein Ersetzen)", async () => {
    activeRunPlan = "old-run";
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [ridePlan(null)], item: runItem });
    expect(res.ok).toBe(false);
    expect(calls).toEqual(["listActive(run)"]);
  });

  it("ohne laufenden Plan wird nichts geschrieben", async () => {
    const { result } = setup();
    const res = await result.current.addSport({ runningPlans: [], item: runItem });
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
