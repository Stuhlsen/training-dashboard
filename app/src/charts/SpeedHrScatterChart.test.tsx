import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SpeedHrScatterChart } from "./SpeedHrScatterChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", kmh: 26.4, hf: 138, phase: "Sweet Spot", name: "Fahrt 1" },
    { dateISO: "2026-06-05", kmh: 28.1, hf: 145, phase: "Sweet Spot", name: "Fahrt 2" },
    { dateISO: "2026-06-10", kmh: 24.7, hf: 132, phase: "Schwelle", name: "Fahrt 3" },
  ];
}

describe("SpeedHrScatterChart", () => {
  it("rendert ein SVG mit einem Punkt je Fahrt", () => {
    const { container } = render(<SpeedHrScatterChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Tempo vs\. Herzfrequenz/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("zeigt einen Leerzustand ohne Tempo-/HF-Daten", () => {
    render(<SpeedHrScatterChart rides={[{ dateISO: "2026-06-01" }] as never} />);
    screen.getByText(/Noch keine Tempo-\/HF-Daten erfasst/);
  });

  it("lässt Fahrten ohne Tempo oder ohne HF aus", () => {
    const rides = [...buildRides(), { dateISO: "2026-06-15", kmh: 25, hf: null }, { dateISO: "2026-06-16", kmh: null, hf: 140 }];
    const { container } = render(<SpeedHrScatterChart rides={rides as never} />);
    expect(container.querySelectorAll("circle").length).toBe(3);
  });

  it("zeigt bei Hover auf einen Punkt einen Tooltip mit Tempo und HF", () => {
    const { container } = render(<SpeedHrScatterChart rides={buildRides() as never} />);
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /km\/h.*bpm/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
