/* Tests: RecipesView (Untertab "Rezepte") — Liste, Zustände (Laden, Fehler,
 * leer, Filter ohne Treffer, Unverträglichkeiten), Suche/Filter, Details,
 * "Kochen" ohne Schreiben, "In den Plan" (Erfolg + sichtbarer Fehler).
 * Hooks sind gemockt, die Filterlogik selbst testet core/recipe-browse.test.js. */

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanEntry, Recipe } from "../../api/types";

const TODAY = "2026-10-14";

let mockRecipes: Recipe[] = [];
let mockState = { isLoading: false, isError: false };
let mockIntolerances: string[] = [];
let mockEntries: MealPlanEntry[] = [];
const refetchMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("../../api/hooks/useRecipes", () => ({
  useRecipes: () => ({ recipes: mockRecipes, ...mockState, refetch: refetchMock }),
}));
vi.mock("../../api/hooks/useProfile", () => ({
  useProfileBasics: () => ({ data: { intolerances: mockIntolerances }, isLoading: false }),
}));
vi.mock("../../api/hooks/useMealPlan", () => ({
  useMealPlan: () => ({ entries: mockEntries, isLoading: false }),
  useUpsertMealPlanEntry: () => ({ upsert: upsertMock, isPending: false }),
}));

// Der Kochmodus braucht den Timer-Kontext und hat eigene Tests
vi.mock("./CookingDialog", () => ({
  CookingDialog: ({ recipe, servings, onClose }: { recipe: { title: string }; servings: number; onClose: () => void }) => (
    <div role="dialog" aria-label="Kochmodus-Platzhalter">
      {recipe.title} für {servings}
      <button type="button" onClick={onClose}>
        Kochmodus schließen
      </button>
    </div>
  ),
}));

// Das Einreichformular hat eigene Tests (RecipeSubmissionForm.test.tsx)
vi.mock("./RecipeSubmissionForm", () => ({
  RecipeSubmissionForm: ({ onClose }: { onClose: () => void }) => (
    <div role="form" aria-label="Formular-Platzhalter">
      <button type="button" onClick={onClose}>
        Formular schließen
      </button>
    </div>
  ),
}));

const { RecipesView } = await import("./RecipesView");

function recipe(id: string, title: string, extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title,
    status: "approved",
    mealType: ["lunch"],
    dietTags: ["veg"],
    containsTags: [],
    servings: 2,
    ingredients: [{ name: "Reis", amount: 100, unit: "g", category: "Getreide" }],
    instructions: null,
    nutrition: { kcal: 520, protein: 24, carbs: 70, fat: 12 },
    imageUrl: null,
    externalId: null,
    ...extra,
  } as unknown as Recipe;
}

const LONG_TITLE = "Außergewöhnlich ausführlich benanntes Ofengemüse mit gerösteten Kichererbsen und Zitronen-Tahini-Sauce";

function setPool() {
  mockRecipes = [
    recipe("a", "Haferbrei mit Beeren", { mealType: ["breakfast"], dietTags: ["veg", "vegan"], containsTags: ["gluten"] }),
    recipe("b", "Hähnchen mit Reis", { dietTags: ["omnivor"], mealType: ["dinner"] }),
    recipe("c", "Smoothie", { mealType: ["snack"], dietTags: ["vegan", "glutenfrei"] }),
    recipe("d", LONG_TITLE),
  ];
}

function renderView() {
  return render(
    <MemoryRouter>
      <RecipesView todayISO={TODAY} />
    </MemoryRouter>,
  );
}

const inDialog = (label: string) => within(screen.getByRole("dialog")).getByLabelText(label);
const cardCount = () => within(screen.getByRole("list", { name: "Rezepte" })).getAllByRole("listitem").length;

beforeEach(() => {
  mockRecipes = [];
  mockState = { isLoading: false, isError: false };
  mockIntolerances = [];
  mockEntries = [];
  refetchMock.mockReset();
  upsertMock.mockReset();
  upsertMock.mockResolvedValue({ ok: true, entry: {} });
  setPool();
});
afterEach(cleanup);

describe("RecipesView — Einreichen", () => {
  it("'Rezept einreichen' öffnet das Formular anstelle der Liste, Schließen bringt die Liste zurück", () => {
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Rezept einreichen" }));
    expect(screen.getByRole("form", { name: "Formular-Platzhalter" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Rezepte" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Formular schließen" }));
    expect(screen.getByRole("list", { name: "Rezepte" })).toBeTruthy();
  });

  it("der Einstieg ins Formular fehlt auch bei leerer Bibliothek oder Ladefehler nicht", () => {
    mockRecipes = [];
    renderView();
    expect(screen.getByRole("button", { name: "Rezept einreichen" })).toBeTruthy();
    cleanup();
    mockRecipes = [];
    mockState = { isLoading: false, isError: true };
    renderView();
    expect(screen.getByRole("button", { name: "Rezept einreichen" })).toBeTruthy();
  });
});

describe("RecipesView — Liste", () => {
  it("zeigt je Rezept einen Bild-Platzhalter, Mahlzeit, kcal und Eiweiß pro Portion", () => {
    renderView();
    expect(screen.getAllByTestId("recipe-image-placeholder")).toHaveLength(4);
    expect(screen.getAllByText("520 kcal · 24 g Eiweiß pro Portion")).toHaveLength(4);
    expect(within(screen.getByRole("list", { name: "Rezepte" })).getByText("Frühstück")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("4 Rezepte");
  });

  it("sehr langer Titel: voller Titel bleibt als Tooltip erhalten", () => {
    renderView();
    expect(screen.getByTitle(LONG_TITLE)).toBeTruthy();
  });

  it("Rezept ohne Nährwerte und ohne Zutaten: 'Keine Nährwerte', 'In den Plan' gesperrt, Details zeigen den Hinweis", () => {
    mockRecipes = [recipe("x", "Nackt", { nutrition: null, ingredients: null })];
    renderView();
    expect(screen.getByText("Keine Nährwerte")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Nackt: Aktionen" }));
    expect((screen.getByRole("menuitem", { name: "In den Plan" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    fireEvent.click(screen.getByTitle("Nackt"));
    expect(screen.getByText("Keine Nährwertangaben und keine Zutaten hinterlegt")).toBeTruthy();
    expect((screen.getByRole("button", { name: "In den Plan" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Ohne Nährwerte lässt sich das Rezept nicht planen.")).toBeTruthy();
  });
});

describe("RecipesView — Zustände", () => {
  it("Laden", () => {
    mockState = { isLoading: true, isError: false };
    renderView();
    expect(screen.getByText("Lade …")).toBeTruthy();
  });

  it("Fehler beim Laden: sichtbare Meldung (nicht 'keine Rezepte') und 'Erneut versuchen'", () => {
    mockRecipes = [];
    mockState = { isLoading: false, isError: true };
    renderView();
    expect(screen.getByRole("alert").textContent).toContain("konnten nicht geladen werden");
    expect(screen.queryByText("Noch keine Rezepte vorhanden.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("keine Rezepte vorhanden", () => {
    mockRecipes = [];
    renderView();
    expect(screen.getByText("Noch keine Rezepte vorhanden.")).toBeTruthy();
  });

  it("Filter ohne Treffer: 'Kein Rezept passt' mit Weg zurück", () => {
    renderView();
    fireEvent.change(screen.getByRole("searchbox", { name: "Rezept suchen" }), { target: { value: "xyz" } });
    expect(screen.getByRole("heading", { name: "Kein Rezept passt" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Filter zurücksetzen" })[0]);
    expect(screen.queryByText("Kein Rezept passt")).toBeNull();
    expect(cardCount()).toBe(4);
  });

  it("Unverträglichkeiten blenden ein Rezept aus und sagen es", () => {
    mockIntolerances = ["gluten"];
    renderView();
    expect(screen.queryByText("Haferbrei mit Beeren")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("3 Rezepte · 1 wegen deiner Unverträglichkeiten ausgeblendet");
  });

  it("Unverträglichkeiten blenden alles aus: eigene Meldung mit Weg zu den Einstellungen", () => {
    mockIntolerances = ["gluten"];
    mockRecipes = [recipe("a", "Brot", { containsTags: ["gluten"] })];
    renderView();
    expect(screen.getByText(/Deine Unverträglichkeiten blenden alle 1 Rezept aus/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.queryByText("Kein Rezept passt")).toBeNull();
  });
});

describe("RecipesView — Suche und Filter", () => {
  it("Suche nach Titel, ohne Umlaut-Zwang", () => {
    renderView();
    fireEvent.change(screen.getByRole("searchbox", { name: "Rezept suchen" }), { target: { value: "hahnchen" } });
    expect(cardCount()).toBe(1);
    expect(screen.getByText("Hähnchen mit Reis")).toBeTruthy();
  });

  it("Mahlzeit-Chip und Ernährungsform filtern; 'Filter zurücksetzen' erscheint nur bei aktivem Filter", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "Filter zurücksetzen" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Snack" }));
    expect(screen.getByRole("button", { name: "Snack" }).getAttribute("aria-pressed")).toBe("true");
    expect(cardCount()).toBe(1);

    fireEvent.change(screen.getByRole("combobox", { name: "Ernährungsform" }), { target: { value: "omnivor" } });
    expect(screen.getByRole("heading", { name: "Kein Rezept passt" })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "Filter zurücksetzen" })[0]);
    expect(cardCount()).toBe(4);
    expect(screen.getByRole("button", { name: "Alle" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("RecipesView — Details, Kochen, In den Plan", () => {
  it("Klick auf die Kachel öffnet die Details (Zutaten, Allergen-Zeile)", () => {
    mockRecipes = [recipe("a", "Haferbrei", { containsTags: ["gluten"] })];
    renderView();
    fireEvent.click(screen.getByTitle("Haferbrei"));
    const dialog = screen.getByRole("dialog", { name: "Details: Haferbrei" });
    expect(within(dialog).getByText("Rezept für 2 Portionen")).toBeTruthy();
    expect(within(dialog).getByText(/Reis/)).toBeTruthy();
    expect(within(dialog).getByText(/Enthält/)).toBeTruthy();
  });

  it("Kochen aus den Details öffnet den Kochmodus ohne etwas zu speichern", () => {
    mockRecipes = [recipe("a", "Haferbrei")];
    renderView();
    fireEvent.click(screen.getByTitle("Haferbrei"));
    fireEvent.click(screen.getByRole("button", { name: "Kochen" }));
    expect(screen.getByRole("dialog", { name: "Kochmodus-Platzhalter" }).textContent).toContain("Haferbrei für 2");
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("Kochen aus dem Kachel-Menü funktioniert ebenfalls ohne Schreiben", () => {
    mockRecipes = [recipe("a", "Haferbrei")];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei: Aktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Kochen" }));
    expect(screen.getByRole("dialog", { name: "Kochmodus-Platzhalter" })).toBeTruthy();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("In den Plan (Erfolg): Tag und Mahlzeit wählen, Upsert mit Rezept + Portion, Bestätigung, Blatt schließt", async () => {
    mockRecipes = [recipe("a", "Haferbrei", { mealType: ["breakfast"] })];
    renderView();
    fireEvent.click(screen.getByTitle("Haferbrei"));
    fireEvent.click(screen.getByRole("button", { name: "In den Plan" }));

    // Vorbelegung: heute, Mahlzeit des Rezepts
    expect((inDialog("Mahlzeit") as HTMLSelectElement).value).toBe("breakfast");
    expect((inDialog("Tag") as HTMLSelectElement).value).toBe(TODAY);
    fireEvent.change(inDialog("Tag"), { target: { value: "2026-10-16" } });
    fireEvent.change(inDialog("Mahlzeit"), { target: { value: "dinner" } });
    fireEvent.change(inDialog("Portionen"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "In den Plan legen" }));

    await waitFor(() =>
      expect(upsertMock).toHaveBeenCalledWith({ date: "2026-10-16", mealSlot: "dinner", recipeId: "a", servings: 1.5 }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(/„Haferbrei“ liegt jetzt im Plan: Fr 16\.10\., Abendessen, 1,5 Portionen\./)).toBeTruthy();
  });

  it("In den Plan (Fehler): Meldung bleibt sichtbar, Blatt bleibt offen, nichts wird als gespeichert gemeldet", async () => {
    upsertMock.mockResolvedValue({ ok: false, error: { code: "HTTP", message: "RLS verweigert" } });
    mockRecipes = [recipe("a", "Haferbrei")];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei: Aktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "In den Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "In den Plan legen" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Speichern fehlgeschlagen: RLS verweigert");
    expect(screen.getByRole("dialog", { name: "Details: Haferbrei" })).toBeTruthy();
    expect(screen.queryByText(/liegt jetzt im Plan/)).toBeNull();
  });

  it("In den Plan warnt vor dem Ersetzen eines belegten Slots", () => {
    mockRecipes = [recipe("a", "Haferbrei", { mealType: ["breakfast"] }), recipe("b", "Rührei")];
    mockEntries = [
      { id: "e1", athleteId: "u1", date: TODAY, mealSlot: "breakfast", recipeId: "b", servings: 1 } as MealPlanEntry,
    ];
    renderView();
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei: Aktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "In den Plan" }));
    expect(screen.getByText("Dort liegt schon „Rührei“. Das Rezept wird ersetzt.")).toBeTruthy();
  });

  it("Abbrechen schließt nur den Wähler, das Blatt bleibt", () => {
    mockRecipes = [recipe("a", "Haferbrei")];
    renderView();
    fireEvent.click(screen.getByTitle("Haferbrei"));
    fireEvent.click(screen.getByRole("button", { name: "In den Plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("region", { name: "In den Plan legen" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Details: Haferbrei" })).toBeTruthy();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
