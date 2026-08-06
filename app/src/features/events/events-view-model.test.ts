import { describe, expect, it } from "vitest";
import { groupEvents, priorityBadgeColor, typeBadgeColor } from "./events-view-model";
import type { EventItem } from "../../api/types";

function event(overrides: Partial<EventItem>): EventItem {
  return {
    id: "e1",
    title: "Test-Event",
    eventDate: "2026-08-10",
    type: "race",
    priority: null,
    ftpGoal: null,
    isTest: false,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("groupEvents", () => {
  it("teilt in anstehend (aufsteigend) und vergangen (absteigend)", () => {
    const events = [
      event({ id: "far", eventDate: "2026-09-01" }),
      event({ id: "soon", eventDate: "2026-08-11" }),
      event({ id: "old", eventDate: "2026-07-01" }),
      event({ id: "older", eventDate: "2026-06-01" }),
    ];
    const { upcoming, past } = groupEvents(events, "2026-08-10");
    expect(upcoming.map((e) => e.id)).toEqual(["soon", "far"]);
    expect(past.map((e) => e.id)).toEqual(["old", "older"]);
  });

  it("zählt ein Event am heutigen Datum als anstehend", () => {
    const events = [event({ id: "today", eventDate: "2026-08-10" })];
    const { upcoming, past } = groupEvents(events, "2026-08-10");
    expect(upcoming.map((e) => e.id)).toEqual(["today"]);
    expect(past).toEqual([]);
  });

  it("liefert leere Listen für eine leere Eingabe", () => {
    expect(groupEvents([], "2026-08-10")).toEqual({ upcoming: [], past: [] });
  });
});

describe("typeBadgeColor / priorityBadgeColor", () => {
  it("unterscheidet Rennen/Tour von Sonstiges", () => {
    expect(typeBadgeColor("race")).toBe("var(--ss)");
    expect(typeBadgeColor("other")).toBe("var(--ink-3)");
  });

  it("unterscheidet Hauptziel von Nebenziel", () => {
    expect(priorityBadgeColor("main")).toBe("var(--accent)");
    expect(priorityBadgeColor("secondary")).toBe("var(--ink-3)");
  });
});
