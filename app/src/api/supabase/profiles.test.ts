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

const { updateUnitsPreference, updateFtpPublic, getCoachDisplayName, getProfile, getProfileByDisplayName } =
  await import("./profiles");

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

describe("updateFtpPublic (Migration 0025)", () => {
  it("schreibt ftp_public für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    let seenFilters: Array<{ op: string; col: string; val: unknown }> = [];
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      seenFilters = calls.filters;
      return { data: null, error: null };
    };
    const result = await updateFtpPublic("profile-1", false);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ ftp_public: false });
    expect(seenFilters).toEqual([{ op: "eq", col: "id", val: "profile-1" }]);
  });
});

describe("Lesepfade über profiles_visible (Migration 0022, #32)", () => {
  it("getProfile liest die eigene Zeile über die View, nicht die Basistabelle", async () => {
    let seenTable = "";
    fakeClient.handlers.profiles_visible = (calls) => {
      seenTable = calls.table;
      return {
        data: {
          id: "self-1",
          display_name: "Stuhlsen",
          role: "athlete",
          coach_id: "coach-1",
          wellbeing_public: false,
          ftp_public: true,
          is_admin: false,
          ladder_progression_enabled: true,
          units_preference: "km",
          plan_offset_weeks: 2,
        },
        error: null,
      };
    };
    const result = await getProfile("self-1");
    expect(seenTable).toBe("profiles_visible");
    expect(result).toEqual({
      ok: true,
      profile: {
        id: "self-1",
        displayName: "Stuhlsen",
        role: "athlete",
        coachId: "coach-1",
        wellbeingPublic: false,
        ftpPublic: true,
        isAdmin: false,
        ladderProgressionEnabled: true,
        unitsPreference: "km",
        planOffsetWeeks: 2,
      },
    });
  });

  it("getProfileByDisplayName liefert null, wenn die View keine Zeile zeigt (kein Coach)", async () => {
    let seenTable = "";
    fakeClient.handlers.profiles_visible = (calls) => {
      seenTable = calls.table;
      return { data: null, error: null };
    };
    const result = await getProfileByDisplayName("hc_diZee");
    expect(seenTable).toBe("profiles_visible");
    expect(result).toEqual({ ok: true, profile: null });
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
