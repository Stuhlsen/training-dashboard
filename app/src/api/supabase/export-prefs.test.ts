/* Tests: api/supabase/export-prefs.ts — Port von
 * data-access/supabase/export-prefs.js (Vanilla). */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { getExportPrefs, setExportPrefs } = await import("./export-prefs");

describe("getExportPrefs", () => {
  it("mappt preset+event_id aus der Zeile", async () => {
    fakeClient.handlers.export_prefs = () => ({
      data: { preset: "event", event_id: "evt-1" },
      error: null,
    });
    const result = await getExportPrefs("profile-1");
    expect(result).toEqual({ ok: true, preset: "event", eventId: "evt-1" });
  });

  it("keine Zeile -> preset/eventId null, kein Fehler", async () => {
    fakeClient.handlers.export_prefs = () => ({ data: null, error: null });
    const result = await getExportPrefs("profile-1");
    expect(result).toEqual({ ok: true, preset: null, eventId: null });
  });
});

describe("setExportPrefs", () => {
  it("upsertet über profile_id als Konfliktschlüssel", async () => {
    let seen: Record<string, unknown> = {};
    let opts: Record<string, unknown> | undefined;
    fakeClient.handlers.export_prefs = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      opts = calls.upsertOpts;
      return { data: null, error: null };
    };
    const result = await setExportPrefs("profile-1", { preset: "reduce", eventId: null });
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ profile_id: "profile-1", preset: "reduce", event_id: null });
    expect(opts).toEqual({ onConflict: "profile_id" });
  });
});
