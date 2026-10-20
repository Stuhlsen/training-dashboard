/* Tests: api/supabase/meal-plan.ts — Result-Konvention wie nutrition-goals.ts.
 * listMealPlan: Filter/Zeitraum/Mapping; upsertMealPlanEntry: Upsert auf
 * (athlete_id, date, meal_slot) + App-Validierung; deleteMealPlanEntry:
 * RLS-stilles "0 Zeilen" wird als Fehler gemeldet. */

import { describe, expect, it, vi } from "vitest";
import { createFakeSupabaseClient, type FakeCall } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { listMealPlan, upsertMealPlanEntry, deleteMealPlanEntry } = await import("./meal-plan");

const ROW = {
  id: "e1",
  athlete_id: "p1",
  date: "2026-10-14",
  meal_slot: "lunch",
  recipe_id: "r1",
  servings: 1.5,
  extra_servings: 4.5,
  created_at: "2026-10-14T08:00:00Z",
  updated_at: "2026-10-14T08:00:00Z",
};

const ENTRY = {
  id: "e1",
  athleteId: "p1",
  date: "2026-10-14",
  mealSlot: "lunch",
  recipeId: "r1",
  servings: 1.5,
  extraServings: 4.5,
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
};

const INPUT = {
  athleteId: "p1",
  date: "2026-10-14",
  mealSlot: "lunch" as const,
  recipeId: "r1",
  servings: 1.5,
};

describe("listMealPlan", () => {
  it("liest fehlende Gäste-Portionen (NULL/alte Zeile) als 0", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: [{ ...ROW, extra_servings: null }], error: null });
    const result = await listMealPlan("p1", "2026-10-12", "2026-10-18");
    expect(result.ok && result.entries[0].extraServings).toBe(0);
  });

  it("filtert auf Athlet und Zeitraum, sortiert nach Datum und mappt die Zeilen", async () => {
    let seen: FakeCall | undefined;
    fakeClient.handlers.meal_plan_entries = (calls) => {
      seen = calls;
      return { data: [ROW], error: null };
    };
    const result = await listMealPlan("p1", "2026-10-12", "2026-10-18");
    expect(result).toEqual({ ok: true, entries: [ENTRY] });
    expect(seen?.filters).toEqual([
      { op: "eq", col: "athlete_id", val: "p1" },
      { op: "gte", col: "date", val: "2026-10-12" },
      { op: "lte", col: "date", val: "2026-10-18" },
    ]);
    expect(seen?.order).toEqual({ col: "date", ascending: true });
  });

  it("wandelt numeric als String in eine Zahl um", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: [{ ...ROW, servings: "2" }], error: null });
    const result = await listMealPlan("p1", "2026-10-12", "2026-10-18");
    expect(result.ok && result.entries[0].servings).toBe(2);
  });

  it("gibt eine leere Liste zurück, wenn nichts da ist (data null)", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: null, error: null });
    expect(await listMealPlan("p1", "2026-10-12", "2026-10-18")).toEqual({ ok: true, entries: [] });
  });

  it("lehnt einen ungültigen Zeitraum ab, ohne die DB zu fragen", async () => {
    let called = false;
    fakeClient.handlers.meal_plan_entries = () => {
      called = true;
      return { data: [], error: null };
    };
    const result = await listMealPlan("p1", "2026-13-01", "2026-10-18");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
    expect(called).toBe(false);
  });

  it("gibt DB-Fehler als UNKNOWN weiter", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: null, error: { message: "connection lost" } });
    const result = await listMealPlan("p1", "2026-10-12", "2026-10-18");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toEqual({ code: "UNKNOWN", message: "connection lost" });
  });
});

describe("upsertMealPlanEntry", () => {
  it("schreibt per Upsert auf (athlete_id, date, meal_slot) und gibt den Eintrag zurück", async () => {
    let seen: FakeCall | undefined;
    fakeClient.handlers.meal_plan_entries = (calls) => {
      seen = calls;
      return { data: ROW, error: null };
    };
    const result = await upsertMealPlanEntry(INPUT);
    expect(result).toEqual({ ok: true, entry: ENTRY });
    expect(seen?.method).toBe("upsert");
    expect(seen?.upsertOpts).toEqual({ onConflict: "athlete_id,date,meal_slot" });
    expect(seen?.payload).toEqual({
      athlete_id: "p1",
      date: "2026-10-14",
      meal_slot: "lunch",
      recipe_id: "r1",
      servings: 1.5,
      extra_servings: 0,
    });
  });

  it("schreibt Gäste-Portionen mit", async () => {
    let seen: FakeCall | undefined;
    fakeClient.handlers.meal_plan_entries = (calls) => {
      seen = calls;
      return { data: ROW, error: null };
    };
    await upsertMealPlanEntry({ ...INPUT, extraServings: 4.5 });
    expect((seen?.payload as { extra_servings: number }).extra_servings).toBe(4.5);
  });

  it.each([
    ["ungültige Mahlzeit", { mealSlot: "brunch" as never }],
    ["Portionen 0", { servings: 0 }],
    ["Portionen negativ", { servings: -1 }],
    ["Portionen NaN", { servings: Number.NaN }],
    ["Portionen Infinity", { servings: Number.POSITIVE_INFINITY }],
    ["Gäste-Portionen negativ", { extraServings: -1 }],
    ["Gäste-Portionen über 20", { extraServings: 21 }],
    ["Gäste-Portionen NaN", { extraServings: Number.NaN }],
    ["Datum kein ISO", { date: "14.10.2026" }],
    ["Datum nicht im Kalender", { date: "2026-02-30" }],
    ["Rezept fehlt", { recipeId: "" }],
    ["Athlet fehlt", { athleteId: "" }],
  ])("lehnt %s ab (SCHEMA), ohne die DB zu fragen", async (_name, patch) => {
    let called = false;
    fakeClient.handlers.meal_plan_entries = () => {
      called = true;
      return { data: ROW, error: null };
    };
    const result = await upsertMealPlanEntry({ ...INPUT, ...patch });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
    expect(called).toBe(false);
  });

  it("nimmt alle vier Mahlzeiten an", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: ROW, error: null });
    for (const mealSlot of ["breakfast", "lunch", "dinner", "snack"] as const) {
      expect((await upsertMealPlanEntry({ ...INPUT, mealSlot })).ok).toBe(true);
    }
  });

  it("gibt DB-Fehler (z. B. RLS) als UNKNOWN weiter", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: null, error: { message: "new row violates row-level security policy" } });
    const result = await upsertMealPlanEntry(INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });
});

describe("deleteMealPlanEntry", () => {
  it("löscht per id und meldet ok, wenn eine Zeile getroffen wurde", async () => {
    let seen: FakeCall | undefined;
    fakeClient.handlers.meal_plan_entries = (calls) => {
      seen = calls;
      return { data: [{ id: "e1" }], error: null };
    };
    expect(await deleteMealPlanEntry("e1")).toEqual({ ok: true });
    expect(seen?.method).toBe("delete");
    expect(seen?.filters).toEqual([{ op: "eq", col: "id", val: "e1" }]);
  });

  it("meldet NO_DATA, wenn keine Zeile getroffen wurde (RLS verbirgt still)", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: [], error: null });
    const result = await deleteMealPlanEntry("e1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NO_DATA");
  });

  it("lehnt eine leere id ab", async () => {
    const result = await deleteMealPlanEntry("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SCHEMA");
  });

  it("gibt DB-Fehler als UNKNOWN weiter", async () => {
    fakeClient.handlers.meal_plan_entries = () => ({ data: null, error: { message: "boom" } });
    const result = await deleteMealPlanEntry("e1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNKNOWN");
  });
});
