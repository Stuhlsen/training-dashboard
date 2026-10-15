/* Tests: RecipeDetailsDialog — Rolle/Name, Fokus, Escape, Hintergrund-Klick,
 * Tab-Falle, Kochen, Bild-Platzhalter. DetailsContent wird über WeekView.test
 * (Zutaten, Nährwerte, Allergen-Zeile) mitgeprüft. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "../../api/types";
import { RecipeDetailsDialog } from "./RecipeDetails";

afterEach(cleanup);

const RECIPE = {
  id: "r1",
  title: "Haferbrei mit Beeren",
  servings: 2,
  containsTags: [],
  ingredients: [{ name: "Haferflocken", amount: 80, unit: "g", category: "Getreide" }],
  instructions: null,
  nutrition: { kcal: 500, protein: 25, carbs: 60, fat: 10 },
  imageUrl: null,
  externalId: null,
} as unknown as Recipe;

function setup() {
  const onClose = vi.fn();
  const onCook = vi.fn();
  const opener = document.createElement("button");
  opener.textContent = "Öffner";
  document.body.appendChild(opener);
  opener.focus();
  const view = render(<RecipeDetailsDialog recipe={RECIPE} servings={1} onClose={onClose} onCook={onCook} />);
  return { onClose, onCook, opener, view };
}

describe("RecipeDetailsDialog", () => {
  it("ist ein modaler Dialog mit dem Rezepttitel im Namen und zeigt Titel + Portionen", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Details: Haferbrei mit Beeren" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("heading", { name: "Haferbrei mit Beeren" })).toBeTruthy();
    expect(screen.getByText("1 Portion geplant")).toBeTruthy();
  });

  it("ohne Bild steht der Platzhalter da (kein kaputtes Bild)", () => {
    setup();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("Fokus startet im Blatt (Schließen) und kehrt beim Schließen zum Öffner zurück", () => {
    const { opener, view } = setup();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Schließen" }));
    view.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it("Escape und 'Schließen' schließen", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Klick auf den Hintergrund schließt, Klick ins Blatt nicht", () => {
    const { onClose } = setup();
    const dialog = screen.getByRole("dialog");
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'Kochen' ruft onCook", () => {
    const { onCook } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Kochen" }));
    expect(onCook).toHaveBeenCalledTimes(1);
  });

  it("Tab bleibt im Blatt: vom letzten Element zurück zum ersten und umgekehrt", () => {
    setup();
    const cook = screen.getByRole("button", { name: "Kochen" });
    const close = screen.getByRole("button", { name: "Schließen" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(document.activeElement).toBe(cook);
    fireEvent.keyDown(cook, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});
