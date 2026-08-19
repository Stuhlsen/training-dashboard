import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DoneDetailChart } from "./DoneDetailChart";
import { buildDoneRows, type DoneRideMap } from "./done-table-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;
type ComplianceInterval = import("../../types.js").ComplianceInterval;

// Kein globaler afterEach(cleanup) im Projekt-Setup (s. WeekGrid.test.tsx).
afterEach(cleanup);

function card(overrides: Partial<PlanCard> & { id: string; date: string }): PlanCard {
  return {
    sortOrder: 0,
    name: "Session",
    typ: "Schwelle",
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: "2026-KW32",
    phase: "Rennhärte",
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function interval(overrides: Partial<ComplianceInterval> = {}): ComplianceInterval {
  return {
    kind: "set",
    fulfilled: true,
    plannedDurationS: 300,
    actualDurationS: 300,
    plannedWatts: 250,
    avgWatts: 248,
    ...overrides,
  };
}

function compliance(matchedCardId: string, matched: ComplianceInterval[]): RideCompliance {
  return {
    matchedCardId,
    plannedZoneTime_s: 0,
    actualZoneTime_s: 0,
    intervalsPlanned: matched.length,
    intervalsCompleted: matched.filter((m) => m.fulfilled).length,
    fadePct: -3,
    rating: "green",
    rule: "alle-intervalle-erfuellt",
    matched,
  };
}

function ride(overrides: Partial<Ride> = {}): Ride {
  return { dateISO: "2026-08-18", ...overrides } as Ride;
}

function rowFor(c: PlanCard, r: Ride | null) {
  const doneRides: DoneRideMap = new Map([[c.id, r]]);
  return buildDoneRows([c], doneRides, false)[0];
}

describe("DoneDetailChart — Zweigwahl", () => {
  it("rendert nichts ohne gematchte Ist-Fahrt (kein Crash)", () => {
    const row = rowFor(card({ id: "a", date: "2026-08-18" }), null);
    const { container } = render(<DoneDetailChart {...row} />);
    expect(container.firstChild).toBeNull();
  });

  it("rendert nichts ohne Compliance UND ohne zoneTimes (kein Crash)", () => {
    const row = rowFor(card({ id: "a", date: "2026-08-18" }), ride());
    const { container } = render(<DoneDetailChart {...row} />);
    expect(container.firstChild).toBeNull();
  });

  it("rendert den Stufenchart bei sichtbarer Compliance-Ampel (Intervall-Workout)", () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const row = rowFor(c, ride({ compliance: compliance("a", [interval(), interval({ fulfilled: false })]) }));
    render(<DoneDetailChart {...row} />);
    screen.getByText("Leistung — Soll vs. Ist");
    screen.getByText(/Fade: −3,0%/);
  });

  it("ignoriert eine Compliance-Ampel, die auf eine andere Karte gematcht ist, und fällt auf den Zonen-Mix zurück", () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const row = rowFor(
      c,
      ride({ compliance: compliance("other", [interval()]), zoneTimes: [600, 600, 0, 0, 0] }),
    );
    render(<DoneDetailChart {...row} />);
    expect(screen.queryByText("Leistung — Soll vs. Ist")).toBeNull();
    screen.getByText("Zonen-Mix");
  });

  it("rendert den Zonen-Mix ohne Intervallstruktur, mit echten Zonenzeiten", () => {
    const c = card({ id: "a", date: "2026-08-18", typ: "Z2 Dauer" });
    const row = rowFor(c, ride({ zoneTimes: [1800, 1800, 0, 0, 0] }));
    render(<DoneDetailChart {...row} />);
    screen.getByText("Zonen-Mix");
    screen.getByText(/Z1 Recovery 50%/);
    screen.getByText(/Z2 Endurance 50%/);
  });
});
