import { afterEach, describe, expect, it } from "vitest";
import { readExplorerStorage, writeExplorerStorage } from "./explorer-storage";

afterEach(() => localStorage.clear());

describe("explorer-storage", () => {
  it("merged geschriebene Felder statt sie gegenseitig zu überschreiben (Etappe 8d — Bugfix ggü. der alten writeStoredRange())", () => {
    writeExplorerStorage("athlete1", { range: { fromISO: "2026-01-01", toISO: "2026-02-01" } });
    writeExplorerStorage("athlete1", { scenario: { enabled: true, weekTssPct: 10, restDays: 0, rampRatePct: 0 } });

    const stored = readExplorerStorage("athlete1");
    expect(stored.range).toEqual({ fromISO: "2026-01-01", toISO: "2026-02-01" });
    expect(stored.scenario).toEqual({ enabled: true, weekTssPct: 10, restDays: 0, rampRatePct: 0 });
  });

  it("merged compareSlots (Etappe 8e) neben range/scenario, ohne sie zu löschen", () => {
    writeExplorerStorage("athlete1", { range: { fromISO: "2026-01-01", toISO: "2026-02-01" } });
    writeExplorerStorage("athlete1", { scenario: { enabled: true, weekTssPct: 10, restDays: 0, rampRatePct: 0 } });
    writeExplorerStorage("athlete1", {
      compareSlots: { enabled: true, a: { from: "2026-06-01", to: "2026-06-07" }, b: null },
    });

    const stored = readExplorerStorage("athlete1");
    expect(stored.range).toEqual({ fromISO: "2026-01-01", toISO: "2026-02-01" });
    expect(stored.scenario).toEqual({ enabled: true, weekTssPct: 10, restDays: 0, rampRatePct: 0 });
    expect(stored.compareSlots).toEqual({ enabled: true, a: { from: "2026-06-01", to: "2026-06-07" }, b: null });
  });

  it("liefert ein leeres Objekt bei fehlendem oder defektem JSON, statt zu werfen", () => {
    expect(readExplorerStorage("athlete1")).toEqual({});
    localStorage.setItem("explorer_athlete1", "{not json");
    expect(readExplorerStorage("athlete1")).toEqual({});
  });

  it("ist je Athlet getrennt", () => {
    writeExplorerStorage("athlete1", { range: { fromISO: "2026-01-01", toISO: "2026-02-01" } });
    expect(readExplorerStorage("athlete2")).toEqual({});
  });
});
