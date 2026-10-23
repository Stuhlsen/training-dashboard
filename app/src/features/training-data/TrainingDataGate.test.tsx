/* Tests: TrainingDataGate — Platz in config.ts kommt durch, Einträge ohne Platz
 * lesen die Tabellen: Laden / Lesefehler / leer (Sync nicht gelaufen) / befüllt. */

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
let mockIsSelf = true;
let mockCreds: { credentials: unknown; isLoading: boolean } = { credentials: null, isLoading: false };
vi.mock("../../api/hooks/useWriteAuthorization", () => ({
  useIsSelfAthlete: () => ({ isSelf: mockIsSelf, isLoading: false }),
}));
vi.mock("../../api/hooks/useIntervalsCredentials", () => ({ useIntervalsCredentials: () => mockCreds }));

const { TrainingDataGate } = await import("./TrainingDataGate");
const { NO_TRAINING_DATA_TEXT, AWAITING_SYNC_TEXT, MISSING_CREDENTIALS_TEXT } = await import("./no-data-reason");

afterEach(() => {
  cleanup();
  mockIsSelf = true;
  mockCreds = { credentials: null, isLoading: false };
});

function renderGate() {
  render(
    <MemoryRouter>
      <TrainingDataGate>
        <p>Seite</p>
      </TrainingDataGate>
    </MemoryRouter>,
  );
}

describe("TrainingDataGate", () => {
  it("Platz in config.ts: lädt wie jeder Eintrag aus den Tabellen — Lade-Hinweis, dann Seite", () => {
    mockActive = "athlete1";
    mockRides = { data: undefined, isLoading: true, error: null };
    renderGate();
    expect(screen.getByText("Lädt …")).toBeTruthy();
    expect(screen.queryByText("Seite")).toBeNull();
    cleanup();
    mockRides = { data: { trainingDataEmpty: false }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByText("Seite")).toBeTruthy();
  });

  it("Platz in config.ts mit leeren Tabellen: Leer-Hinweis statt Seite", () => {
    mockActive = "athlete2";
    mockRides = { data: { trainingDataEmpty: true }, isLoading: false, error: null };
    renderGate();
    expect(screen.queryByText("Seite")).toBeNull();
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

  it("eigenes Profil, Tabellen leer, keine Zugangsdaten: Hinweis mit Weg in die Einstellungen", () => {
    mockActive = "self";
    mockRides = { data: { trainingDataEmpty: true }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByRole("status").textContent).toContain(NO_TRAINING_DATA_TEXT);
    expect(screen.getByRole("status").textContent).toContain(MISSING_CREDENTIALS_TEXT);
    expect(screen.getByRole("link", { name: "Zu den Einstellungen" }).getAttribute("href")).toBe(
      "/app/settings#sec-daten",
    );
    expect(screen.queryByText("Seite")).toBeNull();
  });

  it("eigenes Profil, Tabellen leer, Zugangsdaten da: nach dem nächsten Sync, kein Link", () => {
    mockActive = "self";
    mockCreds = { credentials: { apiKey: "k", athleteId: "i1" }, isLoading: false };
    mockRides = { data: { trainingDataEmpty: true }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByRole("status").textContent).toBe(AWAITING_SYNC_TEXT);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("fremdes Profil, Tabellen leer: neutraler Hinweis ohne Link", () => {
    mockActive = "some-other-uuid";
    mockIsSelf = false;
    mockRides = { data: { trainingDataEmpty: true }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByRole("status").textContent).toBe(NO_TRAINING_DATA_TEXT);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ohne Platz, Daten vorhanden: zeigt die Seite", () => {
    mockActive = "self";
    mockRides = { data: { trainingDataEmpty: false }, isLoading: false, error: null };
    renderGate();
    expect(screen.getByText("Seite")).toBeTruthy();
    expect(screen.queryByText(NO_TRAINING_DATA_TEXT)).toBeNull();
  });
});
