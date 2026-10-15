/* Tests: RecipeImage — Bild da / fehlt / Ladefehler, Label nur bei KI-Quelle.
 * Die Quellenauflösung ist gemockt: heute liefert core/recipe-image.js noch
 * kein KI-Bild (kommt mit F3), das Label-Verhalten soll aber schon stehen. */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockSource: { src: string; ai: boolean } | null = null;
vi.mock("../core/recipe-image.js", () => ({ recipeImageSource: () => mockSource }));

const { RecipeImage, AI_IMAGE_LABEL } = await import("./RecipeImage");

const RECIPE = { title: "Haferbrei mit Beeren", imageUrl: null, externalId: "own-haferbrei" };

beforeEach(() => {
  mockSource = null;
});
afterEach(cleanup);

describe("RecipeImage", () => {
  it("ohne Bild: Platzhalter, kein <img>, kein Label", () => {
    render(<RecipeImage recipe={RECIPE} />);
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(AI_IMAGE_LABEL)).toBeNull();
  });

  it("ohne Rezept: Platzhalter", () => {
    render(<RecipeImage recipe={null} />);
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
  });

  it("mit Bild: <img> mit Titel als alt; Platzhalter weicht nach dem Laden", () => {
    mockSource = { src: "/x.webp", ai: false };
    render(<RecipeImage recipe={RECIPE} />);
    const img = screen.getByAltText("Haferbrei mit Beeren");
    expect(img.getAttribute("src")).toBe("/x.webp");
    // bis zum Laden bleibt der Platzhalter stehen (kein Loch im Layout)
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
    fireEvent.load(img);
    expect(screen.queryByTestId("recipe-image-placeholder")).toBeNull();
  });

  it("Nicht-KI-Bild (z. B. Athleten-Foto): kein Label", () => {
    mockSource = { src: "/x.webp", ai: false };
    render(<RecipeImage recipe={RECIPE} />);
    fireEvent.load(screen.getByAltText("Haferbrei mit Beeren"));
    expect(screen.queryByText(AI_IMAGE_LABEL)).toBeNull();
  });

  it("KI-Bild: Label 'Serviervorschlag (KI-Bild)' erst, wenn das Bild zu sehen ist", () => {
    mockSource = { src: "/x.webp", ai: true };
    render(<RecipeImage recipe={RECIPE} />);
    expect(screen.queryByText(AI_IMAGE_LABEL)).toBeNull();
    fireEvent.load(screen.getByAltText("Haferbrei mit Beeren"));
    expect(screen.getByText("Serviervorschlag (KI-Bild)")).toBeTruthy();
  });

  it("Ladefehler: Platzhalter statt Bild, und kein KI-Label", () => {
    mockSource = { src: "/kaputt.webp", ai: true };
    render(<RecipeImage recipe={RECIPE} />);
    fireEvent.error(screen.getByAltText("Haferbrei mit Beeren"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByTestId("recipe-image-placeholder")).toBeTruthy();
    expect(screen.queryByText(AI_IMAGE_LABEL)).toBeNull();
  });

  it("neue Quelle setzt den Fehlerzustand zurück", () => {
    mockSource = { src: "/kaputt.webp", ai: false };
    const { rerender } = render(<RecipeImage recipe={RECIPE} />);
    fireEvent.error(screen.getByAltText("Haferbrei mit Beeren"));
    expect(screen.queryByRole("img")).toBeNull();

    mockSource = { src: "/ok.webp", ai: false };
    rerender(<RecipeImage recipe={RECIPE} />);
    expect(screen.getByAltText("Haferbrei mit Beeren").getAttribute("src")).toBe("/ok.webp");
  });

  it("alt lässt sich überschreiben; leer = dekorativ", () => {
    mockSource = { src: "/x.webp", ai: false };
    const { container } = render(<RecipeImage recipe={RECIPE} alt="" />);
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("hält das Seitenverhältnis über aspect-ratio (kein Layoutsprung)", () => {
    const { container } = render(<RecipeImage recipe={RECIPE} ratio="16 / 9" />);
    expect((container.firstChild as HTMLElement).style.aspectRatio).toBe("16 / 9");
  });
});
