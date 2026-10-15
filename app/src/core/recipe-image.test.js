import { describe, expect, it } from "vitest";
import { recipeImageSource } from "./recipe-image.js";

describe("recipeImageSource", () => {
  it("liefert die imageUrl als Nicht-KI-Bild", () => {
    expect(recipeImageSource({ imageUrl: "https://example.com/a.webp", externalId: null })).toEqual({
      src: "https://example.com/a.webp",
      ai: false,
    });
  });

  it("schneidet Leerraum ab", () => {
    expect(recipeImageSource({ imageUrl: "  /x.webp \n" })).toEqual({ src: "/x.webp", ai: false });
  });

  it("null ohne Bild: null, leer, nur Leerraum, kein Rezept", () => {
    expect(recipeImageSource({ imageUrl: null })).toBeNull();
    expect(recipeImageSource({ imageUrl: "" })).toBeNull();
    expect(recipeImageSource({ imageUrl: "   " })).toBeNull();
    expect(recipeImageSource({})).toBeNull();
    expect(recipeImageSource(null)).toBeNull();
    expect(recipeImageSource(undefined)).toBeNull();
  });

  it("externalId allein erzeugt noch kein Bild (KI-Manifest kommt mit F3)", () => {
    expect(recipeImageSource({ imageUrl: null, externalId: "own-haferbrei" })).toBeNull();
  });
});
