import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeltaBanner } from "./DeltaBanner";

type EventItem = import("../../api/types").EventItem;

afterEach(cleanup);

describe("DeltaBanner", () => {
  it("zeigt den Event-Teil (TSB vorher/nachher) inkl. Titel", () => {
    const state = {
      event: { event: { title: "GFNY Bremen", eventDate: "2026-08-05" } as EventItem, before: -10, after: -4 },
      impact: null,
    };
    render(<DeltaBanner state={state} onClose={() => {}} />);
    screen.getByText(/GFNY Bremen, 05.08/);
    screen.getByText("-10");
    screen.getByText("-4");
  });

  it("zeigt den Wirkungs-Teil unabhängig vom Event-Teil", () => {
    const state = {
      event: null,
      impact: {
        date: "2026-07-25",
        before: { deltaFitness: -1.3, deltaFatigue: -8.6, deltaForm: 7.3, uncertain: false },
        after: { deltaFitness: -1.0, deltaFatigue: -3.2, deltaForm: 2.2, uncertain: false },
      },
    };
    render(<DeltaBanner state={state} onClose={() => {}} />);
    screen.getByText(/Wirkung am 25.07/);
    screen.getByText(/modelliert/);
  });

  it("ruft onClose beim Klick auf den Schließen-Button", () => {
    const onClose = vi.fn();
    render(
      <DeltaBanner
        state={{ event: null, impact: { date: "2026-07-25", before: { deltaFitness: 0, deltaFatigue: 0, deltaForm: 0, uncertain: false }, after: { deltaFitness: 0, deltaFatigue: 0, deltaForm: 0, uncertain: false } } }}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByTitle("Schließen"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
