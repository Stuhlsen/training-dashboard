/* Tests: api/supabase/profiles.ts — bisher ohne Testdatei. Deckt hier nur
 * die neuen Funktionen ab (Migration 0020: units_preference/Trainer-Name);
 * die bestehenden Funktionen (updateDisplayName etc.) sind unverändert und
 * bereits über die Hooks/manuelle Verifikation abgedeckt. */

import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { createFakeSupabaseClient } from "../../test/fake-supabase-client";

const fakeClient = createFakeSupabaseClient();

vi.mock("./client", () => ({
  supabase: fakeClient,
  getAuthedClient: async () => fakeClient,
  isSupabaseConfigured: true,
}));

const { updateUnitsPreference, getCoachDisplayName } = await import("./profiles");

describe("updateUnitsPreference", () => {
  it("schreibt units_preference für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    let seenFilters: Array<{ op: string; col: string; val: unknown }> = [];
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      seenFilters = calls.filters;
      return { data: null, error: null };
    };
    const result = await updateUnitsPreference("profile-1", "mi");
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ units_preference: "mi" });
    expect(seenFilters).toEqual([{ op: "eq", col: "id", val: "profile-1" }]);
  });
});

describe("getCoachDisplayName", () => {
  it("mappt display_name des Trainer-Profils", async () => {
    fakeClient.handlers.profiles = () => ({ data: { display_name: "Coach Test" }, error: null });
    const result = await getCoachDisplayName("coach-1");
    expect(result).toEqual({ ok: true, name: "Coach Test" });
  });

  it("liefert null ohne Treffer (kein Trainer verknüpft)", async () => {
    fakeClient.handlers.profiles = () => ({ data: null, error: null });
    const result = await getCoachDisplayName("coach-1");
    expect(result).toEqual({ ok: true, name: null });
  });
});
