/* Tests: Portionen im Kochmodus (Fahrplan 30, B2) — Plan-Eintrag anpassen
 * (Bestätigung, Upsert, Fehler) und "Zum Plan hinzufügen" mit vorbelegten
 * Portionen. Läuft durch den echten CookingDialog; nur die Plan-Hooks sind
 * gemockt. Alle Daten synthetisch. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MealPlanEntry, Recipe } from "../../api/types";

const TODAY = "2026-10-14";

const upsertMock = vi.fn();
vi.mock("../../api/hooks/useMealPlan", () => ({
  useMealPlan: () => ({ entries: [], isLoading: false }),
  useUpsertMealPlanEntry: () => ({ upsert: upsertMock, isPending: false }),
}));

const { CookingDialog } = await import("./CookingDialog");
const { CookTimerProvider } = await import("../../components/CookTimerProvider");

const RECIPE: Recipe = {
  id: "r1",
  title: "Test-Eintopf",
  source: "own",
  externalId: null,
  submittedBy: null,
  status: "approved",
  rejectionReason: null,
  mealType: ["dinner"],
  dietTags: null,
  containsTags: [],
  servings: 2,
  prepMinutes: 25,
  ingredients: [{ name: "Linsen", amount: 200, unit: "g", category: "Hülsenfrüchte" }],
  instructions: [{ text: "Kochen", timerSeconds: undefined }],
  nutrition: { kcal: 600, protein: 30, carbs: 80, fat: 15 },
  imageUrl: null,
  createdAt: "",
  updatedAt: "",
};

const ENTRY: MealPlanEntry = {
  id: "e1",
  athleteId: "u1",
  date: "2026-10-15",
  mealSlot: "dinner",
  recipeId: "r1",
  servings: 1,
  extraServings: 0,
  createdAt: "",
  updatedAt: "",
};

function renderDialog(opts: { entry: MealPlanEntry | null; servings?: number; todayISO?: string; recipe?: Recipe }) {
  const recipe = opts.recipe ?? RECIPE;
  return render(
    <CookTimerProvider userId="user1">
      <CookingDialog
        recipe={recipe}
        servings={opts.servings ?? (opts.entry ? opts.entry.servings + opts.entry.extraServings : recipe.servings)}
        plan={{ entry: opts.entry, todayISO: opts.todayISO, recipes: [recipe] }}
        onClose={() => {}}
      />
    </CookTimerProvider>,
  );
}

const plus = (n = 1) => {
  for (let i = 0; i < n; i++) fireEvent.click(screen.getByRole("button", { name: "Eine halbe Portion mehr" }));
};
const minus = (n = 1) => {
  for (let i = 0; i < n; i++) fireEvent.click(screen.getByRole("button", { name: "Eine halbe Portion weniger" }));
};

beforeEach(() => {
  localStorage.clear();
  upsertMock.mockReset();
  upsertMock.mockImplementation(async (input) => ({
    ok: true,
    entry: { ...ENTRY, ...input, id: "e1" },
  }));
});
afterEach(() => cleanup());

describe("Kochmodus — Rezept liegt im Plan", () => {
  it("zeigt den Plan-Eintrag; ohne abweichende Portionen gibt es keine Änderungs-Aktion", () => {
    renderDialog({ entry: ENTRY });
    expect(screen.getByText(/Im Plan: Do 15\.10\., Abendessen · 1 Portion/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Im Plan ändern" })).toBeNull();
  });

  it("Besuch: 6 Portionen → Bestätigung → Upsert mit eigenem Anteil + Gäste-Portionen", async () => {
    renderDialog({ entry: ENTRY });
    plus(10); // 1 → 6
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));

    expect(screen.getByText("Im Plan auf 6 Portionen ändern?")).toBeTruthy();
    expect(screen.getByText(/1 für dich, 5 für Gäste/)).toBeTruthy();
    expect(upsertMock).not.toHaveBeenCalled(); // erst nach der Bestätigung

    fireEvent.click(screen.getByRole("button", { name: "Ja, ändern" }));
    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({
        date: "2026-10-15",
        mealSlot: "dinner",
        recipeId: "r1",
        servings: 1,
        extraServings: 5,
      }),
    );
    expect(await screen.findByText(/Im Plan auf 6 Portionen geändert\. Die Einkaufsliste passt sich an\./)).toBeTruthy();
    expect(screen.getByText(/davon 5 Gäste/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Im Plan ändern" })).toBeNull();
  });

  it("Abbrechen schreibt nichts", () => {
    renderDialog({ entry: ENTRY });
    plus(2);
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Im Plan ändern" })).toBeTruthy();
  });

  it("weniger als der eigene Anteil: eigene Portionen sinken, keine Gäste", async () => {
    renderDialog({ entry: { ...ENTRY, servings: 1.5 } });
    minus(2); // 1,5 → 0,5
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, ändern" }));
    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ servings: 0.5, extraServings: 0 })),
    );
  });

  it("behält den eigenen Anteil, wenn schon Gäste im Eintrag stehen", async () => {
    renderDialog({ entry: { ...ENTRY, servings: 1.5, extraServings: 2.5 } }); // Start: 4
    plus(4); // 6
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, ändern" }));
    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({ servings: 1.5, extraServings: 4.5 })),
    );
  });

  it("Fehler beim Speichern bleibt sichtbar, der Eintrag gilt weiter als unverändert", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "RLS verweigert" } });
    renderDialog({ entry: ENTRY });
    plus(2);
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, ändern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("RLS verweigert");
    expect(screen.queryByText(/geändert\. Die Einkaufsliste/)).toBeNull();
    expect(screen.getByText(/Im Plan: Do 15\.10\., Abendessen · 1 Portion/)).toBeTruthy();
  });

  it("der Hinweis 'geändert' verschwindet, sobald man die Portionen weiter ändert", async () => {
    renderDialog({ entry: ENTRY });
    plus(2);
    fireEvent.click(screen.getByRole("button", { name: "Im Plan ändern" }));
    fireEvent.click(screen.getByRole("button", { name: "Ja, ändern" }));
    await screen.findByText(/geändert\. Die Einkaufsliste/);
    plus(1);
    expect(screen.queryByText(/geändert\. Die Einkaufsliste/)).toBeNull();
    expect(screen.getByRole("button", { name: "Im Plan ändern" })).toBeTruthy();
  });
});

describe("Kochmodus — Rezept liegt nicht im Plan", () => {
  it("bietet 'Zum Plan hinzufügen' an und öffnet den PlanPicker mit vorbelegten Portionen", () => {
    renderDialog({ entry: null, servings: 2, todayISO: TODAY });
    plus(8); // 2 → 6
    fireEvent.click(screen.getByRole("button", { name: "Zum Plan hinzufügen" }));

    const picker = screen.getByRole("region", { name: "In den Plan legen" });
    expect((within(picker).getByLabelText("Portionen") as HTMLSelectElement).value).toBe("1");
    expect((within(picker).getByLabelText("Gäste-Portionen") as HTMLSelectElement).value).toBe("5");
    expect((within(picker).getByLabelText("Mahlzeit") as HTMLSelectElement).value).toBe("dinner");
  });

  it("Speichern legt den Eintrag mit eigenen + Gäste-Portionen an und zeigt ihn danach als 'Im Plan'", async () => {
    renderDialog({ entry: null, servings: 2, todayISO: TODAY });
    plus(8);
    fireEvent.click(screen.getByRole("button", { name: "Zum Plan hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "In den Plan legen" }));

    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({
        date: TODAY,
        mealSlot: "dinner",
        recipeId: "r1",
        servings: 1,
        extraServings: 5,
      }),
    );
    expect(await screen.findByText(/Liegt jetzt im Plan: Mi 14\.10\., Abendessen, 6 Portionen\./)).toBeTruthy();
    expect(screen.getByText(/Im Plan: Mi 14\.10\., Abendessen · 6 Portionen \(davon 5 Gäste\)/)).toBeTruthy();
  });

  it("Abbrechen im PlanPicker schreibt nichts und bringt den Button zurück", () => {
    renderDialog({ entry: null, servings: 2, todayISO: TODAY });
    fireEvent.click(screen.getByRole("button", { name: "Zum Plan hinzufügen" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Zum Plan hinzufügen" })).toBeTruthy();
  });

  it("ohne todayISO wird nichts zum Hinzufügen angeboten", () => {
    renderDialog({ entry: null, servings: 2 });
    expect(screen.queryByRole("button", { name: "Zum Plan hinzufügen" })).toBeNull();
  });

  it("ohne Nährwerte lässt sich das Rezept nicht planen", () => {
    renderDialog({ entry: null, servings: 2, todayISO: TODAY, recipe: { ...RECIPE, nutrition: null } });
    expect(screen.getByText("Ohne Nährwerte lässt sich das Rezept nicht planen.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Zum Plan hinzufügen" })).toBeNull();
  });
});
