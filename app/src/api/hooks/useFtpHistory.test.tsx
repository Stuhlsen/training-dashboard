/* Tests: useFtpHistory() — FTP-Historie des eingeloggten Athleten. */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let stored: Record<string, Array<{ id: string; ftpWatt: number; validFrom: string; source: string; note: string | null }>> = {};
let saveCalls: Array<{ profileId: string; entry: Record<string, unknown> }> = [];

vi.mock("../supabase/ftp-history", () => ({
  getFtpHistory: async (profileId: string) => ({ ok: true, entries: stored[profileId] ?? [] }),
  saveFtpEntry: async (profileId: string, entry: Record<string, unknown>) => {
    saveCalls.push({ profileId, entry });
    return { ok: true, id: "ftp-new" };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useFtpHistory, useSaveFtpEntry } = await import("./useFtpHistory");

beforeEach(() => {
  stored = {};
  saveCalls = [];
});

describe("useFtpHistory", () => {
  it("lädt die Historie des eingeloggten Profils", async () => {
    stored["athlete-1"] = [{ id: "e1", ftpWatt: 193, validFrom: "2026-03-01", source: "ramp-test", note: null }];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useFtpHistory(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.entries).toEqual(stored["athlete-1"]);
  });

  it("ohne Session -> leeres Array, kein Ladeversuch", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useFtpHistory(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.entries).toEqual([]);
  });
});

describe("useSaveFtpEntry", () => {
  it("legt einen Eintrag mit source='ramp-test' unter der eingeloggten Profil-ID an", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useSaveFtpEntry(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.save({ ftpWatt: 210, validFrom: "2026-08-08", note: null });
    });
    expect(result).toEqual({ ok: true, id: "ftp-new" });
    expect(saveCalls).toEqual([
      { profileId: "athlete-1", entry: { ftpWatt: 210, validFrom: "2026-08-08", note: null, source: "ramp-test" } },
    ]);
  });

  it("ohne Session -> Fehler, kein Aufruf", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSaveFtpEntry(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.save({ ftpWatt: 210, validFrom: "2026-08-08" });
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(saveCalls).toEqual([]);
  });
});
