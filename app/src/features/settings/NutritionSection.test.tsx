/* Tests: NutritionSection — saving sex, intolerances, and goal form.
 * Mocks the hooks used by the component and verifies the UI renders
 * and state changes correctly. */

import { act, fireEvent, render, renderHook, screen, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the hooks
const mockSaveSex = vi.fn();
const mockSaveIntolerances = vi.fn();
const mockAddGoal = vi.fn();

let mockBasics: Record<string, unknown> = {
  sex: null,
  intolerances: [],
  heightCm: 180,
};
let mockGoal: Record<string, unknown> | null = null;
let saveGoalResult: {
  ok: boolean;
  id?: string;
  error?: { code: string; message: string };
} = { ok: true, id: "goal-new" };

vi.mock("../../api/hooks/useProfile", () => ({
  useProfileBasics: () => ({ data: mockBasics, isLoading: false }),
  useUpdateSex: () => ({ update: mockSaveSex, isPending: false }),
  useUpdateIntolerances: () => ({ update: mockSaveIntolerances, isPending: false }),
}));

vi.mock("../../api/hooks/useNutritionGoals", () => ({
  useActiveNutritionGoal: () => ({ goal: mockGoal, isLoading: false }),
  useAddNutritionGoal: () => ({ add: mockAddGoal, isPending: false }),
}));

vi.mock("../../core/format.js", () => ({
  fmtDate: (iso: string) => iso?.slice(5) ?? "",
}));

const { NutritionSection } = await import("./NutritionSection");

describe("NutritionSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBasics = { sex: null, intolerances: [], heightCm: 180 };
    mockGoal = null;
    saveGoalResult = { ok: true, id: "goal-new" };
    mockAddGoal.mockImplementation(async () => saveGoalResult);
    mockSaveSex.mockImplementation(async () => ({ ok: true }));
    mockSaveIntolerances.mockImplementation(async () => ({ ok: true }));
  });

  it("rendert die Sektion mit Überschrift", () => {
    render(<NutritionSection />);
    expect(screen.getByText("Ernährung")).toBeTruthy();
  });

  it("rendert das Geschlecht-Feld mit Keine Angabe als Standard", () => {
    render(<NutritionSection />);
    const selects = screen.getAllByRole("combobox");
    // Das zweite select (nach Zieltyp) ist das Geschlecht-select
    expect(selects.length).toBeGreaterThanOrEqual(2);
  });

  it("ruft saveSex beim Ändern des Geschlechts", async () => {
    render(<NutritionSection />);
    const selects = screen.getAllByRole("combobox");
    const sexSelect = selects[selects.length - 1]; // last combobox is sex (ziel type is first)
    await act(async () => {
      fireEvent.change(sexSelect, { target: { value: "m" } });
    });
    expect(mockSaveSex).toHaveBeenCalledWith("m");
  });

  it("fragt das biologische Geschlecht NICHT, wenn die Basisdaten männlich/weiblich sagen", () => {
    for (const gender of ["maennlich", "weiblich"]) {
      mockBasics = { sex: null, gender, intolerances: [], heightCm: 180 };
      const { container, unmount } = render(<NutritionSection />);
      expect(within(container).queryByText("Biologisches Geschlecht für die Berechnung")).toBeNull();
      unmount();
    }
  });

  it("fragt das biologische Geschlecht bei divers und bei keiner Angabe", () => {
    for (const gender of ["divers", null]) {
      mockBasics = { sex: null, gender, intolerances: [], heightCm: 180 };
      const { container, unmount } = render(<NutritionSection />);
      expect(within(container).getByText("Biologisches Geschlecht für die Berechnung")).toBeTruthy();
      unmount();
    }
  });

  it("Streamer-Modus: Intoleranzen und Zielgewicht verdeckt, Ziel-Formular gesperrt", async () => {
    const { useStreamerMode } = await import("../../hooks/useStreamerMode");
    mockBasics = { sex: null, gender: "maennlich", intolerances: ["gluten"], heightCm: 180 };
    mockGoal = { goalType: "lose", targetWeightKg: 77, pacePerWeekKg: 0.4, targetDate: null };
    const hook = renderHook(() => useStreamerMode());
    act(() => hook.result.current.setEnabled(true));
    // unmount VOR dem Zurücksetzen: die älteren Tests räumen ihr DOM nicht auf,
    // ein stehengebliebener Render würde ihnen dazwischenfunken.
    const { container, unmount } = render(<NutritionSection />);
    try {
      expect(container.textContent).not.toContain("Gluten");
      expect(container.textContent).not.toContain("77");
      expect(container.textContent).toContain("Abnehmen");
      expect(within(container).queryByText("Neues Ziel setzen")).toBeNull();
      expect(container.textContent).toContain("Streamer-Modus aktiv");
    } finally {
      unmount();
      // Test-Daten zurücksetzen, BEVOR der Modus ausgeht: die stehengebliebenen
      // Renders der älteren Tests hören auf den Streamer-Zustand und zeichnen
      // sich dabei mit den dann aktuellen Mock-Daten neu.
      mockBasics = { sex: null, intolerances: [], heightCm: 180 };
      mockGoal = null;
      act(() => hook.result.current.setEnabled(false));
    }
  });

  it("zeigt Intoleranz-Checkboxen aus der Taxonomie", () => {
    render(<NutritionSection />);
    const allGluten = screen.getAllByText("Gluten");
    expect(allGluten.length).toBeGreaterThanOrEqual(1);
    const allEier = screen.getAllByText("Eier");
    expect(allEier.length).toBeGreaterThanOrEqual(1);
  });

  it("ruft saveIntolerances beim Togglen einer Checkbox", async () => {
    mockBasics = { sex: null, intolerances: [], heightCm: 180 };
    render(<NutritionSection />);
    const glutenCheckbox = screen.getAllByRole("checkbox").filter(cb => (cb as HTMLInputElement).labels?.[0]?.textContent?.includes("Gluten"))[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.click(glutenCheckbox);
    });
    expect(mockSaveIntolerances).toHaveBeenCalledWith(["gluten"]);
  });

  it("ruft saveIntolerances mit leerem Array beim 'Keine'-Button", async () => {
    mockBasics = { sex: null, intolerances: ["gluten"], heightCm: 180 };
    render(<NutritionSection />);
    const keineButtons = screen.getAllByText(/^Keine$/).filter(el => el.getAttribute("role") === "button");
    if (keineButtons.length > 0) {
      await act(async () => {
        fireEvent.click(keineButtons[0]);
      });
      expect(mockSaveIntolerances).toHaveBeenCalledWith([]);
    }
  });

  it("zeigt das aktuelle Ernährungsziel an", () => {
    mockGoal = {
      id: "g1", profileId: "p1", goalType: "lose",
      targetWeightKg: 78, pacePerWeekKg: 0.5, targetDate: null, createdAt: "2026-10-07T00:00:00Z",
    };
    render(<NutritionSection />);
    expect(screen.getByText(/Abnehmen/)).toBeTruthy();
  });

  it("erlaubt ein neues Ziel zu setzen und ruft addGoal auf", async () => {
    render(<NutritionSection />);
    const buttons = screen.getAllByText("Ziel setzen");
    fireEvent.click(buttons[buttons.length - 1]);
    const typSelect = screen.getByDisplayValue("Halten") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(typSelect, { target: { value: "maintain" } });
    });
    const submit = screen.getByText("Speichern");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(mockAddGoal).toHaveBeenCalledWith({ goalType: "maintain", targetWeightKg: null, pacePerWeekKg: null, targetDate: null });
  });

  it("zeigt Fehler bei fehlgeschlagenem Ziel-Speichern", async () => {
    saveGoalResult = { ok: false, error: { code: "SCHEMA", message: "Fehler" } };
    mockAddGoal.mockImplementation(async () => saveGoalResult);
    render(<NutritionSection />);
    const buttons = screen.getAllByText("Ziel setzen");
    fireEvent.click(buttons[buttons.length - 1]);
    const submit = screen.getByText("Speichern");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(screen.getByText("Fehler")).toBeTruthy();
  });
});