/* Tests: useAthleteConfig() — Platz liefert config.ts, `self` die DB-Stammdaten. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../../test/harness";

const mocks = vi.hoisted(() => ({
  fetchAthleteProfileId: vi.fn(),
  getProfile: vi.fn(),
  getAthleteProfileExtras: vi.fn(),
  getTrainingMeta: vi.fn(),
}));
vi.mock("./useAthleteProfileId", () => ({ fetchAthleteProfileId: mocks.fetchAthleteProfileId }));
vi.mock("../supabase/profiles", () => ({ getProfile: mocks.getProfile }));
vi.mock("../supabase/athlete-profile-extras", () => ({
  getAthleteProfileExtras: mocks.getAthleteProfileExtras,
}));
vi.mock("../supabase/training-profile-data", () => ({ getTrainingMeta: mocks.getTrainingMeta }));

const { useAthleteConfig } = await import("./useAthleteConfig");
const { athleteConfig } = await import("../../config");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.fetchAthleteProfileId.mockResolvedValue("uuid-1");
  mocks.getProfile.mockResolvedValue({
    ok: true,
    profile: { displayName: "demo.person", sports: ["ride"] },
  });
  mocks.getAthleteProfileExtras.mockResolvedValue({ ok: true, extras: null });
  mocks.getTrainingMeta.mockResolvedValue({ ok: true, meta: { ftp: 201, ftpGoal: 215 } });
});

describe("useAthleteConfig", () => {
  it("Platz in config.ts: dieselbe Config wie athleteConfig(), ohne DB-Zugriff", () => {
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useAthleteConfig("athlete1"), { wrapper });
    expect(result.current).toBe(athleteConfig("athlete1"));
    expect(mocks.fetchAthleteProfileId).not.toHaveBeenCalled();
  });

  it("self: baut die Stammdaten aus Profil und meta", async () => {
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useAthleteConfig("self"), { wrapper });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({
      id: "self",
      name: "demo.person",
      ftpMeasured: 201,
      ftpGoal: 215,
    });
    expect(mocks.getTrainingMeta).toHaveBeenCalledWith("uuid-1");
  });

  it("self: fällt eine Quelle aus, bleiben die anderen erhalten", async () => {
    mocks.getTrainingMeta.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "boom" },
    });
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useAthleteConfig("self"), { wrapper });
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.name).toBe("demo.person");
    expect(result.current?.ftpMeasured).toBeNull();
  });

  it("self ohne auflösbares Profil: null", async () => {
    mocks.fetchAthleteProfileId.mockResolvedValue(null);
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useAthleteConfig("self"), { wrapper });
    await waitFor(() => expect(mocks.fetchAthleteProfileId).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
