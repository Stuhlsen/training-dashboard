import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecoveryBlock } from "./RecoveryBlock";

type WellnessDay = import("../../types.js").WellnessDay;

afterEach(cleanup);

describe("RecoveryBlock", () => {
  it("zeigt den jüngsten HRV-/Ruhepuls-Wert und die nächste Belastung", () => {
    const wellness = [
      { dateISO: "2026-07-18", dateShort: "18.07", hrv: 55, restingHR: 48 },
      { dateISO: "2026-07-20", dateShort: "20.07", hrv: 60, restingHR: 46 },
    ] as WellnessDay[];
    const plannedSessions = [
      { date: "2026-07-21", name: "Recovery", workout: undefined },
      { date: "2026-07-23", name: "Sweet-Spot-Intervalle", workout: { label: "x" } },
    ];
    render(
      <RecoveryBlock
        typ="Z1 Recovery"
        date="2026-07-20"
        details="Locker ausrollen"
        wellness={wellness}
        plannedSessions={plannedSessions}
      />,
    );
    screen.getByText("60 ms");
    screen.getByText("46 bpm");
    screen.getByText(/Sweet-Spot-Intervalle/);
    screen.getByText("Locker ausrollen");
  });

  it("zeigt 'nicht erfasst' ohne Wellness-Daten", () => {
    render(<RecoveryBlock typ="Z1" date="2026-07-20" details="x" wellness={[]} plannedSessions={[]} />);
    expect(screen.getAllByText("– nicht erfasst")).toHaveLength(2);
  });

  it("rendert nichts außerhalb der Recovery-Typen", () => {
    const { container } = render(
      <RecoveryBlock typ="Sweet Spot" date="2026-07-20" details="x" wellness={[]} plannedSessions={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
