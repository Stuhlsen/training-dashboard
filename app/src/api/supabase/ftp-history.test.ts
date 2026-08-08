/* Tests: api/supabase/ftp-history.ts — Port von
 * data-access/supabase/ftp-history.js (Vanilla). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getFtpHistory, saveFtpEntry } = await import("./ftp-history");

describe("getFtpHistory", () => {
  it("mappt die Historie aus snake_case", async () => {
    fakeClient.handlers.ftp_history = () => ({
      data: [{ id: "e1", ftp_watt: 193, valid_from: "2026-03-01", source: "ramp-test", note: null }],
      error: null,
    });
    const result = await getFtpHistory("profile-1");
    expect(result).toEqual({
      ok: true,
      entries: [{ id: "e1", ftpWatt: 193, validFrom: "2026-03-01", source: "ramp-test", note: null }],
    });
  });
});

describe("saveFtpEntry", () => {
  it("defaultet source auf 'ramp-test' ohne Angabe", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.ftp_history = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: { id: "e2" }, error: null };
    };
    const result = await saveFtpEntry("profile-1", { ftpWatt: 200, validFrom: "2026-08-01" });
    expect(result).toEqual({ ok: true, id: "e2" });
    expect(seen).toEqual({
      profile_id: "profile-1",
      ftp_watt: 200,
      valid_from: "2026-08-01",
      source: "ramp-test",
      note: null,
    });
  });
});
