import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WeeklyVolumeChart } from "./WeeklyVolumeChart";

afterEach(cleanup);

function buildRides({ withPhase = false } = {}) {
  // Zwei ISO-Kalenderwochen mit je zwei Fahrten (2026-KW23/24 grenzt an
  // 01.06./08.06.2026, Montag-basiert wie core/aggregate.js::isoWeekKey).
  return [
    { dateISO: "2026-06-01", km: 40, min: 90, phase: withPhase ? "Sweet Spot" : null },
    { dateISO: "2026-06-03", km: 30, min: 60, phase: withPhase ? "Sweet Spot" : null },
    { dateISO: "2026-06-08", km: 50, min: 100, phase: withPhase ? "Schwelle" : null },
  ];
}

describe("WeeklyVolumeChart", () => {
  it("rendert ein SVG mit einem Balken je Kalenderwoche", () => {
    const { container } = render(<WeeklyVolumeChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Wochenvolumen/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll("rect[fill]").length).toBeGreaterThanOrEqual(2);
  });

  it("zeigt einen Leerzustand ohne Fahrten", () => {
    render(<WeeklyVolumeChart rides={[]} />);
    screen.getByText(/Keine Wochendaten verfügbar/);
  });

  it("zeichnet Zielzone + Ziel-Linie nur bei eigenem Plan (mind. eine Woche mit phase)", () => {
    const { container: withoutPlan } = render(<WeeklyVolumeChart rides={buildRides() as never} />);
    expect(withoutPlan.querySelector('line[stroke="var(--role-positive)"]')).toBeNull();

    const { container: withPlan } = render(<WeeklyVolumeChart rides={buildRides({ withPhase: true }) as never} />);
    expect(withPlan.querySelector('line[stroke="var(--role-positive)"]')).not.toBeNull();
  });

  it("zeigt bei Hover auf einen Balken einen Tooltip mit Woche/km/Fahrten", () => {
    const { container } = render(<WeeklyVolumeChart rides={buildRides() as never} />);
    const bar = container.querySelector("rect[opacity]");
    expect(bar).not.toBeNull();
    fireEvent.mouseEnter(bar as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /km · \d+ Fahrten/ });
    fireEvent.mouseLeave(bar as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
