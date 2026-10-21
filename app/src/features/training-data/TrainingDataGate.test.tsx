/* Tests: TrainingDataGate — Platz in config.ts kommt durch, Einträge ohne Platz
 * lesen die Tabellen: Laden / Lesefehler / leer (Sync nicht gelaufen) / befüllt. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultError_ } from "../../api/result";

let mockActive = "athlete1";
let mockRides: { data?: unknown; isLoading: boolean; error: unknown } = {
  data: undefined,
  isLoading: false,
  error: null,
};
vi.mock("../../api/hooks/useActiveAthlete", () => ({
  useActiveAthlete: () => ({ activeAthleteId: mockActive, setActiveAthleteId: vi.fn() }),
}));
vi.mock("../../api/hooks/useRides", () => ({ useRides: () => mockRides }));

const { TrainingDataGate } = await import("./TrainingDataGate");
const { NO_TRAINING_DATA_TEXT } = await import("./NoTrainingData");

afterEach(cleanup);

function renderGate() {
  render(
    <TrainingDataGate>
      <p>Seite</p>
    </TrainingDataGate>,
  );
}

describe("TrainingDataGate", () => {
  it("Platz in config.ts: zeigt die Seite, keinen Hinweis — auch während die Datei lädt", () => {
    mockActive = "athlete1";
    mockRides = { data: undefined, isLoading: true, error: null };
    renderGate();
    expect(screen.getByText("Seite")).toBeTruthy();
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
  });

  it("ohne Platz, Tabellen laden noch: Lade-Hinweis statt Leer-Hinweis", () => {
    mockActive = "self";
    mockRides = { data: undefined, isLoading: true, error: null };
    renderGate();
    expect(screen.getByText("Lädt …")).toBeTruthy();
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
    expect(screen.queryByText("Seite")).toBeNull();
  });

  it("ohne Platz, Lesefehler: Fehlermeldung, KEIN Leer-Hinweis", () => {
    mockActive = "self";
    mockRides = {
      data: undefined,
      isLoading: false,
      error: new ResultError_({ code: "UNKNOWN", message: "permission denied" }),
    };
    renderGate();
    expect(screen.getByRole("alert").textContent).toContain("permission denied");
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
    expect(screen.queryByText("Seite")).toBeNull();
  });

  it("ohne Platz, Tabellen leer (Sync nicht gelaufen): Leer-Hinweis statt Seite", () => {
    mockActive = "self";
    mockRides = { data: { trainingDataEmpty: true }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByText(NO_TRAINING_DATA_TEXT)).toBeTruthy();
    expect(screen.queryByText("Seite")).toBeNull();
  });

  it("ohne Platz, Daten vorhanden: zeigt die Seite", () => {
    mockActive = "self";
    mockRides = { data: { trainingDataEmpty: false }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByText("Seite")).toBeTruthy();
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
  });
});
