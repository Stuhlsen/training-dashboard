import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DecouplingChart } from "./DecouplingChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", typ: "Z2 Dauer", min: 90, decoupling: 3, name: "Fahrt 1" },
    { dateISO: "2026-06-05", typ: "Z2 Lang", min: 150, decoupling: 4.5, name: "Fahrt 2" },
    { dateISO: "2026-06-10", typ: "Z2 Dauer", min: 90, decoupling: 6, name: "Fahrt 3" },
    { dateISO: "2026-06-15", typ: "Z2 Dauer", min: 90, decoupling: 11, name: "Fahrt 4" },
    { dateISO: "2026-06-20", typ: "Z2 Lang", min: 150, decoupling: 4, name: "Fahrt 5" },
  ];
}

describe("DecouplingChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung ab 5 geeigneten Fahrten", () => {
    render(<DecouplingChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Aerobe Entkopplung/ });
    expect(svg.tagName).toBe("svg");
    screen.getByText(/Median/);
  });

  it("zeigt einen Leerzustand unter der Mindestpunktzahl (< 5)", () => {
    render(<DecouplingChart rides={buildRides().slice(0, 3) as never} />);
    screen.getByText(/Datenbasis wächst noch/);
  });

  it("zeichnet die 5%-Ziellinie und färbt Punkte nach Schwellwert", () => {
    const { container } = render(<DecouplingChart rides={buildRides() as never} />);
    expect(container.querySelector('line[stroke="var(--z1)"][stroke-dasharray="4,3"]')).not.toBeNull();
    expect(container.querySelector('circle[fill="var(--z1)"]')).not.toBeNull();
    expect(container.querySelector('circle[fill="var(--thr)"]')).not.toBeNull();
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit Prozentwert", () => {
    const { container } = render(<DecouplingChart rides={buildRides() as never} />);
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /%/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
