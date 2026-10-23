/* Tests: useTrainingDataPublic() — Schalter „Trainingsdaten für alle
 * Eingeloggten sichtbar" (profiles.training_data_public, Migration 0078). */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let stored: Record<string, boolean> = {};
let setCalls: Array<{ userId: string; value: boolean }> = [];
let failWrite = false;
let failRead = false;

vi.mock("../supabase/profiles", () => ({
  getTrainingDataPublic: async (userId: string) =>
    failRead
      ? { ok: false, error: { code: "UNKNOWN", message: "read failed" } }
      : { ok: true, value: stored[userId] ?? false },
  setTrainingDataPublic: async (userId: string, value: boolean) => {
    if (failWrite) return { ok: false, error: { code: "UNKNOWN", message: "not allowed" } };
    setCalls.push({ userId, value });
    stored[userId] = value;
    return { ok: true };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useTrainingDataPublic } = await import("./useTrainingDataPublic");

beforeEach(() => {
  stored = {};
  setCalls = [];
  failWrite = false;
  failRead = false;
});

describe("useTrainingDataPublic", () => {
  it("Standard ist aus", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.isPublic).toBe(false);
  });

  it("Lesefehler → isError, damit die UI nicht 'aus' vortäuscht", async () => {
    failRead = true;
    const { wrapper } = createHarness({ userId: "u1" });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    await waitFor(() => expect(view.result.current.isError).toBe(true));
  });

  it("lädt den gespeicherten Wert", async () => {
    stored.u1 = true;
    const { wrapper } = createHarness({ userId: "u1" });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    await waitFor(() => expect(view.result.current.isPublic).toBe(true));
  });

  it("update schreibt für den eigenen Account und aktualisiert den Cache", async () => {
    const { wrapper } = createHarness({ userId: "u1" });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.update(true);
    });
    expect(result?.ok).toBe(true);
    expect(setCalls).toEqual([{ userId: "u1", value: true }]);
    await waitFor(() => expect(view.result.current.isPublic).toBe(true));
  });

  it("Schreibfehler → ok:false, Wert bleibt aus", async () => {
    failWrite = true;
    const { wrapper } = createHarness({ userId: "u1" });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.update(true);
    });
    expect(result?.ok).toBe(false);
    expect(view.result.current.isPublic).toBe(false);
  });

  it("ohne Session → ok:false, nichts geschrieben", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useTrainingDataPublic(), { wrapper });
    let result: { ok: boolean } | undefined;
    await act(async () => {
      result = await view.result.current.update(true);
    });
    expect(result?.ok).toBe(false);
    expect(setCalls).toHaveLength(0);
  });
});
