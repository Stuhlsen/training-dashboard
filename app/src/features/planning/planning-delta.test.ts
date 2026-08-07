import { describe, expect, it } from "vitest";
import { computeDeltaBanner } from "./planning-delta";

type EventItem = import("../../api/types").EventItem;

function event(overrides: Partial<EventItem> & { eventDate: string }): EventItem {
  return {
    id: "e1",
    title: "Rennen",
    type: "race",
    priority: "main",
    ftpGoal: null,
    isTest: false,
    note: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as EventItem;
}

const mkProjection = (horizonEnd: string, days: Array<{ date: string; tsb: number; ctl?: number; atl?: number }>) => ({
  horizonEnd,
  startCtl: 55,
  startAtl: 60,
  hasBaseline: true,
  asOf: "2026-07-24",
  days: days.map((d) => ({ ctl: 55, atl: 60, tss: 0, cardIds: [], uncertain: false, ...d })),
});

describe("computeDeltaBanner", () => {
  it("liefert den Event-Teil, wenn ein Rennen im Horizont TSB-Vorher/Nachher zeigt", () => {
    const before = mkProjection("2026-08-10", [{ date: "2026-08-05", tsb: -10 }]);
    const after = mkProjection("2026-08-10", [{ date: "2026-08-05", tsb: -4 }]);
    const events = [event({ eventDate: "2026-08-05" })];

    const result = computeDeltaBanner(before, after, events, "2026-07-24");
    expect(result?.event).toEqual({ event: events[0], before: -10, after: -4 });
    expect(result?.impact).toBeNull();
  });

  it("liefert den Impact-Teil unabhängig vom Event, wenn cardDateIso gesetzt ist", () => {
    const before = mkProjection("2026-08-10", [{ date: "2026-07-25", tsb: 0, ctl: 55, atl: 60 }]);
    const after = mkProjection("2026-08-10", [{ date: "2026-07-25", tsb: 0, ctl: 54, atl: 55 }]);

    const result = computeDeltaBanner(before, after, [], "2026-07-24", "2026-07-25");
    expect(result?.event).toBeNull();
    expect(result?.impact?.date).toBe("2026-07-25");
    expect(result?.impact?.before.deltaFitness).toBeCloseTo(55 - 55, 5);
    expect(result?.impact?.after.deltaFitness).toBeCloseTo(54 - 55, 5);
  });

  it("null wenn weder ein Event im Horizont liegt noch cardDateIso in der Projektion enthalten ist", () => {
    const projection = mkProjection("2026-08-10", [{ date: "2026-07-25", tsb: 0 }]);
    expect(computeDeltaBanner(projection, projection, [], "2026-07-24")).toBeNull();
    expect(computeDeltaBanner(projection, projection, [], "2026-07-24", "2026-09-01")).toBeNull();
  });
});
