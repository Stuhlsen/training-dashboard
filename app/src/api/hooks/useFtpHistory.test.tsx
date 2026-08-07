/* Tests: useFtpHistory() — FTP-Historie des eingeloggten Athleten. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let stored: Record<string, Array<{ id: string; ftpWatt: number; validFrom: string; source: string; note: string | null }>> = {};

vi.mock("../supabase/ftp-history", () => ({
  getFtpHistory: async (profileId: string) => ({ ok: true, entries: stored[profileId] ?? [] }),
}));

const { createHarness } = await import("../../test/harness");
const { useFtpHistory } = await import("./useFtpHistory");

beforeEach(() => {
  stored = {};
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
