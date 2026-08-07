/* Tests: useLadderState()/useLadderPresetSuggestion() — Leiterzustand für
 * Export-Panel-Zeile + Briefing-Gedächtnis (Etappe 7c). */

import { renderHook, waitFor, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const FORMAT = {
  id: "sweetspot-long",
  label: "Sweet Spot lang",
  targetSystem: "power",
  currency: "watt",
  evidenceGrade: "A",
  blockTargets: [],
  axes: { explicitSteps: [{ id: "S1", structureLabel: "2x20" }, { id: "S2", structureLabel: "3x20" }, { id: "S3", structureLabel: "3x25" }] },
};

vi.mock("../supabase/session-formats", () => ({
  getSessionFormats: async () => ({ ok: true, formats: [FORMAT] }),
}));

vi.mock("../supabase/athlete-formats", () => ({
  getAthleteFormats: async (profileId: string) => ({
    ok: true,
    athleteFormats: profileId === "athlete-1" ? [{ id: "af1", formatId: "sweetspot-long", active: true }] : [],
  }),
}));

let ladderHistory: Array<{ formatId: string; step: number; validFrom: string; lockedUntil?: string | null }> = [];

vi.mock("../supabase/ladder", () => ({
  getLadderHistory: async () => ({ ok: true, history: ladderHistory }),
}));

let profileLadderEnabled = false;
vi.mock("../supabase/profiles", () => ({
  getProfile: async () => ({
    ok: true,
    profile: { id: "athlete-1", ladderProgressionEnabled: profileLadderEnabled },
  }),
}));

const { createHarness } = await import("../../test/harness");
const { useLadderState, useLadderPresetSuggestion } = await import("./useLadderState");

beforeEach(() => {
  ladderHistory = [];
  profileLadderEnabled = false;
});

describe("useLadderState", () => {
  it("liefert nur aktive Formate mit Stufe + Nachbarn", async () => {
    ladderHistory = [{ formatId: "sweetspot-long", step: 2, validFrom: "2026-07-01" }];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useLadderState(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.formats).toEqual([
      {
        formatId: "sweetspot-long",
        label: "Sweet Spot lang",
        evidenceGrade: "A",
        step: 2,
        stepData: { id: "S2", structureLabel: "3x20" },
        summary: "Sweet Spot lang · Stufe S2 (3x20)",
        neighbors: { prev: { id: "S1", structureLabel: "2x20" }, next: { id: "S3", structureLabel: "3x25" } },
      },
    ]);
  });

  it("kein Leiterstand-Eintrag -> Stufe 1", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useLadderState(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.formats[0].step).toBe(1);
  });

  it("inaktives/nicht zugeordnetes Format taucht nicht auf", async () => {
    const { wrapper } = createHarness({ userId: "athlete-2" });
    const view = renderHook(() => useLadderState(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.formats).toEqual([]);
  });

  it("ohne Session -> leer, kein Ladeversuch", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useLadderState(), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.formats).toEqual([]);
  });
});

describe("useLadderPresetSuggestion", () => {
  it("ohne Freigabe (ladder_progression_enabled=false) -> kein Vorschlag", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useLadderPresetSuggestion(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current("build", "sweetspot-long");
    });
    expect(result).toEqual({ ok: true, enabled: false, suggestion: null });
  });

  it("mit Freigabe: preset 'build' schlägt Stufe+1 vor", async () => {
    profileLadderEnabled = true;
    ladderHistory = [{ formatId: "sweetspot-long", step: 2, validFrom: "2026-07-01" }];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useLadderPresetSuggestion(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current("build", "sweetspot-long");
    });
    expect(result).toEqual({ ok: true, enabled: true, suggestion: { step: 3, action: "up" } });
  });

  it("aktive Sperre blockiert 'build' -> hold", async () => {
    profileLadderEnabled = true;
    ladderHistory = [
      { formatId: "sweetspot-long", step: 1, validFrom: "2026-07-01", lockedUntil: "2099-01-01" },
    ];
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useLadderPresetSuggestion(), { wrapper });
    let result;
    await act(async () => {
      result = await view.result.current("build", "sweetspot-long");
    });
    expect(result).toEqual({
      ok: true,
      enabled: true,
      suggestion: { step: 1, action: "hold", lockedUntil: "2099-01-01" },
    });
  });
});
