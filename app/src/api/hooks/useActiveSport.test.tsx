/* Tests: useActiveSport() / useEffectiveSport() — Sport-Umschalter-Zustand
   (Fahrplan 10 E8a, Fahrplan 21 E2). useEffectiveSport liest die Sportarten
   seit E2 über useAthleteSports (DB, Fallback config.ts) und braucht deshalb
   den Auth-Kontext — die useEffectiveSport-Tests werden mit dem Test-Harness
   (QueryClient + AuthContext) gewrappt. Der Umschalter-Zustand wird je Render
   frisch aus localStorage gelesen (useSyncExternalStore), deshalb reicht
   localStorage.clear() im beforeEach — kein vi.resetModules nötig. */

import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useActiveSport, useEffectiveSport } from "./useActiveSport";
import { createHarness } from "../../test/harness";

beforeEach(() => {
  localStorage.clear();
});

describe("useActiveSport", () => {
  it("Default 'ride', wenn nichts gespeichert ist", () => {
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("ride");
  });

  it("liest einen gültigen gespeicherten Wert", () => {
    localStorage.setItem("active_sport", "run");
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("run");
  });

  it("verwirft einen unbekannten Wert und räumt localStorage auf", () => {
    localStorage.setItem("active_sport", "kayak");
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("ride");
    expect(localStorage.getItem("active_sport")).toBeNull();
  });

  it("setActiveSport persistiert und zieht alle Aufrufer nach", () => {
    const a = renderHook(() => useActiveSport());
    const b = renderHook(() => useActiveSport());
    act(() => a.result.current.setActiveSport("swim"));
    expect(a.result.current.activeSport).toBe("swim");
    expect(b.result.current.activeSport).toBe("swim");
    expect(localStorage.getItem("active_sport")).toBe("swim");
  });
});

describe("useEffectiveSport", () => {
  it("klemmt auf 'ride' für einen Athleten ohne die aktive Sportart", () => {
    localStorage.setItem("active_sport", "run");
    const { wrapper } = createHarness();
    // athlete1 hat keine sports-Liste (⇒ ["ride"])
    const { result } = renderHook(() => useEffectiveSport("athlete1"), { wrapper });
    expect(result.current.effectiveSport).toBe("ride");
    // der gespeicherte Wert bleibt erhalten
    expect(localStorage.getItem("active_sport")).toBe("run");
  });

  it("gibt die aktive Sportart durch, wenn der Athlet sie kann (athlete3)", () => {
    localStorage.setItem("active_sport", "run");
    const { wrapper } = createHarness();
    const { result } = renderHook(() => useEffectiveSport("athlete3"), { wrapper });
    expect(result.current.effectiveSport).toBe("run");
    expect(result.current.sports).toEqual(["ride", "run", "swim"]);
  });
});
