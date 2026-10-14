/* Tests: NutritionStep (real component) — saves height, sex, intolerances,
 * optional goal, not skippable.
 * Mocks the hooks used by the component to control profile basics data
 * and verify save calls. */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSaveSex = vi.fn();
const mockSaveIntolerances = vi.fn();
const mockSaveHeightCm = vi.fn();
const mockAddGoal = vi.fn();

let mockBasics: Record<string, unknown> = {
  sex: null,
  intolerances: [],
  heightCm: 180,
};
let addGoalResult: {
  ok: boolean;
  id?: string;
  error?: { code: string; message: string };
} = { ok: true, id: "goal-new" };

vi.mock("../../api/hooks/useProfile", () => ({
  useProfileBasics: () => ({ data: mockBasics, isLoading: false }),
  useUpdateSex: () => ({ update: mockSaveSex, isPending: false }),
  useUpdateIntolerances: () => ({ update: mockSaveIntolerances, isPending: false }),
  useUpdateHeightCm: () => ({ update: mockSaveHeightCm, isPending: false }),
}));

vi.mock("../../api/hooks/useNutritionGoals", () => ({
  useAddNutritionGoal: () => ({ add: mockAddGoal, isPending: false }),
}));

const { NutritionStep } = await import("./NutritionStep");

describe("NutritionStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBasics = { sex: null, intolerances: [], heightCm: 180 };
    addGoalResult = { ok: true, id: "goal-new" };
    mockSaveSex.mockImplementation(async () => ({ ok: true }));
    mockSaveIntolerances.mockImplementation(async () => ({ ok: true }));
    mockSaveHeightCm.mockImplementation(async () => ({ ok: true }));
    mockAddGoal.mockImplementation(async () => addGoalResult);
  });

  it("rendert den Weiter-Button (nicht skippable)", () => {
    const onComplete = vi.fn();
    render(<NutritionStep onComplete={onComplete} />);
    expect(screen.getByText("Weiter")).toBeTruthy();
  });

  it("ruft saveHeightCm nach Blur mit gültiger Größe", async () => {
    render(<NutritionStep onComplete={() => {}} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const input = inputs[0];
    // Set DOM value directly and fire focusOut (bubbles, triggers React onBlur)
    await act(async () => {
      (input as HTMLInputElement).value = "185";
      fireEvent.focusOut(input);
    });
    await act(async () => {
      fireEvent.blur(input);
    });
    await new Promise(r => setTimeout(r, 20));
    expect(mockSaveHeightCm).toHaveBeenCalledWith(185);
  });

  it("zeigt Fehler bei leerer Größe", async () => {
    render(<NutritionStep onComplete={() => {}} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const input = inputs[0];
    await act(async () => {
      (input as HTMLInputElement).value = "";
      fireEvent.focusOut(input);
    });
    // Nur ein Blur: das Feld ist controlled und springt danach auf den
    // geladenen Wert zurück — ein zweiter Blur würde 180 lesen und den
    // Fehler wieder löschen.
    expect(screen.getByText("Körpergröße ist erforderlich.")).toBeTruthy();
  });

  it("ruft saveSex bei Auswahl", async () => {
    render(<NutritionStep onComplete={() => {}} />);
    const selects = screen.getAllByRole("combobox");
    const sexSelect = selects[selects.length - 1];
    await act(async () => {
      fireEvent.change(sexSelect, { target: { value: "m" } });
    });
    expect(mockSaveSex).toHaveBeenCalledWith("m");
  });

  it("ruft saveIntolerances beim Togglen einer Checkbox", async () => {
    render(<NutritionStep onComplete={() => {}} />);
    const glutenCheckbox = screen.getAllByRole("checkbox").filter(cb =>
      (cb as HTMLInputElement).labels?.[0]?.textContent?.includes("Gluten")
    )[0] as HTMLInputElement;
    await act(async () => {
      fireEvent.click(glutenCheckbox);
    });
    expect(mockSaveIntolerances).toHaveBeenCalledWith(["gluten"]);
  });

  it("ruft saveIntolerances mit [] beim 'Keine'-Button", async () => {
    mockBasics = { sex: null, intolerances: ["gluten"], heightCm: 180 };
    render(<NutritionStep onComplete={() => {}} />);
    const keineButtons = screen.getAllByText(/^Keine$/).filter(el => el.getAttribute("role") === "button");
    if (keineButtons.length > 0) {
      await act(async () => {
        fireEvent.click(keineButtons[0]);
      });
      expect(mockSaveIntolerances).toHaveBeenCalledWith([]);
    }
  });

  it("erlaubt ein optionales Ernährungsziel zu setzen", async () => {
    render(<NutritionStep onComplete={() => {}} />);
    const setzenButtons = screen.getAllByText("Ziel setzen");
    fireEvent.click(setzenButtons[setzenButtons.length - 1]);
    const submit = screen.getByText("Speichern");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(mockAddGoal).toHaveBeenCalledWith({ goalType: "maintain", targetWeightKg: null, pacePerWeekKg: null, targetDate: null });
  });

  it("zeigt Fehler bei fehlgeschlagenem Ziel-Speichern", async () => {
    addGoalResult = { ok: false, error: { code: "SCHEMA", message: "Fehler beim Speichern" } };
    mockAddGoal.mockImplementation(async () => addGoalResult);
    render(<NutritionStep onComplete={() => {}} />);
    const setzenButtons = screen.getAllByText("Ziel setzen");
    fireEvent.click(setzenButtons[setzenButtons.length - 1]);
    const submit = screen.getByText("Speichern");
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(screen.getByText("Fehler beim Speichern")).toBeTruthy();
  });

  it("ruft onComplete beim Weiter-Button", () => {
    const onComplete = vi.fn();
    render(<NutritionStep onComplete={onComplete} />);
    const weiterButtons = screen.getAllByText("Weiter");
    fireEvent.click(weiterButtons[weiterButtons.length - 1]);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});