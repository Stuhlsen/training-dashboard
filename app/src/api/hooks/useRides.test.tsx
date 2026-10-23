/* Tests: useRides() — Plätze und `self` lesen die Tabellen (Fahrplan 26 E3/E5). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHarness } from "../../test/harness";
import { emptyAthleteData } from "../pipeline";

const mocks = vi.hoisted(() => ({
  loadProfileTrainingData: vi.fn(),
  fetchAthleteProfileId: vi.fn(),
}));
vi.mock("../training-payload", () => ({ loadProfileTrainingData: mocks.loadProfileTrainingData }));
vi.mock("./useAthleteProfileId", () => ({ fetchAthleteProfileId: mocks.fetchAthleteProfileId }));
vi.mock("./useActiveSport", () => ({ useEffectiveSport: () => ({ effectiveSport: "ride" }) }));

const { useRides } = await import("./useRides");

const ride = { date: "2026-10-01", sport: "ride" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("useRides", () => {
  it("Platz in config.ts: löst die Profil-UUID auf und liest die Tabellen", async () => {
    mocks.fetchAthleteProfileId.mockResolvedValue("uuid-a1");
    mocks.loadProfileTrainingData.mockResolvedValue({
      ok: true,
      data: { ...emptyAthleteData(), rides: [ride], trainingDataEmpty: false },
    });
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useRides("athlete1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.fetchAthleteProfileId).toHaveBeenCalledWith(expect.anything(), "athlete1");
    expect(mocks.loadProfileTrainingData).toHaveBeenCalledWith("uuid-a1");
  });

  it("self: löst die Profil-UUID auf und liest die Tabellen", async () => {
    mocks.fetchAthleteProfileId.mockResolvedValue("uuid-1");
    mocks.loadProfileTrainingData.mockResolvedValue({
      ok: true,
      data: { ...emptyAthleteData(), rides: [ride], trainingDataEmpty: false },
    });
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useRides("self"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.loadProfileTrainingData).toHaveBeenCalledWith("uuid-1");
    expect(result.current.data?.rides).toHaveLength(1);
    expect(result.current.data?.trainingDataEmpty).toBe(false);
  });

  it("self ohne auflösbares Profil: leerer Datensatz, als leer markiert, kein Fehler", async () => {
    mocks.fetchAthleteProfileId.mockResolvedValue(null);
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useRides("self"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.trainingDataEmpty).toBe(true);
    expect(mocks.loadProfileTrainingData).not.toHaveBeenCalled();
  });

  it("self: Lesefehler der Tabellen wird zum Query-Fehler (nicht zum Leerzustand)", async () => {
    mocks.fetchAthleteProfileId.mockResolvedValue("uuid-1");
    mocks.loadProfileTrainingData.mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "permission denied" },
    });
    const { wrapper } = createHarness({ userId: "u" });
    const { result } = renderHook(() => useRides("self"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
