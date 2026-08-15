import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TempoTrendChart } from "./TempoTrendChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", kmh: 24.1, name: "Z2 Lang" },
    { dateISO: "2026-06-08", kmh: 25.0, name: "Gruppenfahrt" },
    { dateISO: "2026-06-15", kmh: 24.8, name: "Z2 Lang" },
    { dateISO: "2026-06-22", kmh: 26.2, name: "Sweet Spot" },
    { dateISO: "2026-06-29", kmh: 25.9, name: "Z2 Lang" },
  ];
}

describe("TempoTrendChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung", () => {
    render(<TempoTrendChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Tempo je Fahrt/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand ohne ausreichend Daten", () => {
    render(<TempoTrendChart rides={[{ dateISO: "2026-06-01", kmh: 24 }] as never} />);
    screen.getByText(/Noch nicht genug Tempo-Daten/);
  });

  it("blendet Fahrten ohne kmh-Feld aus", () => {
    const rides = [...buildRides(), { dateISO: "2026-07-01", kmh: null, name: "Ohne GPS" }];
    const { container } = render(<TempoTrendChart rides={rides as never} />);
    expect(container.querySelectorAll("circle").length).toBe(5);
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit Datum und km/h", () => {
    const { container } = render(<TempoTrendChart rides={buildRides() as never} />);
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /km\/h/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
