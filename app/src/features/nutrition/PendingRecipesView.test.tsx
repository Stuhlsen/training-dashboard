/* Tests: PendingRecipesView — Liste der Rezepte in Prüfung, Blatt mit Inhalt und Daumen,
 * Prüfung nur für den Admin, Zustände (laden, Fehler, leer). Hooks gemockt. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

let mockUserId: string | null = "u1";
let mockIsAdmin = false;
let mockState: {
  recipes: Recipe[];
  isLoading: boolean;
  isError: boolean;
  statsFailed: boolean;
};
const refetchMock = vi.fn();
const approveMock = vi.fn();
const rejectMock = vi.fn();

vi.mock("../../api/hooks/useSession", () => ({ useAuthUserId: () => mockUserId, useIsAdmin: () => mockIsAdmin }));
vi.mock("../../api/hooks/useRecipeVotes", () => ({
  usePendingRecipes: () => ({ ...mockState, refetch: refetchMock }),
  useMyVotes: () => ({ mine: new Map(), isLoading: false, isError: false }),
  useVoteRecipe: () => ({ vote: vi.fn().mockResolvedValue({ ok: true }), isPending: false }),
}));
vi.mock("../../api/hooks/useRecipeReview", () => ({
  useDecideRecipe: () => ({ approve: approveMock, reject: rejectMock, isPending: false }),
}));

// Die Kommentare im Blatt haben eigene Tests (RecipeComments.test.tsx)
vi.mock("./RecipeComments", () => ({
  RecipeComments: ({ recipe }: { recipe: { id: string } }) => (
    <div data-testid="comments-slot">Kommentare für {recipe.id}</div>
  ),
}));

const { PendingRecipesView } = await import("./PendingRecipesView");

function recipe(id: string, title: string, extra: Partial<Recipe> = {}): Recipe {
  return {
    id,
    title,
    status: "pending",
    submittedBy: "u-other",
    mealType: ["dinner"],
    servings: 2,
    prepMinutes: 20,
    nutrition: { kcal: 520, protein: 31, carbs: 60, fat: 14 },
    ingredients: [{ name: "Haferflocken", amount: 80, unit: "g" }],
    instructions: [{ text: "Flocken kochen" }, { text: "Ziehen lassen", timerSeconds: 300 }],
    containsTags: [],
    imageUrl: null,
    voteUp: 3,
    voteDown: 1,
    ...extra,
  } as unknown as Recipe;
}

beforeEach(() => {
  mockUserId = "u1";
  mockIsAdmin = false;
  mockState = {
    recipes: [recipe("r1", "Haferbrei"), recipe("r2", "Nudelsalat", { voteUp: 0, voteDown: 0 })],
    isLoading: false,
    isError: false,
    statsFailed: false,
  };
  refetchMock.mockReset();
  approveMock.mockReset();
  rejectMock.mockReset();
  approveMock.mockResolvedValue({ ok: true });
  rejectMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("PendingRecipesView — Liste", () => {
  it("zeigt jedes Rezept in Prüfung mit den Zahlen als Text", () => {
    render(<PendingRecipesView />);
    expect(screen.getByRole("heading", { name: "Haferbrei" })).toBeTruthy();
    expect(screen.getByText(/3 dafür · 1 dagegen/)).toBeTruthy();
    expect(screen.getByText(/noch keine Daumen/)).toBeTruthy();
    expect(screen.getByText(/Dein Daumen ist nur eine Meinung/)).toBeTruthy();
  });

  it("markiert das eigene Rezept", () => {
    mockState.recipes = [recipe("r1", "Haferbrei", { submittedBy: "u1" })];
    render(<PendingRecipesView />);
    expect(screen.getByText(/Dein Rezept/)).toBeTruthy();
  });

  it("zeigt nie, wer ein Rezept eingereicht hat", () => {
    mockState.recipes = [recipe("r1", "Haferbrei", { submittedBy: "u-author-secret" })];
    const { container } = render(<PendingRecipesView />);
    expect(container.textContent).not.toMatch(/u-author-secret/);
  });

  it("lädt: zeigt 'Lade …'", () => {
    mockState = { ...mockState, recipes: [], isLoading: true };
    render(<PendingRecipesView />);
    expect(screen.getByText("Lade …")).toBeTruthy();
  });

  it("Ladefehler: Meldung und 'Erneut versuchen'", () => {
    mockState = { ...mockState, recipes: [], isError: true };
    render(<PendingRecipesView />);
    expect(screen.getByRole("alert").textContent).toMatch(/konnten nicht geladen werden/);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("leer: sagt, dass nichts auf Prüfung wartet", () => {
    mockState = { ...mockState, recipes: [] };
    render(<PendingRecipesView />);
    expect(screen.getByText(/kein Rezept auf die Prüfung/)).toBeTruthy();
  });

  it("sagt Bescheid, wenn die Zahlen nicht geladen werden konnten, und zeigt die Rezepte trotzdem", () => {
    mockState.statsFailed = true;
    render(<PendingRecipesView />);
    expect(screen.getByRole("status").textContent).toMatch(/Daumen-Zahlen konnten nicht geladen werden/);
    expect(screen.getByRole("heading", { name: "Haferbrei" })).toBeTruthy();
  });
});

describe("PendingRecipesView — Blatt", () => {
  it("öffnet Inhalt, Schritte, Nährwerte und Daumen; Kochen und Plan gibt es nicht", () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei ansehen" }));
    const dialog = screen.getByRole("dialog", { name: "Details: Haferbrei" });
    expect(dialog.textContent).toMatch(/Haferflocken/);
    expect(dialog.textContent).toMatch(/520 kcal/);
    expect(dialog.textContent).toMatch(/Zubereitung/);
    expect(dialog.textContent).toMatch(/Flocken kochen/);
    expect(dialog.textContent).toMatch(/Ziehen lassen \(5 min\)/);
    expect(screen.getByRole("group", { name: "Dein Daumen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kochen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "In den Plan" })).toBeNull();
  });

  it("ein Athlet sieht keine Prüfung (kein Freigeben, kein Ablehnen)", () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei ansehen" }));
    expect(screen.queryByRole("button", { name: "Freigeben" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ablehnen …" })).toBeNull();
  });

  it("'Schließen' schließt das Blatt", () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei ansehen" }));
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ein Rezept ohne Schritte sagt das, statt eine leere Liste zu zeigen", () => {
    mockState.recipes = [recipe("r1", "Haferbrei", { instructions: [] })];
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei ansehen" }));
    expect(screen.getByText("Keine Schritte hinterlegt")).toBeTruthy();
  });
});

describe("PendingRecipesView — Admin", () => {
  beforeEach(() => {
    mockIsAdmin = true;
  });

  it("der Knopf heißt 'Prüfen' und das Blatt zeigt Freigeben und Ablehnen", () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei prüfen" }));
    expect(screen.getByRole("button", { name: "Freigeben" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ablehnen …" })).toBeTruthy();
    // Inhalt, Nährwerte und Daumen-Zahlen stehen im selben Blatt
    expect(screen.getByRole("dialog").textContent).toMatch(/520 kcal/);
    expect(screen.getByRole("dialog").textContent).toMatch(/3 dafür · 1 dagegen/);
  });

  it("nach dem Freigeben schließt das Blatt und eine Meldung nennt das Ergebnis", async () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei prüfen" }));
    fireEvent.click(screen.getByRole("button", { name: "Freigeben" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(approveMock).toHaveBeenCalledWith("r1");
    expect(screen.getByRole("status").textContent).toMatch(/„Haferbrei“ ist jetzt für alle freigegeben/);
  });

  it("nach dem Ablehnen schließt das Blatt und die Meldung sagt, wo der Autor den Grund liest", async () => {
    render(<PendingRecipesView />);
    fireEvent.click(screen.getByRole("button", { name: "Haferbrei prüfen" }));
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen …" }));
    fireEvent.change(screen.getByLabelText("Grund der Ablehnung"), { target: { value: "Zutaten unklar" } });
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(rejectMock).toHaveBeenCalledWith("r1", "Zutaten unklar");
    expect(screen.getByRole("status").textContent).toMatch(/abgelehnt.*Meine Einreichungen/);
  });
});
