/* Tests: useAthleteFormats()/useSetAthleteFormatActive() — voller
 * Formatkatalog + Aktiv-Status für die Formate-Sektion in Settings
 * (Etappe 9), anders als useLadderState() (nur aktive Formate). */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FORMAT_A = {
  id: "sweetspot-long",
  label: "Sweet Spot lang",
  targetSystem: "power",
  currency: "watt",
  evidenceGrade: "A",
  blockTargets: [],
  axes: {},
};
const FORMAT_B = {
  id: "threshold-long",
  label: "Schwelle lang",
  targetSystem: "power",
  currency: "watt",
  evidenceGrade: "B",
  blockTargets: [],
  axes: {},
};

vi.mock("../supabase/session-formats", () => ({
  getSessionFormats: async () => ({ ok: true, formats: [FORMAT_A, FORMAT_B] }),
}));

let setActiveCalls: Array<{ profileId: string; formatId: string; active: boolean }> = [];
let setActiveResult: { ok: true } | { ok: false; error: { code: "UNKNOWN"; message: string } } = { ok: true };

vi.mock("../supabase/athlete-formats", () => ({
  getAthleteFormats: async (profileId: string) => ({
    ok: true,
    athleteFormats: profileId === "athlete-1" ? [{ id: "af1", formatId: "sweetspot-long", active: true }] : [],
  }),
  setAthleteFormatActive: async (profileId: string, formatId: string, active: boolean) => {
    setActiveCalls.push({ profileId, formatId, active });
    return setActiveResult;
  },
}));

const { createHarness } = await import("../../test/harness");
const { useAthleteFormats, useSetAthleteFormatActive } = await import("./useAthleteFormats");

beforeEach(() => {
  setActiveCalls = [];
  setActiveResult = { ok: true };
});

describe("useAthleteFormats", () => {
  it("liefert den VOLLEN Katalog mit Aktiv-Status je Format", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useAthleteFormats(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.entries).toEqual([
      { format: FORMAT_A, active: true },
      { format: FORMAT_B, active: false },
    ]);
  });
});

describe("useSetAthleteFormatActive", () => {
  it("aktualisiert den Cache optimistisch und schreibt unter der Profil-ID", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "athlete-1" });
    const listView = renderHook(() => useAthleteFormats(), { wrapper });
    await waitFor(() => expect(listView.result.current.isLoading).toBe(false));

    const mutateView = renderHook(() => useSetAthleteFormatActive(), { wrapper });
    await act(async () => {
      await mutateView.result.current.setActive("threshold-long", true);
    });

    expect(setActiveCalls).toEqual([{ profileId: "athlete-1", formatId: "threshold-long", active: true }]);
    expect(queryClient.getQueryData(["athlete-formats", "athlete-1"])).toEqual([
      { format: FORMAT_A, active: true },
      { format: FORMAT_B, active: true },
    ]);
  });

  it("rollt den optimistischen Stand bei Schreibfehler zurück", async () => {
    setActiveResult = { ok: false, error: { code: "UNKNOWN", message: "Schreibfehler" } };
    const { wrapper, queryClient } = createHarness({ userId: "athlete-1" });
    const listView = renderHook(() => useAthleteFormats(), { wrapper });
    await waitFor(() => expect(listView.result.current.isLoading).toBe(false));

    const mutateView = renderHook(() => useSetAthleteFormatActive(), { wrapper });
    let result;
    await act(async () => {
      result = await mutateView.result.current.setActive("threshold-long", true);
    });

    expect(result).toEqual({ ok: false, error: { code: "UNKNOWN", message: "Schreibfehler" } });
    await waitFor(() =>
      expect(queryClient.getQueryData(["athlete-formats", "athlete-1"])).toEqual([
        { format: FORMAT_A, active: true },
        { format: FORMAT_B, active: false },
      ]),
    );
  });
});
