/* Tests: TrainerGoals — Fahrplan 43 E7 (Z6, Z8).
 * Der Trainer sieht Haupt-/Nebenziel mit Datum und den Ziel-Check, nur lesend.
 * Datenfluss: die Komponente darf Ernährungsdaten und Körperwerte nie laden —
 * nicht nur nicht anzeigen. Deshalb Spione auf diese Hooks und ein Blick in den
 * Quelltext von Komponente und View-Model. */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Goal } from "../../api/types";

let mockGoals: Goal[] = [];
let mockState = { isLoading: false, isError: false };
const useAthleteGoals = vi.fn((_profileId: string | null) => ({ goals: mockGoals, ...mockState }));
const nutritionSpy = vi.fn();
const profileBasicsSpy = vi.fn();

vi.mock("../../api/hooks/useGoals", () => ({
  useAthleteGoals: (id: string | null) => useAthleteGoals(id),
}));
vi.mock("../../api/hooks/useNutritionGoals", () => ({
  useActiveNutritionGoal: nutritionSpy,
  useAddNutritionGoal: nutritionSpy,
}));
vi.mock("../../api/hooks/useProfile", () => ({ useProfileBasics: profileBasicsSpy }));
vi.mock("../../api/hooks/useAthleteConfig", () => ({ useAthleteConfig: () => null }));
vi.mock("./useFtpHistoryEntries", () => ({
  useFtpHistoryEntries: () => [{ id: "f1", ftpWatt: 214, validFrom: "2026-09-01", source: "ramp-test" }],
}));

const { TrainerGoals } = await import("./TrainerGoals");

/** Quelltexte als Rohtext (Vite), für die Import-Prüfung. */
const sources = import.meta.glob<string>(["./TrainerGoals.tsx", "./trainer-goals-view-model.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

function goal(over: Partial<Goal> & { id: string }): Goal {
  return {
    kind: "x",
    targetValue: null,
    targetDate: null,
    note: null,
    isActive: true,
    goalKey: null,
    role: null,
    ...over,
  };
}

const ftp = goal({ id: "g1", kind: "FTP", goalKey: "ftp", role: "main", targetValue: 232, targetDate: "2026-12-20" });
const fat = goal({ id: "g2", kind: "Fett verlieren", goalKey: "fett_verlieren", role: "side", targetValue: 70 });

beforeEach(() => {
  mockGoals = [ftp, fat];
  mockState = { isLoading: false, isError: false };
  useAthleteGoals.mockClear();
  nutritionSpy.mockClear();
  profileBasicsSpy.mockClear();
});

const renderIt = () =>
  render(<TrainerGoals athleteId="athlete1" athleteProfileId="profile-1" rides={[]} wellness={[]} />);

describe("TrainerGoals", () => {
  it("zeigt Haupt- und Nebenziel mit Datum und ist ohne Bedienelemente", () => {
    renderIt();
    expect(screen.getByText("Hauptziel")).toBeTruthy();
    expect(screen.getByText("FTP steigern")).toBeTruthy();
    expect(screen.getByText(/20\.12\.2026/)).toBeTruthy();
    expect(screen.getByText("Nebenziel")).toBeTruthy();
    expect(screen.getByText("Fett verlieren")).toBeTruthy();
    // Z8: nichts zum Ändern oder Beenden
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryByText(/beenden|hinzufügen|speichern/i)).toBeNull();
  });

  it("lädt die Ziele des Athleten über seine Profil-ID", () => {
    renderIt();
    expect(useAthleteGoals).toHaveBeenCalledWith("profile-1");
  });

  it("zeigt den Ziel-Check für das FTP-Ziel", () => {
    renderIt();
    expect(screen.getByText(/Aktuelle FTP|reichen die eFTP-Daten noch nicht/)).toBeTruthy();
  });

  it("Z6: keine Gewichtswerte im Text, auch nicht der Wert am Fett-verlieren-Ziel", () => {
    const { container } = renderIt();
    expect(container.textContent).not.toMatch(/\bkg\b|Zielgewicht|Defizit|Tempo pro|kcal|\b70\b/);
  });

  it("Z6 Datenfluss: Ernährungsziele und Körperwerte werden gar nicht erst geladen", () => {
    renderIt();
    expect(nutritionSpy).not.toHaveBeenCalled();
    expect(profileBasicsSpy).not.toHaveBeenCalled();
  });

  it("Z6 Datenfluss: Komponente und View-Model importieren keine Ernährungs- oder Körperwert-Quellen", () => {
    for (const [file, raw] of Object.entries(sources)) {
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code.length, file).toBeGreaterThan(200);
      expect(code, file).not.toMatch(
        /nutrition|useProfile|weightKg|weight_kg|targetWeight|bodyFat|goal-nutrition-sync|wellbeing/i,
      );
    }
  });

  it("ohne Ziele steht ein ruhiger Leer-Text", () => {
    mockGoals = [];
    renderIt();
    expect(screen.getByText(/noch kein Haupt- oder Nebenziel/)).toBeTruthy();
  });

  it("meldet Lade- und Fehlerzustand ohne Zahlen", () => {
    mockState = { isLoading: true, isError: false };
    const { unmount } = renderIt();
    expect(screen.getByText("Lädt …")).toBeTruthy();
    unmount();
    mockState = { isLoading: false, isError: true };
    renderIt();
    expect(screen.getByText("Ziele konnten nicht geladen werden.")).toBeTruthy();
  });
});
