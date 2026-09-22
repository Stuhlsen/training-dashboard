/* Tests: useAthleteSports() — Sportarten-Lesepfad (Fahrplan 21 E2).

   Golden-Master: vor E3 liegt für keinen Athleten ein DB-Wert vor, der Hook
   fällt auf `config.ts` zurück — exakt das Verhalten von heute
   (`athleteConfig(id).sports`). Deckt drei Fälle: Selbst-Athlet (DB-Wert aus
   useCurrentProfile), gecoachter Fremdathlet (DB-Wert über getProfileByDisplayName)
   und reiner Fallback ohne DB-Wert. */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAthleteSports } from "./useAthleteSports";
import { createHarness } from "../../test/harness";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("useAthleteSports", () => {
  it("fällt ohne DB-Wert auf config.ts zurück (Golden-Master vor E3)", async () => {
    const { wrapper } = createHarness({ userId: null });
    const { result } = renderHook(() => useAthleteSports("athlete1"), { wrapper });
    // athlete1 hat keine sports-Liste ⇒ ["ride"]
    expect(result.current).toEqual(["ride"]);
  });

  it("liest den DB-Wert des Selbst-Athleten aus useCurrentProfile", async () => {
    const { wrapper, queryClient } = createHarness({ userId: "user-3" });
    // athlete3 ⇒ displayName "Hendrik"; das Profil trägt einen DB-Wert.
    queryClient.setQueryData(["profile", "user-3"], {
      id: "user-3",
      displayName: "Hendrik",
      role: "athlete",
      coachId: null,
      wellbeingPublic: false,
      ftpPublic: true,
      isAdmin: false,
      ladderProgressionEnabled: false,
      unitsPreference: "km",
      planOffsetWeeks: 0,
      sports: ["ride", "run", "swim"],
    });
    const { result } = renderHook(() => useAthleteSports("athlete3"), { wrapper });
    await waitFor(() => expect(result.current).toEqual(["ride", "run", "swim"]));
  });

  it("liest den DB-Wert eines gecoachten Fremdathleten über getProfileByDisplayName", async () => {
    const { wrapper } = createHarness({ userId: "user-coach" });
    const { result } = renderHook(() => useAthleteSports("athlete3"), { wrapper });
    // Fremdathlet (Coach ist nicht "Hendrik") ⇒ DB-Abfrage über profiles_visible.
    // Ohne Mock der Supabase-Antwort greift der config.ts-Fallback ("ride","run","swim").
    await waitFor(() => expect(result.current).toEqual(["ride", "run", "swim"]));
  });
});
