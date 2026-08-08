import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BrushBar } from "./BrushBar";

afterEach(cleanup);

function buildRides() {
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
    ],
    startCtl: 45,
    startAtl: 29,
    hasBaseline: true,
    asOf: "2026-06-08",
    horizonEnd: "2026-06-11",
  };
}

describe("BrushBar", () => {
  it("rendert eine Übersichtsleiste mit Preset-Knöpfen", () => {
    render(
      <BrushBar
        rides={buildRides() as never}
        projection={buildProjection() as never}
        range={{ fromISO: "2026-06-01", toISO: "2026-06-11" }}
        onRangeChange={() => {}}
      />,
    );
    screen.getByRole("img", { name: /Zeitraum wählen/ });
    expect(screen.getByText("30 Tage")).toBeTruthy();
    expect(screen.getByText("Alles")).toBeTruthy();
  });

  it("blendet den 'Plan 2'-Preset ohne plan2StartISO aus", () => {
    render(
      <BrushBar
        rides={buildRides() as never}
        projection={buildProjection() as never}
        range={{ fromISO: "2026-06-01", toISO: "2026-06-11" }}
        onRangeChange={() => {}}
      />,
    );
    expect(screen.queryByText("Plan 2")).toBeNull();
  });

  it("zeigt den 'Plan 2'-Preset, wenn plan2StartISO gesetzt ist", () => {
    render(
      <BrushBar
        rides={buildRides() as never}
        projection={buildProjection() as never}
        range={{ fromISO: "2026-06-01", toISO: "2026-06-11" }}
        onRangeChange={() => {}}
        plan2StartISO="2026-06-05"
      />,
    );
    expect(screen.getByText("Plan 2")).toBeTruthy();
  });

  it("'Alles' setzt das Fenster auf Anker bis Horizont", () => {
    const onRangeChange = vi.fn();
    render(
      <BrushBar
        rides={buildRides() as never}
        projection={buildProjection() as never}
        range={{ fromISO: "2026-06-05", toISO: "2026-06-08" }}
        onRangeChange={onRangeChange}
      />,
    );
    fireEvent.click(screen.getByText("Alles"));
    expect(onRangeChange).toHaveBeenCalledWith({ fromISO: "2026-06-01", toISO: "2026-06-11" });
  });

  it("markiert das aktive Preset via aria-pressed", () => {
    // Anker weit vor "heute", damit sich "Alles" von den Tage-Presets
    // unterscheidet (mit dem knappen buildRides()-Zeitraum fallen 30/90/365
    // Tage und "Alles" sonst geklemmt auf dasselbe Fenster zusammen).
    const wideRides = [{ dateISO: "2020-01-01", ctl: 30, atl: 20 }, ...buildRides()];
    render(
      <BrushBar
        rides={wideRides as never}
        projection={buildProjection() as never}
        range={{ fromISO: "2020-01-01", toISO: "2026-06-11" }}
        onRangeChange={() => {}}
      />,
    );
    const allButton = screen.getByText("Alles").closest("button");
    expect(allButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("rendert nichts, wenn kein Skelett aufgebaut werden kann (keine Fahrten/Horizont)", () => {
    const emptyProjection = { days: [], startCtl: 0, startAtl: 0, hasBaseline: false, asOf: null, horizonEnd: null };
    const { container } = render(
      <BrushBar rides={[]} projection={emptyProjection as never} range={null} onRangeChange={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
