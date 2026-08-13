import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HrTrendChart } from "./HrTrendChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", hf: 132, name: "Fahrt 1" },
    { dateISO: "2026-06-05", hf: 135, name: "Fahrt 2" },
    { dateISO: "2026-06-10", hf: 138, name: "Fahrt 3" },
    { dateISO: "2026-06-15", hf: 141, name: "Fahrt 4" },
    { dateISO: "2026-06-20", hf: 137, name: "Fahrt 5" },
  ];
}

describe("HrTrendChart", () => {
  it("rendert ein SVG mit einem Punkt je Fahrt und einer Trendlinie", () => {
    const { container } = render(<HrTrendChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Ø-Herzfrequenz/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll('circle[fill="var(--thr)"]').length).toBe(5);
    expect(container.querySelector('path[stroke="var(--z1)"]')).not.toBeNull();
  });

  it("zeigt einen Leerzustand ohne Herzfrequenz-Daten", () => {
    render(<HrTrendChart rides={[{ dateISO: "2026-06-01" }] as never} />);
    screen.getByText(/Noch keine Herzfrequenz-Daten erfasst/);
  });

  it("zeichnet auch mit nur einer Fahrt (kein Trendlinien-Absturz)", () => {
    const { container } = render(<HrTrendChart rides={[{ dateISO: "2026-06-01", hf: 135 }] as never} />);
    expect(container.querySelectorAll('circle[fill="var(--thr)"]').length).toBe(1);
    expect(container.querySelector('path[stroke="var(--z1)"]')).toBeNull();
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit bpm-Wert", () => {
    const { container } = render(<HrTrendChart rides={buildRides() as never} />);
    const point = container.querySelector('circle[fill="var(--thr)"]');
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /bpm/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
