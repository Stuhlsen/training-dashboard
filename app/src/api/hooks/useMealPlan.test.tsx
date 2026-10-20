/* Tests: useMealPlan / useUpsertMealPlanEntry / useDeleteMealPlanEntry.
 * Mock-Grenze ist der Adapter (api/supabase/meal-plan); die Hook-Logik
 * (Session-Gate, Result-Brücke, Invalidierung) läuft echt. */

import { act } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanEntry, MealPlanEntryInput, Result } from "../types";

const ENTRY: MealPlanEntry = {
  id: "e1",
  athleteId: "p1",
  date: "2026-10-14",
  mealSlot: "lunch",
  recipeId: "r1",
  servings: 1,
  extraServings: 0,
  createdAt: "2026-10-14T08:00:00Z",
  updatedAt: "2026-10-14T08:00:00Z",
};

const listMock = vi.fn();
const upsertMock = vi.fn();
const deleteMock = vi.fn();

vi.mock("../supabase/meal-plan", () => ({
  listMealPlan: (...args: unknown[]) => listMock(...args),
  upsertMealPlanEntry: (...args: unknown[]) => upsertMock(...args),
  deleteMealPlanEntry: (...args: unknown[]) => deleteMock(...args),
}));

const { createHarness } = await import("../../test/harness");
const { useMealPlan, useUpsertMealPlanEntry, useDeleteMealPlanEntry } = await import("./useMealPlan");
const { qk } = await import("../keys");

beforeEach(() => {
  listMock.mockReset();
  upsertMock.mockReset();
  deleteMock.mockReset();
  listMock.mockResolvedValue({ ok: true, entries: [ENTRY] });
  upsertMock.mockResolvedValue({ ok: true, entry: ENTRY });
  deleteMock.mockResolvedValue({ ok: true });
});

describe("useMealPlan", () => {
  it("lädt die Einträge des eingeloggten Profils im Zeitraum", async () => {
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useMealPlan("2026-10-12", "2026-10-18"), { wrapper });
    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));
    expect(listMock).toHaveBeenCalledWith("p1", "2026-10-12", "2026-10-18");
  });

  it("fragt ohne Login gar nicht erst und liefert eine leere Liste", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useMealPlan("2026-10-12", "2026-10-18"), { wrapper });
    expect(result.current.entries).toEqual([]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("gibt dieselbe leere Referenz zurück (kein neues Array je Render)", () => {
    const { wrapper } = createHarness({ userId: null });
    const { result, rerender } = renderHook(() => useMealPlan("2026-10-12", "2026-10-18"), { wrapper });
    const first = result.current.entries;
    rerender();
    expect(result.current.entries).toBe(first);
  });
});

describe("useUpsertMealPlanEntry", () => {
  const input: Omit<MealPlanEntryInput, "athleteId"> = {
    date: "2026-10-14",
    mealSlot: "lunch",
    recipeId: "r1",
    servings: 1,
    extraServings: 0,
  };

  it("setzt die athleteId aus der Session und gibt ein ok-Result zurück", async () => {
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useUpsertMealPlanEntry(), { wrapper });
    let r: Result<{ entry: MealPlanEntry }> | undefined;
    await act(async () => {
      r = await result.current.upsert(input);
    });
    expect(r).toEqual({ ok: true, entry: ENTRY });
    expect(upsertMock).toHaveBeenCalledWith({ ...input, athleteId: "p1" });
  });

  it("invalidiert nach Erfolg alle Zeiträume des Profils", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "p1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpsertMealPlanEntry(), { wrapper });
    await act(async () => {
      await result.current.upsert(input);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.mealPlanAll("p1") });
  });

  it("ohne Login: Fehler-Result, Adapter wird nicht aufgerufen", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useUpsertMealPlanEntry(), { wrapper });
    let r: Result<{ entry: MealPlanEntry }> | undefined;
    await act(async () => {
      r = await result.current.upsert(input);
    });
    expect(r?.ok).toBe(false);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("reicht einen Adapter-Fehler als Result durch (kein Wurf)", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: { code: "SCHEMA", message: "Ungültiges Datum." } });
    const { wrapper, queryClient } = createHarness({ userId: "p1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpsertMealPlanEntry(), { wrapper });
    let r: Result<{ entry: MealPlanEntry }> | undefined;
    await act(async () => {
      r = await result.current.upsert(input);
    });
    expect(r).toEqual({ ok: false, error: { code: "SCHEMA", message: "Ungültiges Datum." } });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useDeleteMealPlanEntry", () => {
  it("löscht und invalidiert alle Zeiträume des Profils", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "p1" });
    const spy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteMealPlanEntry(), { wrapper });
    let r: Result | undefined;
    await act(async () => {
      r = await result.current.remove("e1");
    });
    expect(r?.ok).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith("e1");
    expect(spy).toHaveBeenCalledWith({ queryKey: qk.mealPlanAll("p1") });
  });

  it("ohne Login: Fehler-Result, Adapter wird nicht aufgerufen", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useDeleteMealPlanEntry(), { wrapper });
    let r: Result | undefined;
    await act(async () => {
      r = await result.current.remove("e1");
    });
    expect(r?.ok).toBe(false);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});
