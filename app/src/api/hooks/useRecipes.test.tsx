/* Tests: useRecipes — genehmigter Pool über listRecipes() (Adapter gemockt). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listRecipesMock = vi.fn();

vi.mock("../supabase/recipes", () => ({
  listRecipes: (...args: unknown[]) => listRecipesMock(...args),
}));

const { createHarness } = await import("../../test/harness");
const { useRecipes } = await import("./useRecipes");

const RECIPE = { id: "r1", title: "Haferflocken-Porridge", status: "approved" };

beforeEach(() => {
  listRecipesMock.mockReset();
  listRecipesMock.mockResolvedValue({ ok: true, recipes: [RECIPE] });
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
});
