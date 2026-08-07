import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LegacyWorkoutTimeline } from "./LegacyWorkoutTimeline";

afterEach(cleanup);

describe("LegacyWorkoutTimeline", () => {
  it("rendert Segmente, Zusammenfassung und Watt-Zeile für das alte Format", () => {
    render(
      <LegacyWorkoutTimeline
        workout={{ label: "4x8min SS", intervals: 4, duration: 8, warmup: 10, rest: 3, cooldown: 10, watts: [160, 185] }}
        accentColor="#e08a3c"
      />,
    );
    screen.getByText("🏋 4x8min SS");
    expect(screen.getAllByText("8'")).toHaveLength(4);
    expect(screen.getAllByText("3'")).toHaveLength(3);
    screen.getByText("WU");
    screen.getByText("CD");
    screen.getByText("160–185W · Ziel: 173W");
  });

  it("rendert nichts für das neue Block-Format", () => {
    const { container } = render(
      <LegacyWorkoutTimeline workout={{ blocks: [{ type: "interval", text: "4x8'" }] }} accentColor="#e08a3c" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("rendert nichts ohne Workout", () => {
    const { container } = render(<LegacyWorkoutTimeline workout={null} accentColor="#e08a3c" />);
    expect(container.firstChild).toBeNull();
  });
});
