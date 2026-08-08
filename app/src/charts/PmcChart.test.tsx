import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PmcChart } from "./PmcChart";

afterEach(cleanup);

function buildRides() {
  // 06-01..06-08 sind "echte" Fahrten (Ist), asOf liegt bei 06-08 —
  // die Lücke bis "heute" (06-10) wird von densifyPmc über projectPmc()
  // fortgeschrieben, nicht auf 0 gesetzt (Regressionsschutz, s.
  // core/pmc-series.test.js).
  const dates = ["01", "02", "03", "04", "05", "06", "07", "08"];
  return dates.map((d, i) => ({
    dateISO: `2026-06-${d}`,
    ctl: 38 + i,
    atl: 28 + (i % 3),
  }));
}

function buildProjection() {
  return {
    days: [
      { date: "2026-06-10", ctl: 46, atl: 27, tsb: 19, tss: 0, uncertain: false, cardIds: [] },
      { date: "2026-06-11", ctl: 47, atl: 26, tsb: 21, tss: 40, uncertain: false, cardIds: ["c1"] },
      { date: "2026-06-12", ctl: 48, atl: 30, tsb: 18, tss: 80, uncertain: true, cardIds: ["c2"] },
      { date: "2026-06-13", ctl: 49, atl: 32, tsb: 17, tss: 70, uncertain: true, cardIds: ["c3"] },
    ],
    startCtl: 45,
    startAtl: 29,
    hasBaseline: true,
    asOf: "2026-06-08",
    horizonEnd: "2026-06-13",
  };
}

describe("PmcChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung, wenn Fahrten + Projektion vorliegen", () => {
    render(<PmcChart rides={buildRides() as never} projection={buildProjection() as never} />);
    const svg = screen.getByRole("img", { name: /Belastungsverlauf/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeichnet die Naht: mindestens ein durchgezogenes (Historie) und ein gestricheltes (Prognose) Pfad-Segment", () => {
    const { container } = render(<PmcChart rides={buildRides() as never} projection={buildProjection() as never} />);
    const paths = [...container.querySelectorAll("path")];
    expect(paths.length).toBeGreaterThan(0);
    const dashed = paths.filter((p) => p.getAttribute("stroke-dasharray") === "5,4");
    const solid = paths.filter((p) => !p.getAttribute("stroke-dasharray"));
    expect(dashed.length).toBeGreaterThan(0);
    expect(solid.length).toBeGreaterThan(0);
  });

  it("zeichnet ein Unsicherheitsband, wenn die Projektion uncertain-Tage enthält", () => {
    const { container } = render(<PmcChart rides={buildRides() as never} projection={buildProjection() as never} />);
    const band = container.querySelector('rect[fill="var(--role-status)"]');
    expect(band).not.toBeNull();
  });

  it("zeigt einen Leerzustand ohne Fahrten und ohne Projektionstage", () => {
    const emptyProjection = { days: [], startCtl: 0, startAtl: 0, hasBaseline: false, asOf: null, horizonEnd: null };
    render(<PmcChart rides={[]} projection={emptyProjection as never} />);
    screen.getByText(/Noch nicht genug Daten/);
  });
});
