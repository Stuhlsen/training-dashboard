/* Tests: RecipeRating — Anzeige, Bedienung per Sternknöpfe, Ändern, Zurücknehmen,
 * Sperren (eigenes / nicht freigegebenes Rezept), Fehlermeldung. Hooks gemockt;
 * die Regeln selbst testet core/recipe-rating.test.js. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

let mockUserId: string | null = "u1";
let mockMine = new Map<string, number>();
const rateMock = vi.fn();
const unrateMock = vi.fn();
let mockMineFailed = false;

vi.mock("../../api/hooks/useSession", () => ({ useAuthUserId: () => mockUserId }));
vi.mock("../../api/hooks/useRecipeRatings", () => ({
  useMyRatings: () => ({ mine: mockMine, isLoading: false, isError: mockMineFailed }),
  useRateRecipe: () => ({ rate: rateMock, unrate: unrateMock, isPending: false }),
}));

const { RecipeRating } = await import("./RecipeRating");

function recipe(extra: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Haferbrei",
    status: "approved",
    submittedBy: "u-other",
    ratingAvg: 4.3,
    ratingCount: 7,
    ...extra,
  } as unknown as Recipe;
}

beforeEach(() => {
  mockUserId = "u1";
  mockMine = new Map();
  mockMineFailed = false;
  rateMock.mockReset();
  unrateMock.mockReset();
  rateMock.mockResolvedValue({ ok: true });
  unrateMock.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("RecipeRating — Anzeige", () => {
  it("zeigt Schnitt und Anzahl", () => {
    render(<RecipeRating recipe={recipe()} />);
    expect(screen.getByText("4,3 ★ (7)")).toBeTruthy();
  });

  it("zeigt ohne Bewertung 'noch nicht bewertet'", () => {
    render(<RecipeRating recipe={recipe({ ratingAvg: null, ratingCount: 0 })} />);
    expect(screen.getByText("noch nicht bewertet")).toBeTruthy();
  });

  it("bietet fünf Sternknöpfe mit Klartext-Namen in einer benannten Gruppe an", () => {
    render(<RecipeRating recipe={recipe()} />);
    const group = screen.getByRole("group", { name: "Deine Bewertung" });
    expect(group).toBeTruthy();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(screen.getByRole("button", { name: `${n} von 5 Sternen` })).toBeTruthy();
    }
  });

  it("markiert die eigene Wahl per aria-pressed und nennt sie im Text", () => {
    mockMine = new Map([["r1", 4]]);
    render(<RecipeRating recipe={recipe()} />);
    expect(screen.getByRole("button", { name: "4 von 5 Sternen" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "3 von 5 Sternen" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/Deine Bewertung: 4 von 5 Sternen/)).toBeTruthy();
  });
});

describe("RecipeRating — Bedienung", () => {
  it("ein Klick auf einen Stern bewertet das Rezept", async () => {
    render(<RecipeRating recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: "5 von 5 Sternen" }));
    await waitFor(() => expect(rateMock).toHaveBeenCalledWith("r1", 5));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("die Sterne sind echte Knöpfe (Tastatur: Tab, Enter, Leertaste)", () => {
    render(<RecipeRating recipe={recipe()} />);
    const star = screen.getByRole("button", { name: "2 von 5 Sternen" });
    expect(star.tagName).toBe("BUTTON");
    expect(star.getAttribute("type")).toBe("button");
    expect(star.hasAttribute("disabled")).toBe(false);
  });

  it("eine bestehende Bewertung lässt sich ändern", async () => {
    mockMine = new Map([["r1", 2]]);
    render(<RecipeRating recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: "5 von 5 Sternen" }));
    await waitFor(() => expect(rateMock).toHaveBeenCalledWith("r1", 5));
  });

  it("'Bewertung zurücknehmen' löscht sie; ohne Bewertung gibt es den Knopf nicht", async () => {
    render(<RecipeRating recipe={recipe()} />);
    expect(screen.queryByRole("button", { name: "Bewertung zurücknehmen" })).toBeNull();
    cleanup();
    mockMine = new Map([["r1", 3]]);
    render(<RecipeRating recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bewertung zurücknehmen" }));
    await waitFor(() => expect(unrateMock).toHaveBeenCalledWith("r1"));
  });

  it("zeigt eine Fehlermeldung, wenn das Speichern scheitert, und räumt sie beim nächsten Versuch ab", async () => {
    rateMock.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "x" } });
    render(<RecipeRating recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: "1 von 5 Sternen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/konnte nicht gespeichert werden/);
    fireEvent.click(screen.getByRole("button", { name: "1 von 5 Sternen" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("sperrt die Knöpfe nie (ein gesperrter Knopf verliert den Fokus), fängt aber Doppelklicks ab", async () => {
    let finish: (v: { ok: true }) => void = () => {};
    rateMock.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    render(<RecipeRating recipe={recipe()} />);
    const star = screen.getByRole("button", { name: "3 von 5 Sternen" });
    star.focus();
    fireEvent.click(star);
    fireEvent.click(star);
    expect(star.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(star);
    expect(rateMock).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    // Nach Abschluss ist der nächste Klick wieder erlaubt
    await waitFor(() => {
      fireEvent.click(star);
      expect(rateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("nach dem Zurücknehmen wandert der Fokus auf den ersten Stern (der Knopf verschwindet)", async () => {
    mockMine = new Map([["r1", 3]]);
    render(<RecipeRating recipe={recipe()} />);
    fireEvent.click(screen.getByRole("button", { name: "Bewertung zurücknehmen" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "1 von 5 Sternen" })));
  });

  it("sagt Bescheid, wenn die eigene Bewertung nicht geladen werden konnte, und bietet die Sterne weiter an", () => {
    mockMineFailed = true;
    render(<RecipeRating recipe={recipe()} />);
    expect(screen.getByRole("status").textContent).toMatch(/nicht geladen werden/);
    expect(screen.getByRole("button", { name: "2 von 5 Sternen" })).toBeTruthy();
  });
});

describe("RecipeRating — Sperren", () => {
  it("das eigene Rezept: Schnitt sichtbar, keine Sterne, klarer Hinweis", () => {
    render(<RecipeRating recipe={recipe({ submittedBy: "u1" })} />);
    expect(screen.getByText("4,3 ★ (7)")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Deine Bewertung" })).toBeNull();
    expect(screen.getByText("Dein eigenes Rezept kannst du nicht bewerten.")).toBeTruthy();
  });

  it("ein nicht freigegebenes Rezept: keine Sterne", () => {
    render(<RecipeRating recipe={recipe({ status: "pending" })} />);
    expect(screen.queryByRole("group", { name: "Deine Bewertung" })).toBeNull();
  });

  it("ohne Anmeldung: keine Sterne, kein Eigen-Hinweis", () => {
    mockUserId = null;
    render(<RecipeRating recipe={recipe({ submittedBy: null })} />);
    expect(screen.queryByRole("group", { name: "Deine Bewertung" })).toBeNull();
    expect(screen.queryByText(/eigenes Rezept/)).toBeNull();
  });
});
