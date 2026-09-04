/* Tests: api/supabase/training-plans.ts — Row-Mapping (snake -> camel),
 * der is_active=false-Insert (Fahrplan 8 E6: scharf schalten erst nach dem
 * Karten-Insert) und der Query-Aufbau von listActiveTrainingPlan(). */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";
import type { TrainingPlanDraft } from "../types";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const {
  listActiveTrainingPlan,
  createTrainingPlan,
  setTrainingPlanActive,
  updateTrainingPlan,
  deleteTrainingPlan,
  toTrainingPlan,
} = await import("./training-plans");

const row = (over: Record<string, unknown> = {}) => ({
  id: "tp1",
  athlete_id: "prof-a",
  created_by: "prof-a",
  is_active: true,
  mode: "open",
  goal_event_id: null,
  start_date: "2026-09-07",
  end_date: "2026-11-29",
  weeks: 12,
  model: "pyramidal",
  focus: "allgemein",
  level: "fortgeschritten",
  training_weekdays: [2, 4, 6],
  weekly_hours: 6,
  indoor_share: 0.4,
  ftp_at_creation: 193,
  ftp_target: 210,
  params: { form: { weeks: 12 } },
  week_model: [{ week: "2026-KW37", phase: "Sweet Spot" }],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const draft: TrainingPlanDraft = {
  mode: "event",
  goalEventId: "ev-9",
  startDate: "2026-09-07",
  endDate: "2026-11-29",
  weeks: 12,
  model: "linear",
  focus: "berg",
  level: "einsteiger",
  trainingWeekdays: [1, 3, 5, 6],
  weeklyHours: 8,
  indoorShare: 0.25,
  ftpAtCreation: null,
  ftpTarget: 240,
  params: { form: {}, history: null },
  weekModel: [],
};

describe("toTrainingPlan", () => {
  it("mappt snake_case -> camelCase", () => {
    const p = toTrainingPlan(row());
    expect(p).toMatchObject({
      id: "tp1",
      athleteId: "prof-a",
      isActive: true,
      goalEventId: null,
      startDate: "2026-09-07",
      trainingWeekdays: [2, 4, 6],
      weeklyHours: 6,
      indoorShare: 0.4,
      ftpAtCreation: 193,
      ftpTarget: 210,
      weekModel: [{ week: "2026-KW37", phase: "Sweet Spot" }],
    });
  });

  it("gibt fehlende Arrays als leeres Array zurück", () => {
    const p = toTrainingPlan(row({ training_weekdays: null, week_model: null, params: null }));
    expect(p.trainingWeekdays).toEqual([]);
    expect(p.weekModel).toEqual([]);
    expect(p.params).toEqual({});
  });
});

describe("listActiveTrainingPlan", () => {
  it("filtert auf athlete_id + is_active und gibt die Zeile zurück", async () => {
    let seen: unknown;
    fakeClient.handlers.training_plans = (calls) => {
      seen = calls.filters;
      return { data: [row()], error: null };
    };
    const res = await listActiveTrainingPlan("prof-a");
    expect(res.ok && res.plan?.id).toBe("tp1");
    expect(seen).toEqual([
      { op: "eq", col: "athlete_id", val: "prof-a" },
      { op: "eq", col: "is_active", val: true },
    ]);
  });

  it("gibt plan: null zurück, wenn keine aktive Zeile existiert", async () => {
    fakeClient.handlers.training_plans = () => ({ data: [], error: null });
    const res = await listActiveTrainingPlan("prof-a");
    expect(res).toEqual({ ok: true, plan: null });
  });
});

describe("createTrainingPlan", () => {
  it("legt die Zeile mit is_active=false an und mappt den Draft nach snake_case", async () => {
    let payload: Record<string, unknown> | undefined;
    fakeClient.handlers.training_plans = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      return { data: row({ is_active: false, model: "linear" }), error: null };
    };
    const res = await createTrainingPlan("prof-a", "prof-coach", draft);
    expect(res.ok).toBe(true);
    expect(payload).toMatchObject({
      athlete_id: "prof-a",
      created_by: "prof-coach",
      is_active: false,
      mode: "event",
      goal_event_id: "ev-9",
      model: "linear",
      focus: "berg",
      level: "einsteiger",
      training_weekdays: [1, 3, 5, 6],
      weekly_hours: 8,
      indoor_share: 0.25,
      ftp_at_creation: null,
      ftp_target: 240,
      week_model: [],
    });
  });
});

describe("setTrainingPlanActive", () => {
  it("patcht nur is_active", async () => {
    let payload: Record<string, unknown> | undefined;
    let filters: unknown;
    fakeClient.handlers.training_plans = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      filters = calls.filters;
      return { data: row(), error: null };
    };
    await setTrainingPlanActive("tp1", true);
    expect(payload).toEqual({ is_active: true });
    expect(filters).toEqual([{ op: "eq", col: "id", val: "tp1" }]);
  });
});

describe("updateTrainingPlan", () => {
  it("patcht nur week_model + params, per id-Filter (E13)", async () => {
    let payload: Record<string, unknown> | undefined;
    let filters: unknown;
    fakeClient.handlers.training_plans = (calls) => {
      payload = calls.payload as Record<string, unknown>;
      filters = calls.filters;
      return { data: row(), error: null };
    };
    const weekModel = [
      { week: "2026-KW40", phase: "Schwelle", start: "2026-09-28", end: "2026-10-04", trainingWeekdays: [2, 4], targetTss: 420 },
    ];
    const res = await updateTrainingPlan("tp1", { weekModel, params: { warnings: ["x"] } });
    expect(res.ok).toBe(true);
    expect(payload).toEqual({ week_model: weekModel, params: { warnings: ["x"] } });
    expect(filters).toEqual([{ op: "eq", col: "id", val: "tp1" }]);
  });
});

describe("deleteTrainingPlan", () => {
  it("löscht per id-Filter", async () => {
    let seen: { method?: string; filters: unknown } | undefined;
    fakeClient.handlers.training_plans = (calls) => {
      seen = { method: calls.method, filters: calls.filters };
      return { data: null, error: null };
    };
    const res = await deleteTrainingPlan("tp1");
    expect(res).toEqual({ ok: true });
    expect(seen?.method).toBe("delete");
    expect(seen?.filters).toEqual([{ op: "eq", col: "id", val: "tp1" }]);
  });
});
