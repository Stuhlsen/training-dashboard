import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ZoneWeeklyChart } from "./ZoneWeeklyChart";

afterEach(cleanup);

function buildRides() {
  // 2026-KW23/24 wie WeeklyVolumeChart.test.tsx (Montag-basiert, s.
  // core/aggregate.js::isoWeekKey). KW23: 88.9% low (im Soll), KW24: 50% low
  // (nicht im Soll) — Werte wie tests/loadguard-readiness-zones.test.js.
  return [
    { dateISO: "2026-06-01", zoneTimes: [3600, 3600, 900, 0, 0] },
    { dateISO: "2026-06-08", zoneTimes: [1800, 1800, 1800, 1800, 0] },
  ];
}

describe("ZoneWeeklyChart", () => {
  it("rendert ein SVG mit gestapelten Balken je Kalenderwoche", () => {
    const { container } = render(<ZoneWeeklyChart rides={buildRides() as never} />);
    const svg = screen.getByRole("img", { name: /Zeit in Zonen/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll("rect[fill^='var(--z2']").length).toBeGreaterThanOrEqual(2);
  });

  it("zeigt einen Leerzustand ohne Zonendaten", () => {
    render(<ZoneWeeklyChart rides={[{ dateISO: "2026-06-01" }] as never} />);
    screen.getByText(/Zonendaten werden ab dem nächsten Sync aufgebaut/);
  });

  it("färbt den Low-Share-Wert je nach 80%-Zielstatus unterschiedlich", () => {
    const { container } = render(<ZoneWeeklyChart rides={buildRides() as never} />);
    expect(container.querySelector('text[fill="var(--ok)"]')).not.toBeNull();
    expect(container.querySelector('text[fill="var(--warn)"]')).not.toBeNull();
  });

  it("zeigt bei Hover auf eine Woche einen Tooltip mit Wochen-/Zonendaten", () => {
    const { container } = render(<ZoneWeeklyChart rides={buildRides() as never} />);
    const hitArea = container.querySelector('rect[fill="transparent"]');
    expect(hitArea).not.toBeNull();
    fireEvent.mouseEnter(hitArea as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /Grundlage/ });
    fireEvent.mouseLeave(hitArea as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
