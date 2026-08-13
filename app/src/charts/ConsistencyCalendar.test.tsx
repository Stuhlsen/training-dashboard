import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsistencyCalendar } from "./ConsistencyCalendar";

afterEach(cleanup);

const TODAY = "2026-06-15";

function buildRides() {
  // Zwei Trainingstage in KW23 (Montag 01.06.), einer in KW24 (Montag 08.06.)
  // — core/consistency.js::weeklyConsistency() füllt die Lücke bis TODAY.
  return [
    { dateISO: "2026-06-01", km: 40, min: 90 },
    { dateISO: "2026-06-03", km: 30, min: 60 },
    { dateISO: "2026-06-08", km: 50, min: 100 },
  ];
}

describe("ConsistencyCalendar", () => {
  it("rendert eine Zelle je Woche ab der ersten aktiven Woche bis heute", () => {
    const { container } = render(<ConsistencyCalendar rides={buildRides() as never} todayISO={TODAY} />);
    const svg = screen.getByRole("img", { name: /Trainingskonsistenz/ });
    expect(svg.tagName).toBe("svg");
    // KW23 (01.06.) bis KW24 (08.06., enthält TODAY 15.06.) = 3 Wochen
    expect(container.querySelectorAll("rect[fill]").length).toBeGreaterThanOrEqual(3);
  });

  it("zeigt einen Leerzustand ohne Fahrten", () => {
    render(<ConsistencyCalendar rides={[]} todayISO={TODAY} />);
    screen.getByText(/Keine Trainingstage erfasst/);
  });

  it("zeigt bei Hover auf eine trainierte Woche einen Tooltip mit Tagen/km", () => {
    const { container } = render(<ConsistencyCalendar rides={buildRides() as never} todayISO={TODAY} />);
    const cells = container.querySelectorAll("rect[fill]");
    // Erste Woche (KW23, 01.06.) hat 2 Trainingstage — Hover darauf muss zünden.
    fireEvent.mouseEnter(cells[0] as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /Trainingstage · \d+ km/ });
    fireEvent.mouseLeave(cells[0] as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
