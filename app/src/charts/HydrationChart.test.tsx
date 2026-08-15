import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HydrationChart } from "./HydrationChart";

afterEach(cleanup);

function buildWellness() {
  return [
    { dateISO: "2026-06-01", hydrationVolume: 1.5 },
    { dateISO: "2026-06-02", hydrationVolume: 1.8 },
    { dateISO: "2026-06-03", hydrationVolume: 1.6 },
    { dateISO: "2026-06-04", hydrationVolume: 2.0 },
    { dateISO: "2026-06-05", hydrationVolume: 1.7 },
  ];
}

describe("HydrationChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung", () => {
    render(<HydrationChart wellness={buildWellness() as never} />);
    const svg = screen.getByRole("img", { name: /Hydration-Verlauf/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand unter der Mindestpunktzahl", () => {
    render(<HydrationChart wellness={[{ dateISO: "2026-06-01", hydrationVolume: 1.5 }] as never} />);
    screen.getByText(/Noch nicht genug Hydration-Daten/);
  });

  it("zeigt bei Hover Datum und Liter-Einheit", () => {
    const { container } = render(<HydrationChart wellness={buildWellness() as never} />);
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /L/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("fällt auf den Score ohne hydrationVolume zurück (keine Einheit)", () => {
    const wellness = [
      { dateISO: "2026-06-01", hydration: 70 },
      { dateISO: "2026-06-02", hydration: 72 },
      { dateISO: "2026-06-03", hydration: 68 },
      { dateISO: "2026-06-04", hydration: 75 },
      { dateISO: "2026-06-05", hydration: 71 },
    ];
    render(<HydrationChart wellness={wellness as never} />);
    const svg = screen.getByRole("img", { name: /Hydration-Verlauf/ });
    expect(svg.tagName).toBe("svg");
  });
});
