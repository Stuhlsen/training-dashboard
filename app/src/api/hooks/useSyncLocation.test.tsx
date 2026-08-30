/* Tests: useSyncLocation() — grober Standort für die Sync-Wettervorschau
 * (Tabelle athlete_sync_config, Migration 0023, Fahrplan 7 CRED2). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncLocation } from "../types";

let stored: Record<string, SyncLocation> = {};
let updateCalls: Array<{ userId: string; location: SyncLocation }> = [];

vi.mock("../supabase/athlete-sync-config", () => ({
  getSyncLocation: async (userId: string) => ({
    ok: true,
    location: stored[userId] ?? { lat: null, lon: null },
  }),
  updateSyncLocation: async (userId: string, location: SyncLocation) => {
    updateCalls.push({ userId, location });
    stored[userId] = location;
    return { ok: true };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useSyncLocation } = await import("./useSyncLocation");

beforeEach(() => {
  stored = {};
  updateCalls = [];
});

describe("useSyncLocation", () => {
  it("lädt den gespeicherten Standort", async () => {
    stored["athlete-1"] = { lat: 52.52, lon: 13.41 };
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useSyncLocation(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.location).toEqual({ lat: 52.52, lon: 13.41 });
  });

  it("kein Eintrag -> lat/lon null", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useSyncLocation(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.location).toEqual({ lat: null, lon: null });
  });

  it("ohne Session -> null/null, kein Ladeversuch", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSyncLocation(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.location).toEqual({ lat: null, lon: null });
  });

  it("ohne Session -> update() liefert ok:false statt zu schreiben", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSyncLocation(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    const result = await view.result.current.update({ lat: 1, lon: 2 });
    expect(result.ok).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it("update() schreibt und aktualisiert den Cache", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useSyncLocation(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    const result = await view.result.current.update({ lat: 48.14, lon: 11.58 });
    expect(result.ok).toBe(true);
    expect(updateCalls).toEqual([{ userId: "athlete-1", location: { lat: 48.14, lon: 11.58 } }]);
    await waitFor(() => expect(view.result.current.location).toEqual({ lat: 48.14, lon: 11.58 }));
  });
});
