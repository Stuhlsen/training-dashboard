import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DoneDetailChart } from "./DoneDetailChart";
import { buildDoneRows, type DoneRideMap } from "./done-table-view-model";
import { createHarness } from "../../test/harness";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;
type RideCompliance = import("../../types.js").RideCompliance;
type ComplianceInterval = import("../../types.js").ComplianceInterval;

// Streams-Adapter gemockt (echter fetch()-Aufruf gegen intervals.icu) —
// die Mock-Grenze liegt hier genau wie bei den api/supabase/*-Mocks in
// usePlanCards.test.tsx: alles ab api/intervals/* ist gestubbt, die
// Hook-/Komponenten-Logik darüber läuft echt.
vi.mock("../../api/intervals/streams", () => ({
  getActivityStreams: async () => ({
    ok: true,
    time: [0, 1, 2, 3],
    watts: [100, 200, 300, 250],
    heartrate: [120, 130, 140, 135],
  }),
}));

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

describe("DoneDetailChart — Rausch-Chart (Streams)", () => {
  it("rendert den Rausch-Chart zusätzlich zum Stufenchart, wenn activityId + Credentials vorliegen", async () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const row = rowFor(
      c,
      ride({ activityId: "act1", compliance: compliance("a", [interval()]) }),
    );
    const { wrapper } = createHarness();
    render(<DoneDetailChart {...row} intervalsCredentials={{ apiKey: "k", athleteId: "i1" }} />, { wrapper });
    screen.getByText("Leistung — Soll vs. Ist");
    await screen.findByText("Verlauf — Watt/Puls");
    screen.getByText(/Ø 213 W · max 300 W/);
  });

  it("zeigt keinen Rausch-Chart ohne Credentials, auch mit activityId", () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const row = rowFor(c, ride({ activityId: "act1", compliance: compliance("a", [interval()]) }));
    render(<DoneDetailChart {...row} />);
    screen.getByText("Leistung — Soll vs. Ist");
    expect(screen.queryByText("Verlauf — Watt/Puls")).toBeNull();
  });
});
