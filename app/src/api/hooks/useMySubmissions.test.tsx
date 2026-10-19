/* Tests: useMySubmissions — eigene Einreichungen über den Adapter (gemockt). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMySubmissionsMock = vi.fn();

vi.mock("../supabase/recipes", () => ({
  listMySubmissions: (...args: unknown[]) => listMySubmissionsMock(...args),
}));

const { createHarness } = await import("../../test/harness");
const { useMySubmissions } = await import("./useMySubmissions");

const MINE = { id: "r1", title: "Haferbrei", status: "pending" };

beforeEach(() => {
  listMySubmissionsMock.mockReset();
  listMySubmissionsMock.mockResolvedValue({ ok: true, recipes: [MINE] });
});

describe("useMySubmissions", () => {
  it("lädt die Einreichungen des eingeloggten Profils", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useMySubmissions(), { wrapper });
    await waitFor(() => expect(result.current.recipes).toHaveLength(1));
    expect(result.current.recipes[0]).toMatchObject({ id: "r1" });
    expect(listMySubmissionsMock).toHaveBeenCalledWith("u1");
  });

  it("fragt ausgeloggt nichts ab", () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useMySubmissions(), { wrapper });
    expect(result.current.recipes).toEqual([]);
    expect(listMySubmissionsMock).not.toHaveBeenCalled();
  });

  it("liefert vor dem Laden eine stabile leere Liste", () => {
    listMySubmissionsMock.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createHarness({ userId: "u1" });
    const { result, rerender } = renderHook(() => useMySubmissions(), { wrapper });
    const first = result.current.recipes;
    expect(first).toEqual([]);
    rerender();
    expect(result.current.recipes).toBe(first);
  });

  it("meldet einen Adapter-Fehler über isError", async () => {
    listMySubmissionsMock.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "boom" } });
    const { wrapper } = createHarness({ userId: "u1" });
    const { result } = renderHook(() => useMySubmissions(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
