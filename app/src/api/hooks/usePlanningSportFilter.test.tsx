/* Tests: usePlanningSportFilter() — Sportfilter der Planungsseite (Fahrplan 44
   E1). Eigener localStorage-Schlüssel, ändert NIE den globalen Umschalter
   (`active_sport`). */

import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePlanningSportFilter } from "./usePlanningSportFilter";
import { useActiveSport } from "./useActiveSport";
import { createHarness } from "../../test/harness";

beforeEach(() => {
  localStorage.clear();
});

describe("usePlanningSportFilter", () => {
  it("Default 'all' für einen Mehrsport-Athleten (athlete3)", () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanningSportFilter("athlete3"), { wrapper });
    expect(result.current.filter).toBe("all");
    expect(result.current.isMultiSport).toBe(true);
    expect(result.current.sports).toEqual(["ride", "run", "swim"]);
  });

  it("Einzelsport-Athlet: kein Filter, immer 'all' mit isMultiSport=false", () => {
    localStorage.setItem("planning_sport_filter", "run");
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanningSportFilter("athlete1"), { wrapper });
    expect(result.current.isMultiSport).toBe(false);
    expect(result.current.filter).toBe("all");
  });

  it("setFilter persistiert unter eigenem Schlüssel und lässt active_sport unberührt", () => {
    localStorage.setItem("active_sport", "ride");
    const { wrapper } = createHarness();
    const { result } = renderHook(
      () => ({ f: usePlanningSportFilter("athlete3"), a: useActiveSport() }),
      { wrapper },
    );
    act(() => result.current.f.setFilter("run"));
    expect(result.current.f.filter).toBe("run");
    expect(localStorage.getItem("planning_sport_filter")).toBe("run");
    expect(localStorage.getItem("active_sport")).toBe("ride");
    expect(result.current.a.activeSport).toBe("ride");
  });

  it("'all' wird als Filter gespeichert, aber nie als ActiveSport", () => {
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanningSportFilter("athlete3"), { wrapper });
    act(() => result.current.setFilter("swim"));
    act(() => result.current.setFilter("all"));
    expect(result.current.filter).toBe("all");
    expect(localStorage.getItem("active_sport")).toBeNull();
  });

  it("verwirft unbekannte Werte (→ 'all')", () => {
    localStorage.setItem("planning_sport_filter", "kayak");
    const { wrapper } = createHarness();
    const { result } = renderHook(() => usePlanningSportFilter("athlete3"), { wrapper });
    expect(result.current.filter).toBe("all");
    expect(localStorage.getItem("planning_sport_filter")).toBeNull();
  });

  it("klemmt eine gespeicherte Sportart, die der Athlet nicht hat, auf 'all'", () => {
    localStorage.setItem("planning_sport_filter", "swim");
    const { wrapper } = createHarness();
    // athlete2: nur Rad
    const { result } = renderHook(() => usePlanningSportFilter("athlete2"), { wrapper });
    expect(result.current.filter).toBe("all");
  });

  it("zieht mehrere Aufrufer gleichzeitig nach (Header-Toggle + Seite)", () => {
    const { wrapper } = createHarness();
    const a = renderHook(() => usePlanningSportFilter("athlete3"), { wrapper });
    const b = renderHook(() => usePlanningSportFilter("athlete3"), { wrapper });
    act(() => a.result.current.setFilter("run"));
    expect(b.result.current.filter).toBe("run");
  });
});
