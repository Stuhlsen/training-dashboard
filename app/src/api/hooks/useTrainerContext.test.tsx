/* Tests: useTrainerContext() — React-Wrapper um resolveTrainerContext().
 *
 * Fokus hier ist NICHT die Lookup-Logik selbst (die ist bereits in
 * write-authorization.test.ts abgedeckt), sondern das Hook-spezifische
 * Verhalten: keyed Query pro (userId, athleteId), fail-closed während des
 * Ladens, kein gecachter Stand vom vorherigen Athleten (Bugfix-Pattern aus
 * ui/trainer-bar.js::_draw(), Vanilla, Playwright-bestätigt 25.07.2026).
 *
 * Wichtig für die Wait-Bedingungen: `isLoading` einer DISABLED Query ist in
 * React Query v5 bereits `false` (isPending && isFetching, isFetching ist
 * bei enabled:false nie true) — solange das Profil (erster Query-Schritt)
 * noch lädt, ist die trainerContext-Query also disabled UND "isLoading:false"
 * zugleich. Ein `waitFor(() => isLoading === false)` direkt nach dem Mount
 * kann deshalb VOR der eigentlichen Auflösung durchlaufen (Testing Librarys
 * `waitFor` prüft die Bedingung zuerst synchron). Die Tests warten daher auf
 * ein Signal, das nachweislich erst NACH der echten Auflösung eintritt
 * (isTrainer:true, oder eine gestiegene Mock-Aufrufzahl). */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

let getProfileByDisplayNameCalls = 0;
let getProfileCalls = 0;

vi.mock("../supabase/profiles", () => ({
  getProfile: async (id: string) => {
    getProfileCalls++;
    return {
      ok: true,
      profile: {
        id,
        displayName: null,
        role: id === "coach-1" ? "coach" : "athlete",
        coachId: null,
        wellbeingPublic: false,
        isAdmin: false,
        ladderProgressionEnabled: false,
      },
    };
  },
  getProfileByDisplayName: async (name: string) => {
    getProfileByDisplayNameCalls++;
    return name === "hc_diZee"
      ? { ok: true, profile: { id: "profile-uuid-dizee", coachId: "coach-1" } }
      : { ok: true, profile: { id: "profile-uuid-stuhlsen", coachId: "irgendein-anderer-coach" } };
  },
}));

const { createHarness } = await import("../../test/harness");
const { useTrainerContext } = await import("./useTrainerContext");

beforeEach(() => {
  getProfileByDisplayNameCalls = 0;
  getProfileCalls = 0;
});

describe("useTrainerContext", () => {
  it("Nicht-Coach löst keinen Lookup aus, isTrainer bleibt false", async () => {
    const { wrapper } = createHarness({ userId: "athlete-1" });
    const view = renderHook(() => useTrainerContext("athlete2"), { wrapper });
    // Profil muss erst geladen sein, bevor die trainerContext-Query
    // (enabled: !!user) überhaupt startet — das ist der einzige verlässliche
    // Beleg, dass der ganze Ladepfad einmal durchlief.
    await waitFor(() => expect(getProfileCalls).toBe(1));
    expect(view.result.current.isTrainer).toBe(false);
    expect(getProfileByDisplayNameCalls).toBe(0);
  });

  it("Coach mit Match → isTrainer:true + korrekte athleteProfileId", async () => {
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerContext("athlete2"), { wrapper });
    await waitFor(() => expect(view.result.current.isTrainer).toBe(true));
    expect(view.result.current.athleteProfileId).toBe("profile-uuid-dizee");
  });

  it("Coach ohne Match → isTrainer:false", async () => {
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(() => useTrainerContext("athlete1"), { wrapper });
    await waitFor(() => expect(getProfileByDisplayNameCalls).toBe(1));
    expect(view.result.current.isTrainer).toBe(false);
  });

  it("Athletenwechsel: der neue Athlet hinterlässt keinen falschen Stand aus dem alten Key", async () => {
    const { wrapper } = createHarness({ userId: "coach-1" });
    const view = renderHook(({ athleteId }) => useTrainerContext(athleteId), {
      wrapper,
      initialProps: { athleteId: "athlete2" },
    });
    await waitFor(() => expect(view.result.current.isTrainer).toBe(true));

    view.rerender({ athleteId: "athlete1" });
    // Neuer Key (anderer athleteId) → eigener, noch leerer Cache-Eintrag,
    // kein Leck des "true" vom vorherigen Athleten während des Ladens.
    expect(view.result.current.isTrainer).toBe(false);
    await waitFor(() => expect(getProfileByDisplayNameCalls).toBe(2));
    expect(view.result.current.isTrainer).toBe(false);
  });

  it("nicht eingeloggt → isTrainer:false, kein Lookup", async () => {
    const { wrapper } = createHarness({ userId: null });
    const view = renderHook(() => useTrainerContext("athlete2"), { wrapper });
    await waitFor(() => expect(view.result.current.isLoading).toBe(false));
    expect(view.result.current.isTrainer).toBe(false);
    expect(getProfileByDisplayNameCalls).toBe(0);
    expect(getProfileCalls).toBe(0);
  });
});
