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

  it("externalId ohne Manifest-Eintrag erzeugt kein Bild", () => {
    expect(recipeImageSource({ imageUrl: null, externalId: "own-haferbrei" })).toBeNull();
    expect(recipeImageSource({ imageUrl: null, externalId: "own-haferbrei" }, new Set(["own-anderes"]))).toBeNull();
  });

  it("externalId im Manifest: KI-Bild unter <baseUrl>recipe-images/<id>.webp", () => {
    const manifest = new Set(["own-haferbrei"]);
    expect(recipeImageSource({ imageUrl: null, externalId: "own-haferbrei" }, manifest)).toEqual({
      src: "/recipe-images/own-haferbrei.webp",
      ai: true,
    });
    expect(recipeImageSource({ externalId: "own-haferbrei" }, manifest, "/training-dashboard/")).toEqual({
      src: "/training-dashboard/recipe-images/own-haferbrei.webp",
      ai: true,
    });
  });

  it("Athleten-Foto hat Vorrang und trägt kein KI-Label", () => {
    const manifest = new Set(["own-haferbrei"]);
    expect(
      recipeImageSource({ imageUrl: "https://example.com/foto.webp", externalId: "own-haferbrei" }, manifest),
    ).toEqual({ src: "https://example.com/foto.webp", ai: false });
  });

  it("leere/fehlende externalId trifft nie das Manifest", () => {
    const manifest = new Set([""]);
    expect(recipeImageSource({ externalId: "" }, manifest)).toBeNull();
    expect(recipeImageSource({ externalId: null }, manifest)).toBeNull();
  });
});
