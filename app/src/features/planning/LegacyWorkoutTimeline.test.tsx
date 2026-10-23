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

describe("LegacyWorkoutTimeline — Generator-Karte mit workoutStructure", () => {
  it("zeigt Over-Under als Wechsel über/unter mit Wattzeile aus der aktuellen FTP", () => {
    render(
      <LegacyWorkoutTimeline
        workout={{ label: "Over-Under 3×9", warmup: 15, intervals: 3, duration: 9, rest: 3, cooldown: 10, pct: [88, 105] }}
        workoutStructure={{
          version: 1,
          steps: [
            { kind: "warmup", duration_s: 900, target_pct_ftp: 55 },
            {
              kind: "alternating",
              reps: 3,
              cycles: 3,
              duration_s: 540,
              over: { duration_s: 120, target_pct_ftp: 105 },
              under: { duration_s: 60, target_pct_ftp: 88 },
              recovery: { duration_s: 180, target_pct_ftp: 50 },
            },
            { kind: "cooldown", duration_s: 600, target_pct_ftp: 50 },
          ],
        }}
        ftp={180}
        accentColor="#e08a3c"
      />,
    );
    screen.getByText("🏋 Over-Under 3×9");
    expect(screen.getAllByTitle("2 min @ 105 % FTP (über)")).toHaveLength(9);
    expect(screen.getAllByTitle("1 min @ 88 % FTP (unter)")).toHaveLength(9);
    screen.getByText("Über 189 W · Unter 158 W");
    expect(screen.queryByText(/9' /)).toBeNull();
  });
});
