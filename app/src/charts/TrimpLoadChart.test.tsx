import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TrimpLoadChart } from "./TrimpLoadChart";

afterEach(cleanup);

function rideOn(dateISO: string, trimp: number, ctl: number | null = null) {
  return { dateISO, trimp, tss: trimp, min: 90, ctl };
}

describe("TrimpLoadChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung", () => {
    const rides = [rideOn("2026-06-01", 300), rideOn("2026-06-08", 350)];
    render(<TrimpLoadChart rides={rides as never} />);
    const svg = screen.getByRole("img", { name: /Belastungswächter/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand ohne Wochendaten", () => {
    render(<TrimpLoadChart rides={[]} />);
    screen.getByText(/Keine Wochendaten verfügbar/);
  });

  it("zeigt das ⚠-Symbol bei einer Woche mit hoher Foster-Monotonie", () => {
    // Gleiche Last jeden Tag über 7 Tage → Monotonie hoch (SD≈0 → riskLevel high,
    // aber wir brauchen einen ENDLICHEN Monotonie-Wert ⇒ minimale Streuung).
    const rides = [
      rideOn("2026-06-01", 100),
      rideOn("2026-06-02", 101),
      rideOn("2026-06-03", 100),
      rideOn("2026-06-04", 101),
      rideOn("2026-06-05", 100),
      rideOn("2026-06-06", 101),
      rideOn("2026-06-07", 100),
    ];
    const { container } = render(<TrimpLoadChart rides={rides as never} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("⚠");
  });

  it("zeigt kein ⚠-Symbol bei normal verteilter Belastung", () => {
    const rides = [
      rideOn("2026-06-01", 200),
      rideOn("2026-06-03", 0),
      rideOn("2026-06-05", 150),
      rideOn("2026-06-07", 0),
    ];
    const { container } = render(<TrimpLoadChart rides={rides as never} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).not.toContain("⚠");
  });
});
