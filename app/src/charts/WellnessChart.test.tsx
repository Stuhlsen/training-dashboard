import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WellnessChart } from "./WellnessChart";

afterEach(cleanup);

function buildOwnPlanRidesAndWellness() {
  // Vor 2026-06-22 (PLAN2_SCHEDULE-Start): nur rides tragen hrv/ruhepuls
  // (Notion-Ära, RMSSD). Ab 2026-06-22: wellness (intervals.icu, SDNN).
  const rides = [
    { dateISO: "2026-06-01", hrv: 55, ruhepuls: 50, week: null },
    { dateISO: "2026-06-05", hrv: 58, ruhepuls: 49, week: null },
    // week gesetzt markiert den Eigenplan-Athleten (ownPlan-Erkennung)
    { dateISO: "2026-06-25", hrv: null, ruhepuls: null, week: "2026-KW26" },
  ];
  const wellness = [
    { dateISO: "2026-06-25", hrv: 62, restingHR: 47 },
    { dateISO: "2026-06-28", hrv: 64, restingHR: 46 },
    { dateISO: "2026-07-01", hrv: 66, restingHR: 45 },
  ];
  return { rides, wellness };
}

describe("WellnessChart", () => {
  it("rendert ein SVG mit Achsenbeschriftung für HRV", () => {
    const { rides, wellness } = buildOwnPlanRidesAndWellness();
    render(<WellnessChart rides={rides as never} wellness={wellness as never} metric="hrv" />);
    const svg = screen.getByRole("img", { name: /HRV-Trend/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt einen Leerzustand ohne ausreichend Daten", () => {
    render(<WellnessChart rides={[]} wellness={[]} metric="hrv" />);
    screen.getByText(/Noch nicht genug HRV-Daten/);
  });

  it("kombiniert ride- und wellness-Werte für den Eigenplan-Athleten (Methodenwechsel-Divider sichtbar)", () => {
    const { rides, wellness } = buildOwnPlanRidesAndWellness();
    const { container } = render(<WellnessChart rides={rides as never} wellness={wellness as never} metric="hrv" />);
    const divider = container.querySelector('line[stroke-dasharray="2,3"]');
    expect(divider).not.toBeNull();
  });

  it("liest bei Athlet 2 (kein eigener Plan, kein week-Feld) direkt aus wellness", () => {
    const wellness = [
      { dateISO: "2026-06-01", hrv: 60, restingHR: 48 },
      { dateISO: "2026-06-05", hrv: 62, restingHR: 47 },
    ];
    render(<WellnessChart rides={[]} wellness={wellness as never} metric="hrv" />);
    const svg = screen.getByRole("img", { name: /HRV-Trend/ });
    expect(svg.tagName).toBe("svg");
  });

  it("zeigt bei einer reinen rMSSD-Reihe (Garmin) keinen Methodenwechsel-Divider", () => {
    const wellness = Array.from({ length: 12 }, (_, i) => ({
      dateISO: `2026-08-${String(i + 1).padStart(2, "0")}`,
      hrv: 70 + i,
      restingHR: 48,
      hrvMethod: "rmssd" as const,
    }));
    const { container } = render(
      <WellnessChart rides={[]} wellness={wellness as never} metric="hrv" />,
    );
    expect(container.querySelector('line[stroke-dasharray="2,3"]')).toBeNull();
  });

  it("wechselt die Metrik über den Umschalter (onMetricChange)", () => {
    const onMetricChange = vi.fn();
    const { rides, wellness } = buildOwnPlanRidesAndWellness();
    render(
      <WellnessChart
        rides={rides as never}
        wellness={wellness as never}
        metric="hrv"
        onMetricChange={onMetricChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ruhepuls" }));
    expect(onMetricChange).toHaveBeenCalledWith("ruhepuls");
  });

  it("zeigt bei Hover auf einen Datenpunkt einen Tooltip mit Datum und Wert", () => {
    const { rides, wellness } = buildOwnPlanRidesAndWellness();
    const { container } = render(<WellnessChart rides={rides as never} wellness={wellness as never} metric="hrv" />);
    const dot = container.querySelector('circle[fill="var(--role-primary)"]');
    expect(dot).not.toBeNull();
    // Die sichtbare Punktgröße ist unverändert klein (19.08.2026, Bugfix) —
    // die größere, unsichtbare Trefferfläche liegt als vorheriges Geschwister
    // im DOM (s. WellnessChart.tsx-Kommentar) und trägt die Hover-Handler.
    const point = dot!.previousElementSibling as Element;
    fireEvent.mouseEnter(point, { clientX: 50, clientY: 50 });
    screen.getByRole("tooltip", { name: /ms/ });
    fireEvent.mouseLeave(point as Element);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
