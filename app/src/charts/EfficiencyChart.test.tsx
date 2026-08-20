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
    const dot = container.querySelector('circle[fill="var(--z2)"]');
    expect(dot).not.toBeNull();
    // Die sichtbare Punktgröße ist unverändert klein (19.08.2026, Bugfix) —
    // die größere, unsichtbare Trefferfläche liegt als vorheriges Geschwister
    // im DOM (s. EfficiencyChart.tsx-Kommentar) und trägt die Hover-Handler.
    const point = dot!.previousElementSibling as Element;
    fireEvent.mouseEnter(point, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /W\/bpm/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("unterbricht die Rohlinie sichtbar bei einer Fahrt ohne EF, statt darüber zu verbinden", () => {
    const rides = [
      { dateISO: "2026-06-01", efficiency: 1.5, watt: 150, hf: 100, name: "R1" },
      { dateISO: "2026-06-03", efficiency: 1.52, watt: 151, hf: 100, name: "R2" },
      { dateISO: "2026-06-05", efficiency: null, watt: 200, hf: 120, name: "R3 ohne EF" },
      { dateISO: "2026-06-07", efficiency: 1.58, watt: 158, hf: 100, name: "R4" },
      { dateISO: "2026-06-09", efficiency: 1.6, watt: 160, hf: 100, name: "R5" },
    ];
    const { container } = render(<EfficiencyChart rides={rides as never} />);
    // Zwei getrennte Segmente (R1-R2, R4-R5) statt eines durchgehenden Pfads.
    const segments = container.querySelectorAll('path[stroke="var(--role-primary)"]');
    expect(segments.length).toBe(2);
  });

  function buildClickableRides() {
    // np gesetzt (nicht nur watt) — EfficiencyDetailScatter berechnet
    // Watt/kg bewusst ausschließlich aus np, kein Ø-Watt-Fallback.
    return [
      { dateISO: "2026-06-01", efficiency: 1.5, watt: 150, np: 152, hf: 100, kmh: 28, hmProKm: 4, name: "Fahrt 1" },
      { dateISO: "2026-06-05", efficiency: 1.55, watt: 155, np: 157, hf: 100, kmh: 27, hmProKm: 12, name: "Fahrt 2" },
      { dateISO: "2026-06-10", efficiency: 1.6, watt: 160, np: 162, hf: 100, kmh: 26, hmProKm: 20, name: "Fahrt 3" },
    ];
  }
  const wellnessForClickTests = [
    { dateISO: "2026-06-01", weight: 75 },
    { dateISO: "2026-06-05", weight: 75 },
    { dateISO: "2026-06-10", weight: 75 },
  ];

  it("Ruhezustand: ohne Klick keine Scatter-Detailansicht im DOM", () => {
    render(<EfficiencyChart rides={buildClickableRides() as never} wellness={wellnessForClickTests as never} />);
    expect(screen.queryByRole("img", { name: /Watt pro Kilogramm/ })).toBeNull();
  });

  it("Klick auf einen Punkt öffnet die Scatter-Detailansicht mit hervorgehobener Fahrt, erneuter Klick schließt sie", () => {
    const { container } = render(
      <EfficiencyChart rides={buildClickableRides() as never} wellness={wellnessForClickTests as never} />,
    );
    const dot = container.querySelector('circle[fill="var(--z2)"]');
    const point = dot!.previousElementSibling as Element;

    fireEvent.click(point);
    screen.getByRole("img", { name: /Watt pro Kilogramm/ });
    // Ausgewählte Fahrt hervorgehoben: ss-Randfarbe im Scatter-SVG.
    expect(container.querySelector('circle[stroke="var(--ss)"]')).not.toBeNull();

    fireEvent.click(point);
    expect(screen.queryByRole("img", { name: /Watt pro Kilogramm/ })).toBeNull();
  });

  it("Schließen-Button in der Scatter-Detailansicht schließt sie ebenfalls", () => {
    const { container } = render(
      <EfficiencyChart rides={buildClickableRides() as never} wellness={wellnessForClickTests as never} />,
    );
    const dot = container.querySelector('circle[fill="var(--z2)"]');
    fireEvent.click(dot!.previousElementSibling as Element);
    screen.getByRole("img", { name: /Watt pro Kilogramm/ });

    fireEvent.click(screen.getByRole("button", { name: /Detailansicht schließen/ }));
    expect(screen.queryByRole("img", { name: /Watt pro Kilogramm/ })).toBeNull();
  });
});
