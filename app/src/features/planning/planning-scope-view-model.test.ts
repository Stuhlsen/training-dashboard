import { describe, expect, it } from "vitest";
import { buildPlanningScope, buildSportScopes, type PlanningScope } from "./planning-scope-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

const TODAY = "2026-08-12";

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Z2 Dauer",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}
const act = (dateISO: string, sport: "ride" | "run" | "swim"): Ride => ({ dateISO, sport, dataSource: "intervals" }) as Ride;

describe("buildPlanningScope", () => {
  it("liefert Abschnitte, Done-Zeilen, Treue und Lücken für EINE Kartenliste", () => {
    const cards = [card({ id: "a", date: "2026-08-10" }), card({ id: "b", date: "2026-08-14" })];
    const scope = buildPlanningScope({
      sport: null,
      cards,
      rides: [act("2026-08-10", "ride")],
      todayIso: TODAY,
      athleteId: "athlete1",
      ftp: null,
      canEdit: false,
    });
    expect(scope.sport).toBeNull();
    expect(scope.sections.done.map((c) => c.id)).toEqual(["a"]);
    expect(scope.doneRows).toHaveLength(1);
    expect(scope.sections.stats.upcomingCount).toBe(1);
  });
});

describe("buildSportScopes (Modus Alle)", () => {
  const cards = [
    card({ id: "r1", date: "2026-08-10", sport: "ride" }),
    card({ id: "l1", date: "2026-08-10", sport: "run" }),
    card({ id: "l2", date: "2026-08-11", sport: "run" }),
  ];
  const rides = [act("2026-08-10", "run")]; // nur der Lauf vom 10. ist erledigt

  it("rechnet je Sportart mit den Karten UND Aktivitäten genau dieser Sportart", () => {
    const scopes = buildSportScopes({
      sports: ["ride", "run"],
      cards,
      rides,
      todayIso: TODAY,
      athleteId: "athlete3",
      ftp: null,
      canEdit: false,
    });
    const bySport: Record<string, PlanningScope> = Object.fromEntries(scopes.map((s) => [s.sport, s]));
    expect(bySport.run.sections.done.map((c) => c.id)).toEqual(["l1"]);
    expect(bySport.run.sections.missed.map((c) => c.id)).toEqual(["l2"]);
    // das Rad am selben Tag wird NICHT durch den Lauf erledigt
    expect(bySport.ride.sections.done).toHaveLength(0);
    expect(bySport.ride.sections.missed.map((c) => c.id)).toEqual(["r1"]);
  });

  it("lässt Sportarten ohne jede Karte weg (keine leeren Fortschrittsblöcke)", () => {
    const scopes = buildSportScopes({
      sports: ["ride", "run", "swim"],
      cards,
      rides,
      todayIso: TODAY,
      athleteId: "athlete3",
      ftp: null,
      canEdit: false,
    });
    expect(scopes.map((s) => s.sport)).toEqual(["ride", "run"]);
  });
});
