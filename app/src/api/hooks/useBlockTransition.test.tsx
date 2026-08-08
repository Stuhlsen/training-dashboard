/* Tests: useBlockTransition() — Blockstart-Dialog-Erkennung (Etappe 7d). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localISODate, addDaysISO } from "../../core/format.js";

const TODAY = localISODate();
const SEVEN_DAYS_AGO = addDaysISO(TODAY, -7);

const FORMAT_A = {
  id: "vo2max-a",
  label: "VO2max A",
  targetSystem: "vo2max",
  currency: "watt",
  evidenceGrade: "coaching-konsens",
  blockTargets: ["VO2max"],
  axes: {},
};
const FORMAT_B = {
  id: "vo2max-b",
  label: "VO2max B",
  targetSystem: "vo2max",
  currency: "watt",
  evidenceGrade: "studienlage",
  blockTargets: ["VO2max"],
  axes: {},
};

let activeFormatIds = ["vo2max-a", "vo2max-b"];
let ladderHistory: Array<{ formatId: string; step: number; validFrom: string; reason: string }> = [];

vi.mock("../supabase/session-formats", () => ({
  getSessionFormats: async () => ({ ok: true, formats: [FORMAT_A, FORMAT_B] }),
}));

vi.mock("../supabase/athlete-formats", () => ({
  getAthleteFormats: async (profileId: string) => ({
    ok: true,
    athleteFormats:
      profileId === "self-uuid" ? activeFormatIds.map((formatId, i) => ({ id: `af${i}`, formatId, active: true })) : [],
  }),
}));

vi.mock("../supabase/ladder", () => ({
  getLadderHistory: async () => ({ ok: true, history: ladderHistory }),
}));

vi.mock("../supabase/profiles", () => ({
  getProfile: async (id: string) => ({
    ok: true,
    profile: { id, displayName: null, role: "athlete", coachId: null, wellbeingPublic: false, isAdmin: false, ladderProgressionEnabled: false },
  }),
  findProfileIdByDisplayName: async (name: string) => ({ ok: true, id: name === "Stuhlsen" ? "self-uuid" : "other-uuid" }),
}));

const { createHarness } = await import("../../test/harness");
const { useBlockTransition } = await import("./useBlockTransition");

const CARDS = [
  { id: "c1", date: SEVEN_DAYS_AGO, phase: "Schwelle", cancelled: false },
  { id: "c2", date: TODAY, phase: "VO2max", cancelled: false },
];

beforeEach(() => {
  activeFormatIds = ["vo2max-a", "vo2max-b"];
  ladderHistory = [];
});

describe("useBlockTransition", () => {
  it("Blockwechsel + mehrere aktive Familien -> shouldPrompt mit Kandidaten", async () => {
    const { wrapper } = createHarness({ userId: "self-uuid" });
    const view = renderHook(() => useBlockTransition("athlete1", CARDS), { wrapper });
    await waitFor(() => expect(view.result.current.transition.shouldPrompt).toBe(true));
    expect(view.result.current.transition.blockTarget).toBe("VO2max");
    expect(view.result.current.transition.candidates?.map((c) => c.id)).toEqual(["vo2max-a", "vo2max-b"]);
  });

  it("nur eine aktive Familie im Blockziel -> kein Prompt", async () => {
    activeFormatIds = ["vo2max-b"];
    const { wrapper } = createHarness({ userId: "self-uuid" });
    const view = renderHook(() => useBlockTransition("athlete1", CARDS), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.transition.shouldPrompt).toBe(false);
  });

  it("schon entschieden seit Blockbeginn -> kein Prompt", async () => {
    ladderHistory = [{ formatId: "vo2max-a", step: 1, validFrom: addDaysISO(TODAY, -3), reason: "block-start" }];
    const { wrapper } = createHarness({ userId: "self-uuid" });
    const view = renderHook(() => useBlockTransition("athlete1", CARDS), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.transition.shouldPrompt).toBe(false);
  });

  it("kein Blockwechsel (Blockziel seit 7 Tagen unverändert) -> kein Prompt", async () => {
    const stableCards = [
      { id: "c1", date: SEVEN_DAYS_AGO, phase: "VO2max", cancelled: false },
      { id: "c2", date: TODAY, phase: "VO2max", cancelled: false },
    ];
    const { wrapper } = createHarness({ userId: "self-uuid" });
    const view = renderHook(() => useBlockTransition("athlete1", stableCards), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.transition.shouldPrompt).toBe(false);
  });

  it("fremder Athlet (nicht der eingeloggte User selbst) -> Query bleibt aus, kein Prompt", async () => {
    const { wrapper } = createHarness({ userId: "other-uuid" });
    const view = renderHook(() => useBlockTransition("athlete1", CARDS), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.transition.shouldPrompt).toBe(false);
  });
});
