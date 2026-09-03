import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DoneTable } from "./DoneTable";
import { buildDoneRows, gapsChips, planFidelitySummary, type DoneRideMap } from "./done-table-view-model";
import type { PlanCard } from "../../api/types";

type Ride = import("../../types.js").Ride;

// Kein globaler afterEach(cleanup) im Projekt-Setup (s. WeekGrid.test.tsx).
afterEach(cleanup);

const TODAY = "2026-08-19";

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

function ride(overrides: Partial<Ride> = {}): Ride {
  return { dateISO: "2026-08-18", ...overrides } as Ride;
}

describe("DoneTable — leerer Zustand", () => {
  it("zeigt einen Platzhaltertext ohne absolvierte Karten", () => {
    render(<DoneTable rows={[]} fidelity={planFidelitySummary([], new Map(), TODAY)} gaps={[]} athleteId="athlete1" ftp={200} />);
    screen.getByText("Noch keine absolvierten Einheiten.");
  });
});

describe("DoneTable — Zeilen + Aufklappen", () => {
  it("klappt beim Klick auf eine Zeile mit gematchter Ist-Fahrt DoneCompareBlock auf", () => {
    const c = card({ id: "a", date: "2026-08-18", typ: "Schwelle", km: 60 });
    const doneRides: DoneRideMap = new Map([["a", ride({ typ: "Z2 Lang", km: 86 })]]);
    const rows = buildDoneRows([c], doneRides, "athlete1", 200);
    render(
      <DoneTable rows={rows} fidelity={planFidelitySummary([c], doneRides, TODAY)} gaps={[]} athleteId="athlete1" ftp={200} />,
    );

    expect(screen.queryByText("Geplant → Tatsächlich")).toBeNull();
    fireEvent.click(screen.getByText("Session"));
    screen.getByText("Geplant → Tatsächlich");

    // erneuter Klick schließt wieder
    fireEvent.click(screen.getByText("Session"));
    expect(screen.queryByText("Geplant → Tatsächlich")).toBeNull();
  });

  it("ruft renderChart nur für die aufgeklappte Zeile auf", () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const doneRides: DoneRideMap = new Map([["a", ride()]]);
    const rows = buildDoneRows([c], doneRides, "athlete1", 200);
    render(
      <DoneTable
        rows={rows}
        fidelity={planFidelitySummary([c], doneRides, TODAY)}
        gaps={[]}
        athleteId="athlete1"
        ftp={200}
        renderChart={(row) => <div data-testid="chart">{row.card.id}</div>}
      />,
    );

    expect(screen.queryByTestId("chart")).toBeNull();
    fireEvent.click(screen.getByText("Session"));
    expect(screen.getByTestId("chart").textContent).toBe("a");
  });

  it("zeigt keine Caret und reagiert nicht auf Klick ohne gematchte Ist-Fahrt", () => {
    const c = card({ id: "a", date: "2026-08-18" });
    const rows = buildDoneRows([c], new Map(), "athlete1", 200);
    render(<DoneTable rows={rows} fidelity={planFidelitySummary([c], new Map(), TODAY)} gaps={[]} athleteId="athlete1" ftp={200} />);

    fireEvent.click(screen.getByText("Session"));
    expect(screen.queryByText("Geplant → Tatsächlich")).toBeNull();
  });
});

describe("DoneTable — Plantreue + Lücken", () => {
  it("zeigt die Plantreue-Quote aus planFidelitySummary()", () => {
    render(
      <DoneTable
        rows={[]}
        fidelity={{ windowDays: 28, ratedCount: 4, fulfilledCount: 3, pct: 75 }}
        gaps={[]}
        athleteId="athlete1"
        ftp={200}
      />,
    );
    screen.getByText(/Plantreue 28 Tage:/);
    screen.getByText("75%");
    screen.getByText("(3/4)");
  });

  it("rendert Lücken-Chips für Verpasst/Ausgefallen-Karten", () => {
    const missed = card({ id: "m", date: "2026-08-10" });
    const cancelled = card({ id: "c", date: "2026-08-12", cancelled: true, cancelReason: "Krank" });
    const gaps = gapsChips([missed], [cancelled]);
    render(
      <DoneTable rows={[]} fidelity={planFidelitySummary([], new Map(), TODAY)} gaps={gaps} athleteId="athlete1" ftp={200} />,
    );
    screen.getByText("Lücken");
    expect(screen.getAllByText("Session")).toHaveLength(2);
  });
});
