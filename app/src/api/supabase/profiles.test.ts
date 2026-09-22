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

const {
  updateUnitsPreference,
  updateFtpPublic,
  getCoachDisplayName,
  getProfile,
  getProfileByDisplayName,
  getProfileBasics,
  updateBirthdate,
  updateRestingHr,
  updateGender,
  updateHeightCm,
  updateWeightKg,
  updateHrMax,
} = await import("./profiles");

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
        sports: ["ride"],
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

describe("Profil-Basisdaten-Updates (Migration 0039, Fahrplan 17 E3)", () => {
  it("updateBirthdate schreibt birthdate für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    let seenFilters: Array<{ op: string; col: string; val: unknown }> = [];
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      seenFilters = calls.filters;
      return { data: null, error: null };
    };
    const result = await updateBirthdate("profile-1", "1990-05-01");
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ birthdate: "1990-05-01" });
    expect(seenFilters).toEqual([{ op: "eq", col: "id", val: "profile-1" }]);
  });

  it("updateBirthdate mit null löscht das Feld", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateBirthdate("profile-1", null);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ birthdate: null });
  });

  it("updateRestingHr schreibt resting_hr für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    let seenFilters: Array<{ op: string; col: string; val: unknown }> = [];
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      seenFilters = calls.filters;
      return { data: null, error: null };
    };
    const result = await updateRestingHr("profile-1", 52);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ resting_hr: 52 });
    expect(seenFilters).toEqual([{ op: "eq", col: "id", val: "profile-1" }]);
  });

  it("updateGender schreibt gender für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateGender("profile-1", "divers");
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ gender: "divers" });
  });

  it("updateHeightCm schreibt height_cm für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateHeightCm("profile-1", 180);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ height_cm: 180 });
  });

  it("updateWeightKg schreibt weight_kg für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateWeightKg("profile-1", 74.5);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ weight_kg: 74.5 });
  });

  it("updateHrMax schreibt hr_max für die eigene Zeile", async () => {
    let seen: Record<string, unknown> = {};
    fakeClient.handlers.profiles = (calls) => {
      seen = calls.payload as Record<string, unknown>;
      return { data: null, error: null };
    };
    const result = await updateHrMax("profile-1", 201);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual({ hr_max: 201 });
  });
});

describe("getProfileBasics (Migration 0039, Fahrplan 17 E2)", () => {
  it("liest die eigene Zeile über profiles_own, ohne zusätzlichen Filter (RLS filtert serverseitig auf auth.uid())", async () => {
    let seenTable = "";
    fakeClient.handlers.profiles_own = (calls) => {
      seenTable = calls.table;
      return {
        data: {
          id: "self-1",
          has_password: true,
          birthdate: "1990-05-01",
          resting_hr: 52,
          gender: "maennlich",
          height_cm: 180,
          weight_kg: "74.5",
          hr_max: 201,
          updated_at: "2026-09-01T00:00:00Z",
        },
        error: null,
      };
    };
    const result = await getProfileBasics();
    expect(seenTable).toBe("profiles_own");
    expect(result).toEqual({
      ok: true,
      basics: {
        hasPassword: true,
        birthdate: "1990-05-01",
        restingHr: 52,
        gender: "maennlich",
        heightCm: 180,
        weightKg: 74.5,
        hrMax: 201,
        updatedAt: "2026-09-01T00:00:00Z",
      },
    });
  });
});
