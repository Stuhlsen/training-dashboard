import { describe, expect, it } from "vitest";
import {
  buildSubmissionBody,
  fitWithin,
  openRecipesMessage,
  parseAmount,
  splitFieldErrors,
} from "./recipe-submission.js";

describe("parseAmount", () => {
  it("liest Komma und Punkt", () => {
    expect(parseAmount("1,5")).toBe(1.5);
    expect(parseAmount(" 2.25 ")).toBe(2.25);
    expect(parseAmount("100")).toBe(100);
  });
  it("lehnt leer, Text, 0 und negativ ab", () => {
    for (const bad of ["", "abc", "0", "-1", "1,2,3", "1e3"]) expect(parseAmount(bad)).toBeNull();
  });
});

describe("buildSubmissionBody", () => {
  const draft = {
    title: "  Haferbrei ",
    servings: "2",
    mealTypes: ["breakfast"],
    ingredients: [{ name: "Haferflocken", amount: "80,5", unit: "g" }],
    steps: [
      { text: " Kochen ", timerMinutes: "5" },
      { text: "   ", timerMinutes: "" },
      { text: "Servieren", timerMinutes: "" },
    ],
  };

  it("formt Menge, Timer (Minuten → Sekunden) und lässt leere Schritte weg", () => {
    expect(buildSubmissionBody(draft)).toEqual({
      title: "Haferbrei",
      meal_type: ["breakfast"],
      servings: 2,
      ingredients: [{ name: "Haferflocken", amount: 80.5, unit: "g" }],
      instructions: [{ text: "Kochen", timerSeconds: 300 }, { text: "Servieren" }],
    });
  });

  it("setzt image_url nur mit Pfad", () => {
    expect(buildSubmissionBody(draft)).not.toHaveProperty("image_url");
    expect(buildSubmissionBody(draft, "uid/a.webp")).toHaveProperty("image_url", "uid/a.webp");
  });

  it("gibt unlesbare Mengen als 0 weiter, damit der Server sie meldet", () => {
    const body = buildSubmissionBody({ ...draft, servings: "x", ingredients: [{ name: "Reis", amount: "", unit: "g" }] });
    expect(body.servings).toBe(0);
    expect(body.ingredients[0].amount).toBe(0);
  });

  it("verändert das Formular nicht", () => {
    const copy = JSON.parse(JSON.stringify(draft));
    buildSubmissionBody(draft);
    expect(draft).toEqual(copy);
  });
});

describe("fitWithin", () => {
  it("verkleinert die längste Kante auf 1200 und behält das Verhältnis", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 900, height: 1200 });
  });
  it("vergrößert nie", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });
});

describe("splitFieldErrors", () => {
  it("trennt Formularfelder von Sammelmeldungen", () => {
    const { fields, rest } = splitFieldErrors({
      title: ["Titel fehlt"],
      recipe: ["Kalorien unplausibel"],
      open_recipes: ["zu viele"],
    });
    expect(fields).toEqual({ title: ["Titel fehlt"] });
    expect(rest).toEqual(["Kalorien unplausibel", "zu viele"]);
  });
  it("verträgt fehlende details", () => {
    expect(splitFieldErrors(undefined)).toEqual({ fields: {}, rest: [] });
  });
});

describe("openRecipesMessage", () => {
  it("meldet nur beim Limit-Fehler", () => {
    expect(openRecipesMessage({ open_recipes: ["x"] })).toMatch(/5 offene Rezepte/);
    expect(openRecipesMessage({ title: ["x"] })).toBeNull();
    expect(openRecipesMessage(undefined)).toBeNull();
  });
});
