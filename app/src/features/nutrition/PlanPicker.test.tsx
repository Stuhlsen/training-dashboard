/* Tests: PlanPicker (Fahrplan 25 R2, erweitert in Fahrplan 30 B2) —
 * Gäste-Portionen, Vorbelegung, Ergebnis mit gespeichertem Eintrag.
 * Alle Daten synthetisch. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { MealPlanEntry, Recipe } from "../../api/types";

const TODAY = "2026-10-14";

let mockEntries: MealPlanEntry[] = [];
const upsertMock = vi.fn();
vi.mock("../../api/hooks/useMealPlan", () => ({
  useMealPlan: () => ({ entries: mockEntries, isLoading: false }),
  useUpsertMealPlanEntry: () => ({ upsert: upsertMock, isPending: false }),
}));

const { PlanPicker } = await import("./PlanPicker");

const RECIPE = {
  id: "r1",
  title: "Test-Eintopf",
  mealType: ["dinner"],
  servings: 2,
  nutrition: { kcal: 600, protein: 30, carbs: 80, fat: 15 },
} as unknown as Recipe;

const SAVED: MealPlanEntry = {
  id: "e1",
  athleteId: "u1",
  date: TODAY,
  mealSlot: "dinner",
  recipeId: "r1",
  servings: 1,
  extraServings: 0,
  createdAt: "",
  updatedAt: "",
};

const field = (name: string) => screen.getByLabelText(name) as HTMLSelectElement;

function renderPicker(props: Partial<ComponentProps<typeof PlanPicker>> = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  render(<PlanPicker recipe={RECIPE} recipes={[RECIPE]} todayISO={TODAY} onCancel={onCancel} onDone={onDone} {...props} />);
  return { onDone, onCancel };
}

beforeEach(() => {
  mockEntries = [];
  upsertMock.mockReset();
  upsertMock.mockImplementation(async (input) => ({ ok: true, entry: { ...SAVED, ...input } }));
});
afterEach(() => cleanup());

describe("PlanPicker — Gäste-Portionen", () => {
  it("startet mit 1 Portion und 0 Gästen", () => {
    renderPicker();
    expect(field("Portionen").value).toBe("1");
    expect(field("Gäste-Portionen").value).toBe("0");
  });

  it("übernimmt vorbelegte Portionen", () => {
    renderPicker({ initialServings: 1.5, initialExtraServings: 4 });
    expect(field("Portionen").value).toBe("1.5");
    expect(field("Gäste-Portionen").value).toBe("4");
  });

  it("Gäste-Auswahl reicht von 0 bis 11,5", () => {
    renderPicker();
    const values = Array.from(field("Gäste-Portionen").options).map((o) => o.value);
    expect(values[0]).toBe("0");
    expect(values[values.length - 1]).toBe("11.5");
  });

  it("Speichern gibt Gäste-Portionen an den Upsert und den gespeicherten Eintrag an onDone", async () => {
    const { onDone } = renderPicker();
    fireEvent.change(field("Gäste-Portionen"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "In den Plan legen" }));

    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({ date: TODAY, mealSlot: "dinner", recipeId: "r1", servings: 1, extraServings: 3 }),
    );
    await waitFor(() =>
      expect(onDone).toHaveBeenCalledWith(
        expect.objectContaining({
          dateISO: TODAY,
          slot: "dinner",
          servings: 1,
          extraServings: 3,
          entry: expect.objectContaining({ id: "e1" }),
        }),
      ),
    );
  });

  it("Gäste > 0: Hinweis, dass sie nicht in die Tageswerte zählen", () => {
    renderPicker({ initialExtraServings: 2 });
    expect(screen.getByText(/nicht für deine Tageswerte/)).toBeTruthy();
  });

  it("derselbe Eintrag inkl. Gäste → 'liegt dort schon genau so'; andere Gäste → wird ersetzt", () => {
    mockEntries = [{ ...SAVED, extraServings: 2 }];
    renderPicker({ initialExtraServings: 2 });
    expect(screen.getByText("Dieses Rezept liegt dort schon genau so im Plan.")).toBeTruthy();
    fireEvent.change(field("Gäste-Portionen"), { target: { value: "3" } });
    expect(screen.queryByText("Dieses Rezept liegt dort schon genau so im Plan.")).toBeNull();
  });

  it("Fehler bleiben sichtbar und onDone wird nicht gerufen", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "RLS verweigert" } });
    const { onDone } = renderPicker();
    fireEvent.click(screen.getByRole("button", { name: "In den Plan legen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("RLS verweigert");
    expect(onDone).not.toHaveBeenCalled();
  });
});
