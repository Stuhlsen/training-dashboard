import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CadenceChart } from "./CadenceChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", typ: "Z2 Dauer", kad: 78, name: "Fahrt 1" },
    { dateISO: "2026-06-05", typ: "Sweet Spot", kad: 85, name: "Fahrt 2" },
    { dateISO: "2026-06-10", typ: "Z2 Dauer", kad: 88, name: "Fahrt 3" },
    { dateISO: "2026-06-15", typ: "Sweet Spot", kad: 91, name: "Fahrt 4" },
    { dateISO: "2026-06-20", typ: "Z2 Dauer", kad: 93, name: "Fahrt 5" },
  ];
}

describe("CadenceChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung", () => {
    render(<CadenceChart rides={buildRides() as never} ownPlan={true} />);
    const svg = screen.getByRole("img", { name: /Kadenz/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand ohne Kadenz-Daten", () => {
    render(<CadenceChart rides={[{ dateISO: "2026-06-01" }] as never} ownPlan={true} />);
    screen.getByText(/Noch keine Kadenz-Daten erfasst/);
  });

  it("zeigt die Coach-Chipreihe ab 3 Fahrten mit Kadenz", () => {
    render(<CadenceChart rides={buildRides() as never} ownPlan={true} />);
    screen.getByText("Ø zuletzt");
    screen.getByText("Ziel ≥90");
    screen.getByText("Nach Typ");
  });

  it("zeichnet die Ziellinie nur bei eigenem Plan", () => {
    const { container, rerender } = render(<CadenceChart rides={buildRides() as never} ownPlan={true} />);
    expect(container.querySelector('line[stroke="var(--role-status)"][stroke-dasharray="4,3"]')).not.toBeNull();

    rerender(<CadenceChart rides={buildRides() as never} ownPlan={false} />);
    expect(container.querySelector('line[stroke="var(--role-status)"][stroke-dasharray="4,3"]')).toBeNull();
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit RPM-Wert", () => {
    const { container } = render(<CadenceChart rides={buildRides() as never} ownPlan={true} />);
    const dot = container.querySelector('circle[fill="var(--role-status)"]');
    expect(dot).not.toBeNull();
    // Die sichtbare Punktgröße ist unverändert klein (19.08.2026, Bugfix) —
    // die größere, unsichtbare Trefferfläche liegt als vorheriges Geschwister
    // im DOM (s. CadenceChart.tsx-Kommentar) und trägt die Hover-Handler.
    const point = dot!.previousElementSibling as Element;
    fireEvent.mouseEnter(point, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /RPM/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
