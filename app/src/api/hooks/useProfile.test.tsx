/* Tests: useUpdateDisplayName/useUpdateWellbeingPublic/useUpdatePassword —
 * Konto-Einstellungen (Settings, Etappe 9). */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../types";

let updateNameCalls: Array<{ userId: string; name: string }> = [];
let updateWellbeingCalls: Array<{ userId: string; value: boolean }> = [];
let updateFtpPublicCalls: Array<{ userId: string; value: boolean }> = [];
let updateLadderProgressionCalls: Array<{ userId: string; value: boolean }> = [];

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
} = await import("./useProfile");

beforeEach(() => {
  updateNameCalls = [];
  updateWellbeingCalls = [];
  updateFtpPublicCalls = [];
  updateLadderProgressionCalls = [];
  updatePasswordCalls = [];
  updatePasswordResult = { ok: true };
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
