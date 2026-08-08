/* Tests: die Check-in-Hooks.
 *
 * Der Check-in hängt an der auth.uid() des eingeloggten Users, NICHT am
 * Athleten-Toggle. In der Vanilla-Version brauchte es dafür einen
 * onSessionChange-Handler (State leeren bei Logout, neu laden bei Login)
 * und einen requestGuard gegen Antworten für den vorherigen User. Beides
 * ersetzt hier der user-gebundene Query-Key — was die Tests unten belegen. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckinInput } from "../types";

const TODAY = new Date().toISOString().slice(0, 10);

let rangeCalls: Array<{ athleteId: string; from: string; to: string }> = [];
let upsertCalls: Array<{ athleteId: string; date: string; input: CheckinInput }> = [];
let storedCheckins: Record<string, Array<Record<string, unknown>>> = {};

vi.mock("../supabase/wellbeing", () => ({
  getRange: async (athleteId: string, from: string, to: string) => {
    rangeCalls.push({ athleteId, from, to });
    return { ok: true, checkins: storedCheckins[athleteId] ?? [] };
  },
  upsertToday: async (athleteId: string, date: string, input: CheckinInput) => {
    upsertCalls.push({ athleteId, date, input });
    return {
      ok: true,
      checkin: { id: "row-1", date, ...input, note: input.note ?? null, updatedAt: "t" },
    };
  },
  getSharedRange: async () => ({
    ok: true,
    checkins: [{ date: TODAY, energy: 5, muscleFeel: 4, mood: 5 }],
  }),
}));

vi.mock("../supabase/profiles", () => ({
  findProfileIdByDisplayName: async () => ({ ok: true, id: "profile-uuid-1" }),
  getProfile: async (id: string) => ({
    ok: true,
    profile: {
      id,
      displayName: "Stuhlsen",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      isAdmin: false,
      ladderProgressionEnabled: false,
    },
  }),
}));

const { createHarness } = await import("../../test/harness");
const { useTodayCheckin, useSaveCheckin, useSharedCheckin } = await import("./useWellbeing");

beforeEach(() => {
  rangeCalls = [];
  upsertCalls = [];
  storedCheckins = {};
});

describe("useTodayCheckin", () => {
  it("lädt zwei Tage, liefert aber nur den exakten Heute-Treffer als checkin", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    storedCheckins["user-1"] = [
      { id: "y", date: yesterday, energy: 2, muscleFeel: 2, mood: 2, note: null, updatedAt: "t" },
      { id: "t", date: TODAY, energy: 4, muscleFeel: 4, mood: 4, note: null, updatedAt: "t" },
    ];
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useTodayCheckin(), { wrapper });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(rangeCalls[0]).toMatchObject({ athleteId: "user-1", to: TODAY });
    expect(rangeCalls[0].from).toBe(yesterday);
    expect(view.result.current.data?.checkin?.id).toBe("t");
  });

  it("zeigt einen Vortagswert NIE als heutigen Check-in, nur als subjektiven Kanal", async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    storedCheckins["user-1"] = [
      { id: "y", date: yesterday, energy: 2, muscleFeel: 2, mood: 2, note: null, updatedAt: "t" },
    ];
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(() => useTodayCheckin(), { wrapper });

    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data?.checkin).toBeNull();
    expect(view.result.current.data?.subjective?.freshness).toBe("veraltet");
  });

  it("lädt gar nicht erst ohne Login", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useTodayCheckin(), { wrapper });
    await waitFor(() => expect(view.result.current.fetchStatus).toBe("idle"));
    expect(rangeCalls).toHaveLength(0);
  });
});

describe("useSaveCheckin", () => {
  it("schreibt auf die eigene auth.uid() und aktualisiert den Cache ohne zweiten Request", async () => {
    const { wrapper } = createHarness({ userId: "user-1" });
    const view = renderHook(
      () => ({ today: useTodayCheckin(), save: useSaveCheckin() }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.today.isSuccess).toBe(true));
    const requestsBefore = rangeCalls.length;

    const result = await view.result.current.save.save({ energy: 5, muscleFeel: 4, mood: 5 });
    expect(result.ok).toBe(true);
    expect(upsertCalls[0]).toMatchObject({ athleteId: "user-1", date: TODAY });

    await waitFor(() => expect(view.result.current.today.data?.checkin?.energy).toBe(5));
    // "heute vorhanden" genügt für die Frische-Einstufung — kein erneuter
    // Range-Request nur, um den gestrigen Wert wieder mitzuschleppen.
    expect(rangeCalls).toHaveLength(requestsBefore);
    expect(view.result.current.today.data?.subjective?.freshness).toBe("vorhanden");
  });

  it("schreibt nicht ohne Login", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSaveCheckin(), { wrapper });
    const result = await view.result.current.save({ energy: 3, muscleFeel: 3, mood: 3 });
    expect(result.ok).toBe(false);
    expect(upsertCalls).toHaveLength(0);
  });
});

describe("Kontowechsel", () => {
  it("hält Check-ins je User getrennt, ohne Handler auf Login/Logout", async () => {
    storedCheckins["user-1"] = [
      { id: "a", date: TODAY, energy: 1, muscleFeel: 1, mood: 1, note: null, updatedAt: "t" },
    ];
    storedCheckins["user-2"] = [
      { id: "b", date: TODAY, energy: 5, muscleFeel: 5, mood: 5, note: null, updatedAt: "t" },
    ];

    const first = createHarness({ userId: "user-1" });
    const viewA = renderHook(() => useTodayCheckin(), { wrapper: first.wrapper });
    await waitFor(() => expect(viewA.result.current.data?.checkin?.id).toBe("a"));

    const second = createHarness({ userId: "user-2" });
    const viewB = renderHook(() => useTodayCheckin(), { wrapper: second.wrapper });
    await waitFor(() => expect(viewB.result.current.data?.checkin?.id).toBe("b"));

    // Der Cache des ersten Users ist unangetastet — eine Antwort für ihn
    // kann den des zweiten nicht erreichen, weil der Key die User-ID trägt.
    expect(viewA.result.current.data?.checkin?.id).toBe("a");
  });
});

describe("useSharedCheckin", () => {
  it("liest den freigegebenen Check-in eines beliebigen Athleten ohne Login", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useSharedCheckin("athlete1"), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data).toMatchObject({ energy: 5, muscleFeel: 4, mood: 5 });
    // note taucht in der Shared-View nie auf.
    expect(view.result.current.data && "note" in view.result.current.data).toBe(false);
  });
});
