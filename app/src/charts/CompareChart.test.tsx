import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CompareChart } from "./CompareChart";
import { buildCompare } from "../core/compare.js";

afterEach(cleanup);

function ride(dateISO: string, ctl: number, tss = 50) {
  return { dateISO, tss, ctl, atl: null, tsb: null, typ: "Z2 Dauer" };
}

function buildResult() {
  const rides = [
    ride("2026-06-01", 40),
    ride("2026-06-02", 41),
    ride("2026-06-03", 42),
    ride("2026-07-01", 50),
    ride("2026-07-02", 52),
    ride("2026-07-03", 53),
  ];
  return buildCompare(
    rides,
    { from: "2026-06-01", to: "2026-06-03" },
    { from: "2026-07-01", to: "2026-07-03" },
  );
}

describe("CompareChart", () => {
  it("rendert ein SVG mit beiden Serien (Slot A durchgezogen, Slot B gestrichelt)", () => {
    const { container } = render(<CompareChart result={buildResult()} />);
    const svg = screen.getByRole("img", { name: /Vergleich/ });
    expect(svg.tagName).toBe("svg");

    const paths = [...container.querySelectorAll("path")];
    const solidA = paths.filter((p) => p.getAttribute("stroke-dasharray") == null);
    const dashedB = paths.filter((p) => p.getAttribute("stroke-dasharray") === "5,4");
    expect(solidA.length).toBeGreaterThan(0);
    expect(dashedB.length).toBeGreaterThan(0);
  });

  it("zeigt eine Legende für Zeitraum A/B", () => {
    render(<CompareChart result={buildResult()} />);
    screen.getByText("Zeitraum A");
    screen.getByText("Zeitraum B");
  });

  it("zeichnet relative Tages-Ticks ('Tag N'), nicht absolute Daten", () => {
    render(<CompareChart result={buildResult()} />);
    screen.getByText("Tag 1");
  });

  it("zeigt einen Hinweis, wenn ein Slot leer ist (kein Vergleich möglich)", () => {
    const rides = [ride("2026-06-01", 40)];
    const result = buildCompare(rides, { from: "2026-06-01", to: "2026-06-03" }, null);
    render(<CompareChart result={result} />);
    screen.getByText(/müssen gemerkt sein/);
  });

  it("zeigt einen Tooltip mit CTL-Werten beider Slots bei Hover auf einen Punkt", () => {
    const { container } = render(<CompareChart result={buildResult()} />);
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element);
    screen.getByRole("tooltip");
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
