import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FtpForecastChart } from "./FtpForecastChart";

afterEach(cleanup);

function buildRides() {
  return [
    { dateISO: "2026-06-01", eftp: 190 },
    { dateISO: "2026-06-15", eftp: 194 },
    { dateISO: "2026-06-29", eftp: 198 },
    { dateISO: "2026-07-13", eftp: 202 },
  ];
}

describe("FtpForecastChart", () => {
  it("rendert den eFTP-Verlauf als Polyline mit Ziel-Linie", () => {
    const { container } = render(
      <FtpForecastChart rides={buildRides() as never} wellness={[]} ftpGoal={210} ownPlan={false} retestDateISO={null} />,
    );
    const svg = screen.getByRole("img", { name: /FTP-Retest-Prognose/ });
    expect(svg.tagName).toBe("svg");
    expect(container.querySelector("polyline")).not.toBeNull();
    screen.getByText(/Ziel 210/);
  });

  it("zeigt einen Leerzustand bei zu kurzer Historie (< 3 Punkte)", () => {
    render(<FtpForecastChart rides={buildRides().slice(0, 2) as never} wellness={[]} ftpGoal={null} ownPlan={false} retestDateISO={null} />);
    screen.getByText(/eFTP-Historie wird ab dem nächsten Daten-Sync aufgebaut/);
  });

  it("zeichnet den Projektions-Fächer nur bei ownPlan + Retest-Termin", () => {
    const { container: withoutPlan } = render(
      <FtpForecastChart rides={buildRides() as never} wellness={[]} ftpGoal={210} ownPlan={false} retestDateISO="2026-09-19" />,
    );
    expect(withoutPlan.querySelector('path[fill="var(--ss)"]')).toBeNull();

    const { container: withPlan } = render(
      <FtpForecastChart rides={buildRides() as never} wellness={[]} ftpGoal={210} ownPlan={true} retestDateISO="2026-09-19" />,
    );
    expect(withPlan.querySelector('path[fill="var(--ss)"]')).not.toBeNull();
    screen.getByText(/Retest 19\.09/);
  });

  it("zeigt bei Hover auf einen Historienpunkt einen Tooltip mit Datum/eFTP", () => {
    const { container } = render(
      <FtpForecastChart rides={buildRides() as never} wellness={[]} ftpGoal={210} ownPlan={false} retestDateISO={null} />,
    );
    const point = container.querySelector("circle");
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /eFTP \d+ W/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
