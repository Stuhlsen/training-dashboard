import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EnergyWeightChart } from "./EnergyWeightChart";

afterEach(cleanup);

function day(dateISO: string, extra: Record<string, number> = {}): Record<string, unknown> {
  return { date: dateISO, dateISO, ...extra };
}

function buildEnergyAndWeight(): Record<string, unknown>[] {
  return [
    day("2026-06-01", { restingEnergy: 1700, activeEnergy: 400, kcalConsumed: 2100, weight: 82.4 }),
    day("2026-06-02", { restingEnergy: 1690, activeEnergy: 550, kcalConsumed: 2300, weight: 82.1 }),
    day("2026-06-03", { restingEnergy: 1710, activeEnergy: 200, kcalConsumed: 1900, weight: 82.0 }),
    day("2026-06-04", { restingEnergy: 1705, activeEnergy: 600, kcalConsumed: 2400, weight: 81.8 }),
    day("2026-06-05", { restingEnergy: 1695, activeEnergy: 300, kcalConsumed: 2000, weight: 81.6 }),
  ];
}

describe("EnergyWeightChart", () => {
  it("rendert Verbrauchs- und Zufuhr-Balken plus Gewichtslinie", () => {
    const { container } = render(<EnergyWeightChart wellness={buildEnergyAndWeight() as never} />);
    const svg = screen.getByRole("img", { name: /Energieverbrauch/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelectorAll('rect[fill="var(--ss)"]').length).toBe(5);
    expect(container.querySelectorAll('rect[fill="var(--z2)"]').length).toBe(5);
    expect(container.querySelector('path[stroke="var(--role-status)"]')).not.toBeNull();
    expect(container.querySelectorAll('circle[fill="var(--role-status)"]').length).toBe(5);
  });

  it("zeigt einen Leerzustand ohne Energie- und Gewichtsdaten", () => {
    render(<EnergyWeightChart wellness={[]} />);
    screen.getByText(/Noch keine Energie- oder Gewichtsdaten verfügbar/);
  });

  it("blendet unter MIN_POINTS (5) sowohl Energie- als auch Gewichtsserie aus", () => {
    render(<EnergyWeightChart wellness={buildEnergyAndWeight().slice(0, 3) as never} />);
    screen.getByText(/Noch keine Energie- oder Gewichtsdaten verfügbar/);
  });

  it("rendert nur die Gewichtslinie ohne Balken, wenn ausschließlich Gewicht getrackt ist", () => {
    const rows = buildEnergyAndWeight().map((d) => ({ date: d.date, dateISO: d.dateISO, weight: d.weight }));
    const { container } = render(<EnergyWeightChart wellness={rows as never} />);
    expect(container.querySelectorAll('rect[fill="var(--ss)"]').length).toBe(0);
    expect(container.querySelectorAll('rect[fill="var(--z2)"]').length).toBe(0);
    expect(container.querySelector('path[stroke="var(--role-status)"]')).not.toBeNull();
  });

  it("deckt das Tagesgerüst über die Union aus Energie- und Gewichtsbereich ab", () => {
    const rows = [
      ...buildEnergyAndWeight().map((d) => ({ date: d.date, dateISO: d.dateISO, restingEnergy: d.restingEnergy, activeEnergy: d.activeEnergy })),
      day("2026-05-25", { weight: 83.0 }),
      day("2026-05-26", { weight: 82.9 }),
      day("2026-05-27", { weight: 82.8 }),
      day("2026-05-28", { weight: 82.7 }),
      day("2026-05-29", { weight: 82.6 }),
    ];
    render(<EnergyWeightChart wellness={rows as never} />);
    screen.getByText("25.05");
  });

  it("zeichnet keinen Verbrauchs-Balken an Tagen ohne Grundumsatz/aktiv-Daten (nur Zufuhr getrackt, kein BMR)", () => {
    const rows = [
      day("2026-06-01", { kcalConsumed: 2100 }),
      day("2026-06-02", { kcalConsumed: 2300 }),
      day("2026-06-03", { kcalConsumed: 1900 }),
      day("2026-06-04", { kcalConsumed: 2400 }),
      day("2026-06-05", { kcalConsumed: 2000 }),
    ];
    const { container } = render(<EnergyWeightChart wellness={rows as never} />);
    expect(container.querySelectorAll('rect[fill="var(--ss)"]').length).toBe(0);
    expect(container.querySelectorAll('rect[fill="var(--z2)"]').length).toBe(5);
  });

  it("zeigt bei Hover auf einen Verbrauchs-Balken einen Tooltip mit kcal-Aufschlüsselung", () => {
    const { container } = render(<EnergyWeightChart wellness={buildEnergyAndWeight() as never} />);
    const bar = container.querySelector('rect[fill="var(--ss)"]');
    expect(bar).not.toBeNull();
    fireEvent.mouseEnter(bar as Element, { clientX: 40, clientY: 40 });
    screen.getByRole("tooltip", { name: /Verbrauch.*Grundumsatz.*aktiv/ });
    fireEvent.mouseLeave(bar as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("zeigt bei Hover auf einen Gewichtspunkt einen Tooltip mit kg-Wert", () => {
    const { container } = render(<EnergyWeightChart wellness={buildEnergyAndWeight() as never} />);
    const dot = container.querySelector('circle[fill="var(--role-status)"]');
    expect(dot).not.toBeNull();
    fireEvent.mouseEnter(dot as Element, { clientX: 40, clientY: 40 });
    screen.getByRole("tooltip", { name: /kg/ });
    fireEvent.mouseLeave(dot as Element);
  });
});
