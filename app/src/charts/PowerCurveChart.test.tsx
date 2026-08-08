import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PowerCurveChart } from "./PowerCurveChart";

afterEach(cleanup);

function buildPowerCurves() {
  return {
    secs: [1, 5, 60, 300, 1200, 3600],
    watts: [900, 700, 320, 260, 220, 190],
  };
}

describe("PowerCurveChart", () => {
  it("rendert ein SVG mit den Standard-Zeitintervallen als Punkte", () => {
    render(<PowerCurveChart powerCurves={buildPowerCurves()} ftp={193} />);
    const svg = screen.getByRole("img", { name: /Power-Curve/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Hinweistext ohne Power-Curve-Daten", () => {
    render(<PowerCurveChart powerCurves={null} ftp={193} />);
    screen.getByText(/beim nächsten Sync geladen/);
  });

  it("zeigt einen anderen Hinweistext, wenn powerCurves vorhanden aber leer ist", () => {
    render(<PowerCurveChart powerCurves={{ secs: [], watts: [] }} ftp={193} />);
    screen.getByText(/Noch keine Power-Curve-Daten/);
  });

  it("zeichnet die FTP-Referenzlinie, wenn ftp gesetzt ist", () => {
    const { container } = render(<PowerCurveChart powerCurves={buildPowerCurves()} ftp={193} />);
    const ftpLine = container.querySelector('line[stroke="var(--role-status)"]');
    expect(ftpLine).not.toBeNull();
  });

  it("zeigt bei Hover auf einen Punkt einen Tooltip mit Dauer und Watt", () => {
    const { container } = render(<PowerCurveChart powerCurves={buildPowerCurves()} ftp={null} />);
    const point = container.querySelector('circle[fill="var(--role-primary)"]');
    expect(point).not.toBeNull();
    fireEvent.mouseEnter(point as Element, { clientX: 100, clientY: 50 });
    screen.getByRole("tooltip", { name: /1s · 900W/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
