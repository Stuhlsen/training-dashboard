/* Tests: useTrainerViewPrefs() — Kacheln-Auswahl der Trainer-Leiste. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../test/harness";

let stored: Record<string, string[] | null> = {};
let setViewPrefsCalls: Array<{ trainerId: string; athleteId: string; categories: string[] }> = [];

vi.mock("../supabase/trainer-view-prefs", () => ({
  getViewPrefs: async (trainerId: string, athleteId: string) => ({
    ok: true,
    categories: stored[`${trainerId}:${athleteId}`] ?? null,
  }),
  setViewPrefs: async (trainerId: string, athleteId: string, categories: string[]) => {
    setViewPrefsCalls.push({ trainerId, athleteId, categories });
    stored[`${trainerId}:${athleteId}`] = categories;
    return { ok: true };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useTrainerViewPrefs } = await import("./useTrainerViewPrefs");

beforeEach(() => {
  stored = {};
  setViewPrefsCalls = [];
});

describe("useTrainerViewPrefs", () => {
  it("lädt die gespeicherte Auswahl", async () => {
    stored["coach-1:profile-uuid-2"] = ["wellbeing7d", "conflicts"];
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerViewPrefs("coach-1", "profile-uuid-2"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.categories).toEqual(["wellbeing7d", "conflicts"]);
  });

  it("noch nie gespeichert (null) → leeres Array, kein Absturz", async () => {
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerViewPrefs("coach-1", "profile-uuid-2"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.categories).toEqual([]);
  });

  it("lädt nicht ohne athleteProfileId (Trainer-Kontext noch nicht aufgelöst)", async () => {
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerViewPrefs("coach-1", null), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.categories).toEqual([]);
  });

  it("setCategories aktualisiert den Cache SOFORT, noch vor dem Resolve des Schreibvorgangs", async () => {
    const write = deferred<{ ok: true }>();
    const setViewPrefsMock = vi.fn(async (trainerId: string, athleteId: string, categories: string[]) => {
      setViewPrefsCalls.push({ trainerId, athleteId, categories });
      await write.promise;
      return { ok: true as const };
    });
    const mod = await import("../supabase/trainer-view-prefs");
    vi.spyOn(mod, "setViewPrefs").mockImplementation(setViewPrefsMock);

    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerViewPrefs("coach-1", "profile-uuid-2"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    view.result.current.setCategories(["ctlAtl"]);
    // Optimistisch, ohne auf den Server zu warten.
    await waitFor(() => expect(view.result.current.categories).toEqual(["ctlAtl"]));
    expect(setViewPrefsCalls).toHaveLength(1);

    write.resolve({ ok: true });
  });

  it("Fehler beim Speichern rollt die Auswahl NICHT zurück", async () => {
    const mod = await import("../supabase/trainer-view-prefs");
    vi.spyOn(mod, "setViewPrefs").mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN", message: "Netzwerkfehler" },
    });

    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerViewPrefs("coach-1", "profile-uuid-2"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));

    view.result.current.setCategories(["lastRides"]);
    await waitFor(() => expect(view.result.current.categories).toEqual(["lastRides"]));
    // Zustand bleibt bewusst stehen, auch nachdem die Mutation als Fehler durch ist.
    await new Promise((r) => setTimeout(r, 0));
    expect(view.result.current.categories).toEqual(["lastRides"]);
  });
});
