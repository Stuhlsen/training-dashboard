/* Tests: api/supabase/athlete-formats.ts — Port von
 * data-access/supabase/formats.js (Vanilla, getAthleteFormats/
 * setAthleteFormatActive-Teil). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getAthleteFormats, setAthleteFormatActive } = await import("./athlete-formats");

describe("getAthleteFormats", () => {
  it("mappt Aktiv-Status je Format", async () => {
    fakeClient.handlers.athlete_formats = () => ({
      data: [{ id: "af1", format_id: "f1", active: true }],
      error: null,
    });
    const result = await getAthleteFormats("profile-1");
    expect(result).toEqual({ ok: true, athleteFormats: [{ id: "af1", formatId: "f1", active: true }] });
  });
});

describe("setAthleteFormatActive", () => {
  it("upsertet über (profile_id, format_id)", async () => {
    let seen: Record<string, unknown> = {};
    let opts: Record<string, unknown> | undefined;
    fakeClient.handlers.athlete_formats = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      opts = calls.upsertOpts;
      return { data: null, error: null };
    };
    await setAthleteFormatActive("profile-1", "f1", false);
    expect(seen).toEqual({ profile_id: "profile-1", format_id: "f1", active: false });
    expect(opts).toEqual({ onConflict: "profile_id,format_id" });
  });
});
