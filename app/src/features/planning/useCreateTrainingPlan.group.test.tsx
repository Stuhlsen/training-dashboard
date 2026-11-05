/* Tests: features/planning/useCreateTrainingPlan.ts — mehrere Sportarten in
 * einem Lauf (Fahrplan 44 E4). Zwei Phasen: erst ALLE vorbereiten (nichts
 * Bestehendes wird angefasst), dann scharf schalten. Alles ab api/supabase/*
 * ist gemockt; die Orchestrierung im Hook läuft echt. */

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Result } from "../../api/types";

const calls: string[] = [];
const drafts: Array<Record<string, unknown>> = [];
/** Sportart der geschriebenen Karten je neuer Plan-ID. */
const cardSports: Record<string, string[]> = {};
/** Alt-Pläne je Sportart (fehlt ⇒ keiner). */
let oldPlans: Record<string, string> = {};
/** Schalter, an welcher Stelle der Lauf scheitern soll. */
let failCreatePlanFor: string | null = null;
let failCardsFor: string | null = null;
let failActivateFor: string | null = null;
let failDeleteFor: string | null = null;

const ok = { ok: true } as const;
const fail = (message: string): Result<never> =>
  ({ ok: false, error: { code: "UNKNOWN", message } }) as Result<never>;

vi.mock("../../api/hooks/useAthleteProfileId", () => ({
  fetchAthleteProfileId: async () => "prof-a",
}));

vi.mock("../../api/supabase/events", () => ({
  createEvent: async () => {
    calls.push("createEvent");
    return { ok: true, event: { id: "ev-new" } };
  },
  removeEvent: async (id: string) => {
    calls.push(`removeEvent(${id})`);
    return ok;
  },
}));

vi.mock("../../api/supabase/training-plans", () => ({
  listActiveTrainingPlan: async (_p: string, sport: string) => {
    calls.push(`listActive(${sport})`);
    return { ok: true, plan: oldPlans[sport] ? { id: oldPlans[sport] } : null };
  },
  createTrainingPlan: async (_p: string, _u: string, draft: Record<string, unknown>) => {
    const sport = draft.sport as string;
    calls.push(`createTrainingPlan(${sport})`);
    drafts.push(draft);
    if (failCreatePlanFor === sport) return fail("plan kaputt");
    return { ok: true, plan: { id: `new-${sport}` } };
  },
  setTrainingPlanActive: async (id: string, active: boolean) => {
    calls.push(`setActive(${id},${active})`);
    if (active && failActivateFor && id === `new-${failActivateFor}`) return fail("unique index");
    return { ok: true, plan: {} };
  },
  deleteTrainingPlan: async (id: string) => {
    calls.push(`deleteTrainingPlan(${id})`);
    if (failDeleteFor && id === `new-${failDeleteFor}`) return fail("löschen kaputt");
    return ok;
  },
}));

vi.mock("../../api/supabase/plan-cards", () => ({
  createPlanCards: async (_a: string, planId: string, cards: Array<{ sport?: string }>) => {
    calls.push(`createPlanCards(${planId})`);
    cardSports[planId] = cards.map((c) => c.sport ?? "—");
    if (failCardsFor && planId === `new-${failCardsFor}`) return fail("karten kaputt");
    return { ok: true, cards: [] };
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

const baseForm = {
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
  focus: "allgemein" as const,
  level: "fortgeschritten" as const,
  model: "linear" as const,
};

const baseInput = {
  startDate: "2026-09-07",
  mode: "open" as const,
  weeks: 1,
  trainingWeekdays: [2],
  weeklyHours: 6,
  currentFtp: 193,
  ftpMeasuredDate: null,
  ftpTarget: null,
  focus: "allgemein" as const,
  level: "fortgeschritten" as const,
  model: "linear" as const,
};

function item(sport: "ride" | "run" | "swim", form: Record<string, unknown> = {}) {
  return {
    generated,
    input: { ...baseInput, sport },
    form: { ...baseForm, ...form },
    createdBy: "prof-a",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function setup() {
  const { wrapper } = createHarness({ userId: "prof-a" });
  return renderHook(() => useCreateTrainingPlan("athlete1"), { wrapper });
}

/** Alles, was Bestehendes löscht oder umschaltet. */
const touchesExisting = (c: string) => c.startsWith("deleteFuture") || c.startsWith("setActive(");

beforeEach(() => {
  calls.length = 0;
  drafts.length = 0;
  for (const k of Object.keys(cardSports)) delete cardSports[k];
  oldPlans = {};
  failCreatePlanFor = null;
  failCardsFor = null;
  failActivateFor = null;
  failDeleteFor = null;
});

describe("useCreateTrainingPlan — createPlans (mehrere Sportarten)", () => {
  it("Erfolg: erst alle vorbereiten, dann alle scharf schalten", async () => {
    oldPlans = { ride: "old-ride", run: "old-run" };
    const { result } = setup();
    const res = await result.current.createPlans([item("ride"), item("run")]);
    expect(res.ok).toBe(true);
    expect(calls).toEqual([
      "listActive(ride)",
      "listActive(run)",
      "createTrainingPlan(ride)",
      "createPlanCards(new-ride)",
      "createTrainingPlan(run)",
      "createPlanCards(new-run)",
      // ab hier Phase „Scharfschalten"
      "deleteFuturePlanCardsForPlan(old-ride)",
      "deleteFuturePlanlessPlanCards(ride)",
      "setActive(old-ride,false)",
      "setActive(new-ride,true)",
      "deleteFuturePlanCardsForPlan(old-run)",
      "deleteFuturePlanlessPlanCards(run)",
      "setActive(old-run,false)",
      "setActive(new-run,true)",
    ]);
    if (res.ok) expect(res.planIds).toEqual(["new-ride", "new-run"]);
  });

  it("alle Pläne tragen dieselbe plan_group_id", async () => {
    const { result } = setup();
    await result.current.createPlans([item("ride"), item("run")]);
    const ids = drafts.map((d) => d.planGroupId);
    expect(ids[0]).toEqual(expect.any(String));
    expect(ids[0]).toBe(ids[1]);
  });

  it("schreibt die Karten mit der Sportart ihres Plans (sonst stünden Lauf-Karten als Rad im Kalender)", async () => {
    const { result } = setup();
    await result.current.createPlans([item("ride"), item("run")]);
    expect(cardSports["new-ride"]).toEqual(["ride"]);
    expect(cardSports["new-run"]).toEqual(["run"]);
  });

  it("legt ein neues Event nur einmal an und teilt es unter den Plänen", async () => {
    const formWithEvent = { mode: "event", newEventDate: "2026-12-01", newEventName: "Rennen" };
    const { result } = setup();
    await result.current.createPlans([item("ride", formWithEvent), item("run", formWithEvent)]);
    expect(calls.filter((c) => c === "createEvent")).toHaveLength(1);
    expect(drafts.map((d) => d.goalEventId)).toEqual(["ev-new", "ev-new"]);
  });

  it("Fehler in der Vorbereitung bei der zweiten Sportart: nichts Bestehendes wird angefasst, Neues wird zurückgenommen", async () => {
    oldPlans = { ride: "old-ride", run: "old-run" };
    failCardsFor = "run";
    const { result } = setup();
    const res = await result.current.createPlans([item("ride"), item("run")]);
    expect(res.ok).toBe(false);
    // Beweis: kein Zukunfts-Löschen, kein Umschalten — der Bestand ist unberührt.
    expect(calls.filter(touchesExisting)).toEqual([]);
    // Neue Artefakte beider Sportarten sind wieder weg.
    expect(calls).toContain("deletePlanCardsForPlan(new-run)");
    expect(calls).toContain("deleteTrainingPlan(new-run)");
    expect(calls).toContain("deletePlanCardsForPlan(new-ride)");
    expect(calls).toContain("deleteTrainingPlan(new-ride)");
  });

  it("Fehler beim Anlegen der zweiten Plan-Zeile: ebenfalls kein Zugriff auf Bestehendes", async () => {
    oldPlans = { ride: "old-ride" };
    failCreatePlanFor = "run";
    const { result } = setup();
    const res = await result.current.createPlans([item("ride"), item("run")]);
    expect(res.ok).toBe(false);
    expect(calls.filter(touchesExisting)).toEqual([]);
    expect(calls).toContain("deleteTrainingPlan(new-ride)");
  });

  it("Fehler in der Vorbereitung entfernt ein frisch angelegtes Event wieder", async () => {
    failCardsFor = "run";
    const formWithEvent = { mode: "event", newEventDate: "2026-12-01", newEventName: "Rennen" };
    const { result } = setup();
    const res = await result.current.createPlans([
      item("ride", formWithEvent),
      item("run", formWithEvent),
    ]);
    expect(res.ok).toBe(false);
    expect(calls).toContain("removeEvent(ev-new)");
  });

  it("Fehler beim Scharfschalten der zweiten Sportart: Rückbau aller Pläne + ehrliche Meldung", async () => {
    oldPlans = { ride: "old-ride", run: "old-run" };
    failActivateFor = "run";
    const { result } = setup();
    const res = await result.current.createPlans([item("ride"), item("run")]);
    expect(res.ok).toBe(false);
    // Alt-Pläne wieder aktiv, neue Karten + Zeilen weg.
    expect(calls).toContain("setActive(old-ride,true)");
    expect(calls).toContain("setActive(old-run,true)");
    // Die schon scharfe erste Sportart: neuer Plan zuerst aus, dann der alte an
    // (sonst lehnt der Unique-Index den Alt-Plan ab).
    expect(calls.indexOf("setActive(new-ride,false)")).toBeGreaterThan(-1);
    expect(calls.indexOf("setActive(new-ride,false)")).toBeLessThan(
      calls.indexOf("setActive(old-ride,true)"),
    );
    expect(calls).toContain("deletePlanCardsForPlan(new-ride)");
    expect(calls).toContain("deleteTrainingPlan(new-ride)");
    expect(calls).toContain("deletePlanCardsForPlan(new-run)");
    expect(calls).toContain("deleteTrainingPlan(new-run)");
    if (!res.ok) expect(res.error.message).toMatch(/künftige Karten/);
  });

  it("scheitert auch der Rückbau, sagt die Meldung nicht „zurückgenommen“, sondern dass zu prüfen ist", async () => {
    oldPlans = { ride: "old-ride", run: "old-run" };
    failActivateFor = "run";
    failDeleteFor = "run";
    const { result } = setup();
    const res = await result.current.createPlans([item("ride"), item("run")]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.message).toContain("nicht vollständig");
    expect(res.error.message).not.toMatch(/wurden zurückgenommen/);
  });

  it("eine einzige Sportart: keine plan_group_id, gleicher Ablauf wie createPlan", async () => {
    oldPlans = { ride: "old-ride" };
    const { result } = setup();
    const res = await result.current.createPlans([item("ride")]);
    expect(res.ok).toBe(true);
    expect(drafts[0].planGroupId ?? null).toBeNull();
    expect(calls).toEqual([
      "listActive(ride)",
      "createTrainingPlan(ride)",
      "createPlanCards(new-ride)",
      "deleteFuturePlanCardsForPlan(old-ride)",
      "deleteFuturePlanlessPlanCards(ride)",
      "setActive(old-ride,false)",
      "setActive(new-ride,true)",
    ]);
  });

  it("lehnt dieselbe Sportart doppelt ab, bevor etwas geschrieben wird", async () => {
    const { result } = setup();
    const res = await result.current.createPlans([item("run"), item("run")]);
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("lehnt eine leere Liste ab", async () => {
    const { result } = setup();
    const res = await result.current.createPlans([]);
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
