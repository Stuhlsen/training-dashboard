import { describe, it, expect } from "vitest";
import { buildRaceResults } from "./race-results-view-model";
import type { EventItem } from "../../api/types";

const TODAY = "2026-09-03";

const ev = (over: Partial<EventItem> & { id: string }): EventItem => ({
  title: "Rennen",
  eventDate: "2026-08-30",
  type: "race",
  priority: null,
  ftpGoal: null,
  isTest: false,
  note: null,
  resultTimeS: null,
  resultAvgWatts: null,
  resultPlaceAg: null,
  resultPlaceOverall: null,
  createdAt: "t",
  updatedAt: "t",
  ...over,
});

describe("buildRaceResults", () => {
  it("nur absolvierte Rennen MIT Ergebnis, neuestes zuerst", () => {
    const events = [
      ev({ id: "gfny", title: "GFNY Bremen", eventDate: "2026-08-30", resultTimeS: 11565, resultPlaceAg: 42 }),
      ev({ id: "future", eventDate: "2026-12-01", resultTimeS: 9000 }), // in der Zukunft
      ev({ id: "noresult", eventDate: "2026-07-01" }), // absolviert, aber ohne Ergebnis
      ev({ id: "other", eventDate: "2026-06-01", type: "other" }), // kein Rennen (kann eh kein Ergebnis tragen)
      ev({ id: "ramp", title: "Ramp Test", eventDate: "2026-05-01", isTest: true, resultTimeS: 1200 }), // Testtermin, kein Rennergebnis
      ev({ id: "spring", title: "Frühjahrscrit", eventDate: "2026-04-12", resultPlaceOverall: 7 }),
    ];
    const rows = buildRaceResults(events, TODAY);
    expect(rows.map((r) => r.id)).toEqual(["gfny", "spring"]);
    expect(rows[0]).toMatchObject({ title: "GFNY Bremen", timeLabel: "3:12:45", placeAg: 42, avgWatts: null });
    expect(rows[1]).toMatchObject({ title: "Frühjahrscrit", timeLabel: "", placeOverall: 7 });
  });

  it("leere Liste → []", () => {
    expect(buildRaceResults([], TODAY)).toEqual([]);
  });

  it("ein am heutigen Tag gefahrenes Rennen zählt als absolviert", () => {
    const rows = buildRaceResults([ev({ id: "today", eventDate: TODAY, resultTimeS: 100 })], TODAY);
    expect(rows).toHaveLength(1);
  });
});
