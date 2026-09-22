/* Tests: useUpdateDisplayName/useUpdateWellbeingPublic/useUpdatePassword —
 * Konto-Einstellungen (Settings, Etappe 9). */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile, ProfileOwnFields } from "../types";

let updateNameCalls: Array<{ userId: string; name: string }> = [];
let updateWellbeingCalls: Array<{ userId: string; value: boolean }> = [];
let updateFtpPublicCalls: Array<{ userId: string; value: boolean }> = [];
let updateLadderProgressionCalls: Array<{ userId: string; value: boolean }> = [];
let profileBasics: ProfileOwnFields | null = null;
let updateBirthdateCalls: Array<{ userId: string; value: string | null }> = [];
let updateRestingHrCalls: Array<{ userId: string; value: number | null }> = [];
let updateGenderCalls: Array<{ userId: string; value: ProfileOwnFields["gender"] }> = [];
let updateHeightCmCalls: Array<{ userId: string; value: number | null }> = [];
let updateWeightKgCalls: Array<{ userId: string; value: number | null }> = [];
let updateHrMaxCalls: Array<{ userId: string; value: number | null }> = [];
const updateSportsCalls: Array<{ userId: string; value: readonly string[] }> = [];

vi.mock("../supabase/profiles", () => ({
  updateDisplayName: async (userId: string, name: string) => {
    updateNameCalls.push({ userId, name });
    return { ok: true };
  },
  updateWellbeingPublic: async (userId: string, value: boolean) => {
    updateWellbeingCalls.push({ userId, value });
    return { ok: true };
  },
  updateFtpPublic: async (userId: string, value: boolean) => {
    updateFtpPublicCalls.push({ userId, value });
    return { ok: true };
  },
  updateLadderProgressionEnabled: async (userId: string, value: boolean) => {
    updateLadderProgressionCalls.push({ userId, value });
    return { ok: true };
  },
  getProfileBasics: async () => {
    if (!profileBasics) return { ok: false, error: { code: "UNKNOWN", message: "keine Zeile" } };
    return { ok: true, basics: profileBasics };
  },
  updateBirthdate: async (userId: string, value: string | null) => {
    updateBirthdateCalls.push({ userId, value });
    return { ok: true };
  },
  updateRestingHr: async (userId: string, value: number | null) => {
    updateRestingHrCalls.push({ userId, value });
    return { ok: true };
  },
  updateGender: async (userId: string, value: ProfileOwnFields["gender"]) => {
    updateGenderCalls.push({ userId, value });
    return { ok: true };
  },
  updateHeightCm: async (userId: string, value: number | null) => {
    updateHeightCmCalls.push({ userId, value });
    return { ok: true };
  },
  updateWeightKg: async (userId: string, value: number | null) => {
    updateWeightKgCalls.push({ userId, value });
    return { ok: true };
  },
  updateHrMax: async (userId: string, value: number | null) => {
    updateHrMaxCalls.push({ userId, value });
    return { ok: true };
  },
  updateSports: async (userId: string, value: readonly string[]) => {
    updateSportsCalls.push({ userId, value });
    return { ok: true };
  },
}));

let updatePasswordCalls: Array<{ currentPassword: string; newPassword: string }> = [];
let updatePasswordResult: { ok: true } | { ok: false; error: { code: "UNKNOWN"; message: string } } = { ok: true };

vi.mock("../supabase/auth", () => ({
  updatePassword: async (currentPassword: string, newPassword: string) => {
    updatePasswordCalls.push({ currentPassword, newPassword });
    return updatePasswordResult;
  },
}));

const { createHarness } = await import("../../test/harness");
const {
  useUpdateDisplayName,
  useUpdateWellbeingPublic,
  useUpdateFtpPublic,
  useUpdateLadderProgressionEnabled,
  useUpdatePassword,
  useProfileBasics,
  useUpdateBirthdate,
  useUpdateRestingHr,
  useUpdateGender,
  useUpdateHeightCm,
  useUpdateWeightKg,
  useUpdateHrMax,
  useUpdateSports,
} = await import("./useProfile");

beforeEach(() => {
  updateNameCalls = [];
  updateWellbeingCalls = [];
  updateFtpPublicCalls = [];
  updateLadderProgressionCalls = [];
  updatePasswordCalls = [];
  updatePasswordResult = { ok: true };
  profileBasics = null;
  updateBirthdateCalls = [];
  updateRestingHrCalls = [];
  updateGenderCalls = [];
  updateHeightCmCalls = [];
  updateWeightKgCalls = [];
  updateHrMaxCalls = [];
});

describe("useUpdateDisplayName", () => {
  it("schreibt unter der eingeloggten User-ID und aktualisiert den Profil-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    const profile: Profile = {
      id: "user-1",
      displayName: "Alt",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: false,
      unitsPreference: "km",
      planOffsetWeeks: 0,
    sports: ["ride"],
    };
    queryClient.setQueryData(["profile", "user-1"], profile);

    const view = renderHook(() => useUpdateDisplayName(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update("Neu");
    });
    expect(result).toEqual({ ok: true, name: "Neu" });
    expect(updateNameCalls).toEqual([{ userId: "user-1", name: "Neu" }]);
    expect((queryClient.getQueryData(["profile", "user-1"]) as Profile).displayName).toBe("Neu");
  });

  it("ohne Session -> Fehler, kein Aufruf", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useUpdateDisplayName(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update("Neu");
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(updateNameCalls).toEqual([]);
  });
});

describe("useUpdateWellbeingPublic", () => {
  it("schreibt den neuen Wert und aktualisiert den Profil-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    const profile: Profile = {
      id: "user-1",
      displayName: "Name",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: false,
      unitsPreference: "km",
      planOffsetWeeks: 0,
    sports: ["ride"],
    };
    queryClient.setQueryData(["profile", "user-1"], profile);

    const view = renderHook(() => useUpdateWellbeingPublic(), { wrapper });
    await act(async () => {
      await view.result.current.update(true);
    });
    expect(updateWellbeingCalls).toEqual([{ userId: "user-1", value: true }]);
    expect((queryClient.getQueryData(["profile", "user-1"]) as Profile).wellbeingPublic).toBe(true);
  });
});

describe("useUpdateFtpPublic (Migration 0025)", () => {
  it("schreibt den neuen Wert und aktualisiert den Profil-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    const profile: Profile = {
      id: "user-1",
      displayName: "Name",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: false,
      unitsPreference: "km",
      planOffsetWeeks: 0,
    sports: ["ride"],
    };
    queryClient.setQueryData(["profile", "user-1"], profile);

    const view = renderHook(() => useUpdateFtpPublic(), { wrapper });
    await act(async () => {
      await view.result.current.update(false);
    });
    expect(updateFtpPublicCalls).toEqual([{ userId: "user-1", value: false }]);
    expect((queryClient.getQueryData(["profile", "user-1"]) as Profile).ftpPublic).toBe(false);
  });
});

describe("useUpdateLadderProgressionEnabled", () => {
  it("schreibt den neuen Wert und aktualisiert den Profil-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    const profile: Profile = {
      id: "user-1",
      displayName: "Name",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: false,
      unitsPreference: "km",
      planOffsetWeeks: 0,
    sports: ["ride"],
    };
    queryClient.setQueryData(["profile", "user-1"], profile);

    const view = renderHook(() => useUpdateLadderProgressionEnabled(), { wrapper });
    await act(async () => {
      await view.result.current.update(true);
    });
    expect(updateLadderProgressionCalls).toEqual([{ userId: "user-1", value: true }]);
    expect((queryClient.getQueryData(["profile", "user-1"]) as Profile).ladderProgressionEnabled).toBe(true);
  });

  it("ohne Session -> Fehler, kein Aufruf", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useUpdateLadderProgressionEnabled(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update(true);
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(updateLadderProgressionCalls).toEqual([]);
  });
});

describe("useUpdatePassword", () => {
  it("reicht aktuelles/neues Passwort durch", async () => {
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useUpdatePassword(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update("alt123", "neu456");
    });
    expect(result).toEqual({ ok: true });
    expect(updatePasswordCalls).toEqual([{ currentPassword: "alt123", newPassword: "neu456" }]);
  });

  it("reicht einen Fehler (z. B. falsches aktuelles Passwort) durch", async () => {
    updatePasswordResult = { ok: false, error: { code: "UNKNOWN", message: "Aktuelles Passwort ist falsch." } };
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useUpdatePassword(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update("falsch", "neu456");
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Aktuelles Passwort ist falsch." } });
  });
});

describe("useProfileBasics (Migration 0039, Fahrplan 17 E2)", () => {
  it("lädt die eigenen profiles_own-Felder", async () => {
    profileBasics = {
      hasPassword: true,
      birthdate: "1990-05-01",
      restingHr: 52,
      gender: "maennlich",
      heightCm: 180,
      weightKg: 74.5,
      hrMax: 201,
      updatedAt: "2026-09-01T00:00:00Z",
    };
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useProfileBasics(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.data).toEqual(profileBasics);
  });

  it("ohne Session -> kein Ladeversuch (enabled: false)", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useProfileBasics(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.data).toBeUndefined();
  });
});

const BASELINE_BASICS: ProfileOwnFields = {
  hasPassword: true,
  birthdate: null,
  restingHr: null,
  gender: null,
  heightCm: null,
  weightKg: null,
  hrMax: null,
  updatedAt: "2026-09-01T00:00:00Z",
};

describe("Profil-Basisdaten-Update-Hooks (Migration 0039, Fahrplan 17 E3)", () => {
  it("useUpdateBirthdate schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateBirthdate(), { wrapper });
    await act(async () => {
      await view.result.current.update("1990-05-01");
    });
    expect(updateBirthdateCalls).toEqual([{ userId: "user-1", value: "1990-05-01" }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).birthdate).toBe(
      "1990-05-01",
    );
  });

  it("useUpdateRestingHr schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateRestingHr(), { wrapper });
    await act(async () => {
      await view.result.current.update(52);
    });
    expect(updateRestingHrCalls).toEqual([{ userId: "user-1", value: 52 }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).restingHr).toBe(52);
  });

  it("useUpdateGender schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateGender(), { wrapper });
    await act(async () => {
      await view.result.current.update("divers");
    });
    expect(updateGenderCalls).toEqual([{ userId: "user-1", value: "divers" }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).gender).toBe("divers");
  });

  it("useUpdateHeightCm schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateHeightCm(), { wrapper });
    await act(async () => {
      await view.result.current.update(180);
    });
    expect(updateHeightCmCalls).toEqual([{ userId: "user-1", value: 180 }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).heightCm).toBe(180);
  });

  it("useUpdateWeightKg schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateWeightKg(), { wrapper });
    await act(async () => {
      await view.result.current.update(74.5);
    });
    expect(updateWeightKgCalls).toEqual([{ userId: "user-1", value: 74.5 }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).weightKg).toBe(74.5);
  });

  it("useUpdateHrMax schreibt den Wert und aktualisiert den profileBasics-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile-basics", "user-1"], BASELINE_BASICS);

    const view = renderHook(() => useUpdateHrMax(), { wrapper });
    await act(async () => {
      await view.result.current.update(201);
    });
    expect(updateHrMaxCalls).toEqual([{ userId: "user-1", value: 201 }]);
    expect((queryClient.getQueryData(["profile-basics", "user-1"]) as ProfileOwnFields).hrMax).toBe(201);
  });

  it("useUpdateSports schreibt das Sportarten-Array und aktualisiert den profile-Cache", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-1" });
    queryClient.setQueryData(["profile", "user-1"], {
      id: "user-1",
      displayName: "Stuhlsen",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: true,
      unitsPreference: "km",
      planOffsetWeeks: 0,
      sports: ["ride"],
    });

    const view = renderHook(() => useUpdateSports(), { wrapper });
    await act(async () => {
      await view.result.current.update(["ride", "run"]);
    });
    expect(updateSportsCalls).toEqual([{ userId: "user-1", value: ["ride", "run"] }]);
    expect((queryClient.getQueryData(["profile", "user-1"]) as Profile).sports).toEqual(["ride", "run"]);
  });

  it("ohne Session -> Fehler, kein Aufruf (Beispiel useUpdateHrMax)", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useUpdateHrMax(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current.update(201);
    });
    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Nicht eingeloggt" } });
    expect(updateHrMaxCalls).toEqual([]);
  });
});
