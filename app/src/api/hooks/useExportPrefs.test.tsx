/* Tests: useExportPrefs() — Export-Richtungsvorgabe (Preset + Zielevent). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../test/harness";

let stored: Record<string, { preset: string | null; eventId: string | null }> = {};
let setExportPrefsCalls: Array<{ profileId: string; preset: string; eventId: string | null }> = [];

vi.mock("../supabase/export-prefs", () => ({
  getExportPrefs: async (profileId: string) => ({
    ok: true,
    preset: stored[profileId]?.preset ?? null,
    eventId: stored[profileId]?.eventId ?? null,
  }),
  setExportPrefs: async (profileId: string, { preset, eventId }: { preset: string; eventId: string | null }) => {
    setExportPrefsCalls.push({ profileId, preset, eventId });
    stored[profileId] = { preset, eventId };
    return { ok: true };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useExportPrefs, DEFAULT_EXPORT_PRESET } = await import("./useExportPrefs");

beforeEach(() => {
  stored = {};
  setExportPrefsCalls = [];
});

describe("useExportPrefs", () => {
  it("lädt die gespeicherte Vorgabe", async () => {
    stored["athlete-1"] = { preset: "event", eventId: "evt-1" };
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useExportPrefs(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.preset).toBe("event");
    expect(view.result.current.eventId).toBe("evt-1");
  });

  it("kein gespeicherter Eintrag -> Default 'general', kein Zielevent", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useExportPrefs(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.preset).toBe(DEFAULT_EXPORT_PRESET);
    expect(view.result.current.eventId).toBeNull();
  });

  it("ohne Session -> Default, kein Ladeversuch", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useExportPrefs(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.preset).toBe(DEFAULT_EXPORT_PRESET);
  });

  it("save() aktualisiert den Cache sofort, noch vor dem Resolve des Schreibvorgangs", async () => {
    const write = deferred<{ ok: true }>();
    const mod = await import("../supabase/export-prefs");
    vi.spyOn(mod, "setExportPrefs").mockImplementation(async (profileId, next) => {
      setExportPrefsCalls.push({ profileId, ...next });
      await write.promise;
      return { ok: true };
    });

    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useExportPrefs(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    view.result.current.save("reduce", null);
    await waitFor(() => expect(view.result.current.preset).toBe("reduce"));
    expect(setExportPrefsCalls).toHaveLength(1);

    write.resolve({ ok: true });
  });
});
