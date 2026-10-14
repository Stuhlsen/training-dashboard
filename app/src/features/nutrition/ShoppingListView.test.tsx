/* Tests: ShoppingListView — Liste aus Plan + Rezepten, Tage-Häkchen,
 * Abhaken bleibt nach dem Neuladen, Vorrat eingeklappt, Leerzustand,
 * Hinweis "Zutaten fehlen". Die Hooks (Essensplan, Rezepte) sind gemockt. */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlanEntry, Recipe } from "../../api/types";

const TODAY = "2026-10-14";
const TOMORROW = "2026-10-15";

let mockEntries: MealPlanEntry[] = [];
let mockRecipes: Recipe[] = [];
let mockLoading = false;

vi.mock("../../api/hooks/useMealPlan", () => ({
  useMealPlan: () => ({ entries: mockEntries, isLoading: mockLoading }),
}));
vi.mock("../../api/hooks/useRecipes", () => ({
  useRecipes: () => ({ recipes: mockRecipes, isLoading: false }),
}));

const { ShoppingListView } = await import("./ShoppingListView");

/* ── Fixtures (synthetisch) ───────────────────────────────── */

const recipe = (id: string, ingredients: Recipe["ingredients"], servings = 2): Recipe =>
  ({ id, title: `Rezept ${id}`, servings, ingredients }) as unknown as Recipe;

const entry = (date: string, recipeId: string, servings = 2): MealPlanEntry => ({
  id: `${date}-${recipeId}`,
  athleteId: "u1",
  date,
  mealSlot: "lunch",
  recipeId,
  servings,
  createdAt: "",
  updatedAt: "",
});

const APFEL = { name: "Apfel", amount: 2, unit: "Stück", category: "Obst & Gemüse" };
const BIRNE = { name: "Birne", amount: 1, unit: "Stück", category: "Obst & Gemüse" };
const SALZ = { name: "Salz", amount: 1, unit: "Prise", category: "Öle, Gewürze & Vorrat" };
const HONIG_TL = { name: "Honig", amount: 1, unit: "TL", category: "Obst & Gemüse" };
const HONIG_EL = { name: "Honig", amount: 1, unit: "EL", category: "Obst & Gemüse" };

function setData(entries: MealPlanEntry[], recipes: Recipe[]) {
  mockEntries = entries;
  mockRecipes = recipes;
}

const onShowWeek = vi.fn();
const renderList = () => render(<ShoppingListView userId="u1" todayISO={TODAY} onShowWeek={onShowWeek} />);

beforeEach(() => {
  localStorage.clear();
  onShowWeek.mockClear();
  mockLoading = false;
  setData([], []);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShoppingListView — Inhalt", () => {
  it("zeigt Zutaten mit Dezimalkomma und Kategorie-Überschrift", () => {
    // Rezept für 2, gegessen 1,5 → Faktor 0,75: 2 Stück Apfel → 1,5
    setData([entry(TODAY, "a", 1.5)], [recipe("a", [APFEL])]);
    renderList();
    expect(screen.getByRole("heading", { name: "Obst & Gemüse" })).toBeTruthy();
    expect(screen.getByText("Apfel")).toBeTruthy();
    expect(screen.getByText("1,5 Stück")).toBeTruthy();
  });

  it("gleiche Zutat mit mehreren Einheiten: eine Zeile, '1 EL + 1 TL'", () => {
    setData([entry(TODAY, "a")], [recipe("a", [HONIG_TL, HONIG_EL])]);
    renderList();
    expect(screen.getAllByText("Honig")).toHaveLength(1);
    expect(screen.getByText("1 EL + 1 TL")).toBeTruthy();
  });

  it("Tooltip der Zeile nennt die Rezepte", () => {
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    renderList();
    expect(screen.getByTitle("Rezept a")).toBeTruthy();
  });
});

describe("ShoppingListView — Tage", () => {
  beforeEach(() => {
    setData([entry(TODAY, "a"), entry(TOMORROW, "b")], [recipe("a", [APFEL]), recipe("b", [BIRNE])]);
  });

  it("Standard: alle Tage mit Einträgen angehakt, Tage ohne Eintrag deaktiviert", () => {
    renderList();
    const days = within(screen.getByRole("group", { name: "Tage in der Liste" }));
    expect((days.getByLabelText(/14\.10/) as HTMLInputElement).checked).toBe(true);
    expect((days.getByLabelText(/15\.10/) as HTMLInputElement).checked).toBe(true);
    const empty = days.getByLabelText(/16\.10/) as HTMLInputElement;
    expect(empty.checked).toBe(false);
    expect(empty.disabled).toBe(true);
  });

  it("Tag abwählen nimmt dessen Zutaten aus der Liste", () => {
    renderList();
    expect(screen.getByText("Birne")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/15\.10/));
    expect(screen.queryByText("Birne")).toBeNull();
    expect(screen.getByText("Apfel")).toBeTruthy();
  });

  it("alle Tage abgewählt: freundlicher Hinweis statt leerer Seite", () => {
    renderList();
    fireEvent.click(screen.getByLabelText(/14\.10/));
    fireEvent.click(screen.getByLabelText(/15\.10/));
    expect(screen.getByText("Wähle mindestens einen Tag aus, um die Liste zu füllen.")).toBeTruthy();
  });
});

describe("ShoppingListView — Abhaken", () => {
  it("bleibt nach dem Neuladen erhalten (neu gemountet, gleicher Nutzer)", () => {
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    const first = renderList();
    const box = screen.getByLabelText(/Apfel/) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect((screen.getByLabelText(/Apfel/) as HTMLInputElement).checked).toBe(true);

    first.unmount();
    renderList();
    expect((screen.getByLabelText(/Apfel/) as HTMLInputElement).checked).toBe(true);
  });

  it("gilt je Nutzer: anderer Nutzer sieht nichts abgehakt", () => {
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    const first = renderList();
    fireEvent.click(screen.getByLabelText(/Apfel/));
    first.unmount();
    render(<ShoppingListView userId="u2" todayISO={TODAY} onShowWeek={onShowWeek} />);
    expect((screen.getByLabelText(/Apfel/) as HTMLInputElement).checked).toBe(false);
  });

  it("räumt beim Speichern Schlüssel auf, die nicht mehr in der Liste stehen", () => {
    localStorage.setItem("shopping-checked:u1", JSON.stringify(["obst & gemüse|alt|stück"]));
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    renderList();
    fireEvent.click(screen.getByLabelText(/Apfel/));
    expect(JSON.parse(localStorage.getItem("shopping-checked:u1") ?? "[]")).toEqual(["obst & gemüse|apfel|stück"]);
  });

  it("'Haken zurücksetzen' erscheint nur bei Haken und leert Anzeige und Speicher", () => {
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    renderList();
    expect(screen.queryByRole("button", { name: "Haken zurücksetzen" })).toBeNull();

    fireEvent.click(screen.getByLabelText(/Apfel/));
    fireEvent.click(screen.getByRole("button", { name: "Haken zurücksetzen" }));

    expect((screen.getByLabelText(/Apfel/) as HTMLInputElement).checked).toBe(false);
    expect(JSON.parse(localStorage.getItem("shopping-checked:u1") ?? "null")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Haken zurücksetzen" })).toBeNull();
  });

  it("kaputter Speicherinhalt bricht nichts: alles ungehakt", () => {
    localStorage.setItem("shopping-checked:u1", "{kein json");
    setData([entry(TODAY, "a")], [recipe("a", [APFEL])]);
    renderList();
    expect((screen.getByLabelText(/Apfel/) as HTMLInputElement).checked).toBe(false);
  });
});

describe("ShoppingListView — Vorrat, Lücken, Leerzustand", () => {
  it("Vorrat prüfen ist standardmäßig eingeklappt und zählt seine Zeilen", () => {
    setData([entry(TODAY, "a")], [recipe("a", [APFEL, SALZ])]);
    renderList();
    const summary = screen.getByText(/Vorrat prüfen/);
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(summary.textContent).toContain("(1)");
  });

  it("Rezepte ohne Zutaten: dezenter Hinweis 'Zutaten fehlen bei …'", () => {
    setData(
      [entry(TODAY, "a"), entry(TOMORROW, "n")],
      [recipe("a", [APFEL]), { ...recipe("n", null), title: "Ohne Zutaten" } as Recipe],
    );
    renderList();
    expect(screen.getByText("Zutaten fehlen bei Ohne Zutaten")).toBeTruthy();
    expect(screen.getByText("Apfel")).toBeTruthy();
  });

  it("leere Woche: Leerzustand mit Verweis zurück auf die Woche", () => {
    renderList();
    expect(screen.getByText(/noch nichts geplant/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Zur Woche" }));
    expect(onShowWeek).toHaveBeenCalledTimes(1);
  });

  it("solange geladen wird: Lade-Anzeige", () => {
    mockLoading = true;
    renderList();
    expect(screen.getByText("Lade …")).toBeTruthy();
  });
});
