import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SleepChart } from "./SleepChart";

afterEach(cleanup);

function buildWellness() {
  return [
    { date: "2026-06-01", dateISO: "2026-06-01", sleepHours: 7.5, avgSleepingHR: 52 },
    { date: "2026-06-02", dateISO: "2026-06-02", sleepHours: 6.2, avgSleepingHR: 55 },
    { date: "2026-06-03", dateISO: "2026-06-03", sleepHours: 5.1, avgSleepingHR: 58 },
  ];
}

describe("SleepChart", () => {
  it("rendert ein SVG mit einem Balken je Nacht mit Schlafdaten", () => {
    const { container } = render(<SleepChart wellness={buildWellness() as never} ownPlan={true} />);
    const svg = screen.getByRole("img", { name: /Schlafdauer/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll('rect[fill^="var(--"]').length).toBe(3);
  });

  it("zeigt einen Leerzustand mit ownPlan-abhängigem Text", () => {
    render(<SleepChart wellness={[]} ownPlan={true} />);
    screen.getByText(/Schlafdaten ab intervals.icu-Ära verfügbar/);
    cleanup();
    render(<SleepChart wellness={[]} ownPlan={false} />);
    screen.getByText(/Keine Schlafdaten verfügbar/);
  });

  it("färbt Balken nach Schlafdauer-Ampel (gut/mittel/knapp)", () => {
    const { container } = render(<SleepChart wellness={buildWellness() as never} ownPlan={true} />);
    expect(container.querySelector('rect[fill="var(--z2)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="var(--warn)"]')).not.toBeNull();
    expect(container.querySelector('rect[fill="var(--danger)"]')).not.toBeNull();
  });

  it("zeigt die 7h-Ziellinie nur bei eigenem Plan", () => {
    const { container: withPlan } = render(<SleepChart wellness={buildWellness() as never} ownPlan={true} />);
    screen.getByText(/7h Ziel/);
    expect(withPlan.querySelector('line[stroke="var(--warn)"]')).not.toBeNull();
    cleanup();
    render(<SleepChart wellness={buildWellness() as never} ownPlan={false} />);
    expect(screen.queryByText(/7h Ziel/)).toBeNull();
  });

  it("zeichnet die Schlaf-HF-Linie über die gemessenen Nächte", () => {
    const { container } = render(<SleepChart wellness={buildWellness() as never} ownPlan={true} />);
    expect(container.querySelector('path[stroke="var(--thr)"]')).not.toBeNull();
    expect(container.querySelectorAll('circle[fill="var(--thr)"]').length).toBe(3);
  });

  it("zeigt bei Hover auf einen Balken einen Tooltip mit Schlafdauer und Schlaf-HF", () => {
    const { container } = render(<SleepChart wellness={buildWellness() as never} ownPlan={true} />);
    const bar = container.querySelector('rect[fill="var(--z2)"]');
    expect(bar).not.toBeNull();
    fireEvent.mouseEnter(bar as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /Schlaf.*bpm/ });
    fireEvent.mouseLeave(bar as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zeigt einen Trend-Leerzustand statt eines am linken Rand fixierten Balkens bei nur einer Nacht", () => {
    render(<SleepChart wellness={[{ date: "2026-06-01", dateISO: "2026-06-01", sleepHours: 7.5, avgSleepingHR: 52 }] as never} ownPlan={true} />);
    screen.getByText(/Noch nicht genug Schlafdaten für einen Trend/);
  });

  it("rendert ohne NaN-Koordinaten, wenn alle Nächte 0h Schlaf melden", () => {
    const rows = [
      { date: "2026-06-01", dateISO: "2026-06-01", sleepHours: 0, avgSleepingHR: 50 },
      { date: "2026-06-02", dateISO: "2026-06-02", sleepHours: 0, avgSleepingHR: 51 },
    ];
    const { container } = render(<SleepChart wellness={rows as never} ownPlan={true} />);
    const bars = container.querySelectorAll('rect[fill="var(--danger)"]');
    expect(bars.length).toBe(2);
    bars.forEach((bar) => {
      expect(bar.getAttribute("y")).not.toBe("NaN");
      expect(bar.getAttribute("height")).not.toBe("NaN");
    });
  });
});
