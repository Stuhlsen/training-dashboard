/* Tests: useRecipes — genehmigter Pool über listRecipes() (Adapter gemockt). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecipesMock = vi.fn();

const listRatingStatsMock = vi.fn();

vi.mock("../supabase/recipes", () => ({
  listRecipes: (...args: unknown[]) => listRecipesMock(...args),
}));
vi.mock("../supabase/recipe-ratings", () => ({
  listRatingStats: (...args: unknown[]) => listRatingStatsMock(...args),
}));

const { createHarness } = await import("../../test/harness");
const { useRecipes } = await import("./useRecipes");

const RECIPE = { id: "r1", title: "Haferflocken-Porridge", status: "approved" };

beforeEach(() => {
  listRecipesMock.mockReset();
  listRecipesMock.mockResolvedValue({ ok: true, recipes: [RECIPE] });
  listRatingStatsMock.mockReset();
  listRatingStatsMock.mockResolvedValue({ ok: true, stats: [] });
});

describe("useRecipes", () => {
  it("liefert den Pool des Adapters (Standardfilter = approved, kein Zusatzfilter)", async () => {
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.recipes).toHaveLength(1));
    expect(result.current.recipes[0]).toMatchObject({ id: "r1" });
    expect(listRecipesMock).toHaveBeenCalledWith();
  });

  it("liefert vor dem Laden eine stabile leere Liste", () => {
    listRecipesMock.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createHarness({ userId: "p1" });
    const { result, rerender } = renderHook(() => useRecipes(), { wrapper });
    const first = result.current.recipes;
    expect(first).toEqual([]);
    rerender();
    expect(result.current.recipes).toBe(first);
  });

  it("bleibt bei einem Adapter-Fehler leer und meldet nicht mehr 'lädt'", async () => {
    listRecipesMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.recipes).toEqual([]);
  });

  it("hängt Schnitt und Anzahl der Sterne an die Rezepte (Fahrplan 30 B3)", async () => {
    listRecipesMock.mockResolvedValue({ ok: true, recipes: [RECIPE, { ...RECIPE, id: "r2" }] });
    listRatingStatsMock.mockResolvedValue({ ok: true, stats: [{ recipeId: "r1", avg: 4.5, count: 2 }] });
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.recipes[0]?.ratingCount).toBe(2));
    expect(result.current.recipes[0]).toMatchObject({ id: "r1", ratingAvg: 4.5, ratingCount: 2 });
    expect(result.current.recipes[1]).toMatchObject({ id: "r2", ratingAvg: null, ratingCount: 0 });
  });

  it("zeigt die Rezepte auch dann, wenn die Sterne nicht laden (unbewertet statt Fehler)", async () => {
    listRatingStatsMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.recipes).toHaveLength(1));
    expect(result.current.isError).toBe(false);
    expect(result.current.recipes[0]).toMatchObject({ ratingAvg: null, ratingCount: 0 });
  });

  it("meldet einen Adapter-Fehler über isError (nicht als leere Bibliothek)", async () => {
    listRecipesMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "p1" });
    const { result } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
