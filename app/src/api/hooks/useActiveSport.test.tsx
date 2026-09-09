/* Tests: useActiveSport() / useEffectiveSport() — Sport-Umschalter-Zustand
   (Fahrplan 10 E8a). Der modul-weite Zustand wird beim Import einmal aus
   localStorage gelesen — die Tests importieren das Modul deshalb je Fall
   frisch (vi.resetModules) mit vorbereitetem localStorage. */

import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function load() {
  return import("./useActiveSport");
}

describe("useActiveSport", () => {
  it("Default 'ride', wenn nichts gespeichert ist", async () => {
    const { useActiveSport } = await load();
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("ride");
  });

  it("liest einen gültigen gespeicherten Wert", async () => {
    localStorage.setItem("active_sport", "run");
    const { useActiveSport } = await load();
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("run");
  });

  it("verwirft einen unbekannten Wert und räumt localStorage auf", async () => {
    localStorage.setItem("active_sport", "kayak");
    const { useActiveSport } = await load();
    const { result } = renderHook(() => useActiveSport());
    expect(result.current.activeSport).toBe("ride");
    expect(localStorage.getItem("active_sport")).toBeNull();
  });

  it("setActiveSport persistiert und zieht alle Aufrufer nach", async () => {
    const { useActiveSport } = await load();
    const a = renderHook(() => useActiveSport());
    const b = renderHook(() => useActiveSport());
    act(() => a.result.current.setActiveSport("swim"));
    expect(a.result.current.activeSport).toBe("swim");
    expect(b.result.current.activeSport).toBe("swim");
    expect(localStorage.getItem("active_sport")).toBe("swim");
  });
});

describe("useEffectiveSport", () => {
  it("klemmt auf 'ride' für einen Athleten ohne die aktive Sportart", async () => {
    localStorage.setItem("active_sport", "run");
    const { useEffectiveSport } = await load();
    // athlete1 hat keine sports-Liste (⇒ ["ride"])
    const { result } = renderHook(() => useEffectiveSport("athlete1"));
    expect(result.current.effectiveSport).toBe("ride");
    // der gespeicherte Wert bleibt erhalten
    expect(localStorage.getItem("active_sport")).toBe("run");
  });

  it("gibt die aktive Sportart durch, wenn der Athlet sie kann (athlete3)", async () => {
    localStorage.setItem("active_sport", "run");
    const { useEffectiveSport } = await load();
    const { result } = renderHook(() => useEffectiveSport("athlete3"));
    expect(result.current.effectiveSport).toBe("run");
    expect(result.current.sports).toEqual(["ride", "run", "swim"]);
  });
});
