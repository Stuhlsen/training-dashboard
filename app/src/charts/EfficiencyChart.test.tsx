import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EfficiencyChart } from "./EfficiencyChart";

afterEach(cleanup);

function buildComparableRides() {
  // 4 vergleichbare Fahrten statt 3 — core/efficiency.js::rollingMean()
  // (Fenster 5) liefert erst ab dem 3. Punkt einen Wert, mit genau 3
  // Eingaben also nur EINEN nicht-null Punkt (kein zeichenbarer Pfad,
  // der braucht mindestens 2).
  return [
    { dateISO: "2026-06-01", typ: "Z2 Dauer", min: 90, efficiency: 1.5, watt: 150, hf: 100, name: "Fahrt 1" },
    { dateISO: "2026-06-05", typ: "Z2 Lang", min: 150, efficiency: 1.55, watt: 155, hf: 100, name: "Fahrt 2" },
    { dateISO: "2026-06-10", typ: "Z2 Dauer", min: 90, efficiency: 1.6, watt: 160, hf: 100, name: "Fahrt 3" },
    { dateISO: "2026-06-14", typ: "Z2 Dauer", min: 90, efficiency: 1.62, watt: 162, hf: 100, name: "Fahrt 4" },
  ];
}

describe("EfficiencyChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung", () => {
    render(<EfficiencyChart rides={buildComparableRides() as never} />);
    const svg = screen.getByRole("img", { name: /Aerobe Effizienz/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand ohne ausreichend Powermeter-Fahrten", () => {
    render(<EfficiencyChart rides={[{ dateISO: "2026-06-01", efficiency: 1.5 }] as never} />);
    screen.getByText(/Noch nicht genug Powermeter-Fahrten/);
  });

  it("zeichnet die Rolling-Mean-Linie ab 3 vergleichbaren Z2-Fahrten", () => {
    const { container } = render(<EfficiencyChart rides={buildComparableRides() as never} />);
    expect(container.querySelector('path[stroke="var(--z1)"]')).not.toBeNull();
    screen.getByText(/EF-Trend: 4 vergleichbare Z2-Fahrten/);
  });

  it("zeigt Kontextfahrten (nicht vergleichbar) abgedunkelt und unbeschriftet als Trend", () => {
    const rides = [
      { dateISO: "2026-06-01", typ: "VO2max", min: 20, efficiency: 1.7, watt: 200, hf: 118, name: "Intervalle 1" },
      { dateISO: "2026-06-03", typ: "VO2max", min: 20, efficiency: 1.72, watt: 202, hf: 118, name: "Intervalle 2" },
    ];
    const { container } = render(<EfficiencyChart rides={rides as never} />);
    screen.getByText(/Nur Powermeter-Fahrten/);
    expect(container.querySelector('path[stroke="var(--z1)"]')).toBeNull();
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit Effizienzwert", () => {
    const { container } = render(<EfficiencyChart rides={buildComparableRides() as never} />);
    const point = container.querySelector('circle[fill="var(--z2)"]');
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /W\/bpm/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
