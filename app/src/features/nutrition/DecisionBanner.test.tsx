/* Tests: DecisionBanner (Fahrplan 25, S2b) — Hinweis bei neu entschiedenen eigenen
 * Rezepten, einmalig je Status, je Nutzer getrennt, robust ohne localStorage. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";

let mockRecipes: Recipe[] = [];

vi.mock("../../api/hooks/useMySubmissions", () => ({
  useMySubmissions: () => ({ recipes: mockRecipes, isLoading: false, isError: false, refetch: vi.fn() }),
}));

const { DecisionBanner } = await import("./DecisionBanner");

function recipe(id: string, title: string, status: Recipe["status"], rejectionReason: string | null = null): Recipe {
  return { id, title, status, rejectionReason } as unknown as Recipe;
}

beforeEach(() => {
  localStorage.clear();
  mockRecipes = [];
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DecisionBanner", () => {
  it("zeigt nichts, solange alle Rezepte offen sind", () => {
    mockRecipes = [recipe("a", "Haferbrei", "pending")];
    const { container } = render(<DecisionBanner userId="u1" />);
    expect(container.textContent).toBe("");
  });

  it("meldet eine Freigabe", () => {
    mockRecipes = [recipe("a", "Haferbrei", "approved")];
    render(<DecisionBanner userId="u1" />);
    expect(screen.getByText("„Haferbrei“ wurde freigegeben und ist jetzt für alle sichtbar.")).toBeTruthy();
  });

  it("meldet eine Ablehnung mit Grund, ohne Grund ohne 'Grund:'", () => {
    mockRecipes = [recipe("a", "Haferbrei", "rejected", "Zutaten unklar"), recipe("b", "Salat", "rejected")];
    render(<DecisionBanner userId="u1" />);
    expect(screen.getByText("„Haferbrei“ wurde abgelehnt. Grund: Zutaten unklar")).toBeTruthy();
    expect(screen.getByText("„Salat“ wurde abgelehnt.")).toBeTruthy();
  });

  it("'Verstanden' versteckt den Hinweis dauerhaft (auch nach Neuaufbau)", () => {
    mockRecipes = [recipe("a", "Haferbrei", "approved")];
    const { unmount } = render(<DecisionBanner userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    expect(screen.queryByText(/freigegeben/)).toBeNull();
    expect(JSON.parse(localStorage.getItem("recipe-decisions-seen:u1")!)).toEqual({ a: "approved" });
    unmount();
    const { container } = render(<DecisionBanner userId="u1" />);
    expect(container.textContent).toBe("");
  });

  it("zeigt eine spätere Entscheidung zum selben Rezept erneut", () => {
    localStorage.setItem("recipe-decisions-seen:u1", JSON.stringify({ a: "pending" }));
    mockRecipes = [recipe("a", "Haferbrei", "approved")];
    render(<DecisionBanner userId="u1" />);
    expect(screen.getByText(/freigegeben/)).toBeTruthy();
  });

  it("merkt sich je Nutzer getrennt", () => {
    mockRecipes = [recipe("a", "Haferbrei", "approved")];
    const { unmount } = render(<DecisionBanner userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    unmount();
    render(<DecisionBanner userId="u2" />);
    expect(screen.getByText(/freigegeben/)).toBeTruthy();
  });

  it("bleibt bedienbar, wenn localStorage nicht verfügbar ist (Lesen und Schreiben werfen)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blockiert");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blockiert");
    });
    mockRecipes = [recipe("a", "Haferbrei", "approved")];
    render(<DecisionBanner userId="u1" />);
    expect(screen.getByText(/freigegeben/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Verstanden" }));
    expect(screen.queryByText(/freigegeben/)).toBeNull();
  });
});
