import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComplianceTable } from "./ComplianceTable";

type Ride = import("../../types.js").Ride;

afterEach(cleanup);

function ride(overrides: Partial<Ride["compliance"]>): Ride {
  return {
    dateISO: "2026-07-20",
    compliance: {
      matchedCardId: "card-1",
      plannedZoneTime_s: 960,
      actualZoneTime_s: 900,
      intervalsPlanned: 1,
      intervalsCompleted: 1,
      fadePct: -3.2,
      rating: "green",
      rule: "alle-intervalle-erfuellt",
      matched: [
        { kind: "set", fulfilled: true, plannedDurationS: 480, actualDurationS: 470, plannedWatts: 180, avgWatts: 182 },
      ],
      ...overrides,
    },
  } as Ride;
}

describe("ComplianceTable", () => {
  it("rendert Intervallzeilen, Fade und Ampel-Klartext bei passendem Match", () => {
    render(<ComplianceTable ride={ride({})} cardId="card-1" workoutStructure={null} />);
    screen.getByText("8:00 → 7:50");
    screen.getByText("180 W → 182 W");
    expect(screen.getAllByText("✓")).toHaveLength(2); // Kopfzeile + erfüllte Intervallzeile
    screen.getByText(/alle Intervalle erfüllt/);
    screen.getByText(/Fade: −3,2%/);
  });

  it("zeigt das 'abgeleitet'-Badge nur wenn derived gesetzt ist", () => {
    render(<ComplianceTable ride={ride({ derived: true })} cardId="card-1" workoutStructure={null} />);
    screen.getByText("abgeleitet");
  });

  it("zeigt den Zusatz-Block für accessory-Schritte, außerhalb der Ampel", () => {
    render(
      <ComplianceTable
        ride={ride({})}
        cardId="card-1"
        workoutStructure={{ steps: [{ kind: "accessory", reps: 6, work: { duration_s: 20, target: "Sprint" } }] }}
      />,
    );
    screen.getByText(/Zusatz/);
    screen.getByText(/6 × 20s Sprint/);
  });

  it("rendert nichts ohne Match gegen genau diese Karte", () => {
    const { container } = render(<ComplianceTable ride={ride({})} cardId="anderes-datum" workoutStructure={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("rendert nichts ohne ride", () => {
    const { container } = render(<ComplianceTable ride={null} cardId="card-1" workoutStructure={null} />);
    expect(container.firstChild).toBeNull();
  });
});
