/* Tests: TrainingDataGate — Leer-Hinweis nur für Einträge ohne Platz in config.ts. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let mockActive = "athlete1";
vi.mock("../../api/hooks/useActiveAthlete", () => ({
  useActiveAthlete: () => ({ activeAthleteId: mockActive, setActiveAthleteId: vi.fn() }),
}));

const { TrainingDataGate } = await import("./TrainingDataGate");
const { NO_TRAINING_DATA_TEXT } = await import("./NoTrainingData");

afterEach(cleanup);

describe("TrainingDataGate", () => {
  it("Platz in config.ts: zeigt die Seite, keinen Hinweis", () => {
    mockActive = "athlete1";
    render(
      <TrainingDataGate>
        <p>Seite</p>
      </TrainingDataGate>,
    );
    expect(screen.getByText("Seite")).toBeTruthy();
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
  });

  it("eigener Eintrag ohne Platz: Hinweis statt Seite", () => {
    mockActive = "self";
    render(
      <TrainingDataGate>
        <p>Seite</p>
      </TrainingDataGate>,
    );
    expect(screen.getByText(NO_TRAINING_DATA_TEXT)).toBeTruthy();
    expect(screen.queryByText("Seite")).toBeNull();
  });
});
