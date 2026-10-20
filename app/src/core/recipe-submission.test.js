import { describe, expect, it } from "vitest";
import {
  buildSubmissionBody,
  draftFromRecipe,
  fitWithin,
  formatAmount,
  openRecipesMessage,
  parseAmount,
  parseMinutes,
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

describe("parseMinutes", () => {
  it("liest ganze Minuten", () => {
    expect(parseMinutes("25")).toBe(25);
    expect(parseMinutes(" 600 ")).toBe(600);
  });
  it("lehnt leer, Text, 0, negativ und Kommazahlen ab", () => {
    for (const bad of ["", "abc", "0", "-5", "12,5", "12.5", "1e2"]) expect(parseMinutes(bad)).toBeNull();
  });
});

describe("buildSubmissionBody", () => {
  const draft = {
    title: "  Haferbrei ",
    servings: "2",
    prepMinutes: "25",
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
      prep_minutes: 25,
      ingredients: [{ name: "Haferflocken", amount: 80.5, unit: "g" }],
      instructions: [{ text: "Kochen", timerSeconds: 300 }, { text: "Servieren" }],
    });
  });

  it("gibt eine unlesbare oder fehlende Zeit als 0 weiter, damit der Server sie meldet", () => {
    for (const prepMinutes of ["", "abc", "12,5"]) {
      expect(buildSubmissionBody({ ...draft, prepMinutes }).prep_minutes).toBe(0);
    }
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

describe("formatAmount / draftFromRecipe", () => {
  it("schreibt Zahlen mit Komma und höchstens zwei Nachkommastellen", () => {
    expect(formatAmount(80)).toBe("80");
    expect(formatAmount(80.5)).toBe("80,5");
    expect(formatAmount(1.6666)).toBe("1,67");
  });

  const recipe = {
    title: "Haferbrei",
    servings: 2,
    prepMinutes: 25,
    mealType: ["breakfast"],
    ingredients: [{ name: "Haferflocken", amount: 80.5, unit: "g", category: "Getreide" }],
    instructions: [{ text: "Kochen", timerSeconds: 90 }, { text: "Servieren" }],
  };

  it("belegt das Formular aus dem gespeicherten Rezept vor", () => {
    expect(draftFromRecipe(recipe)).toEqual({
      title: "Haferbrei",
      servings: "2",
      prepMinutes: "25",
      mealTypes: ["breakfast"],
      ingredients: [{ name: "Haferflocken", amount: "80,5", unit: "g" }],
      steps: [
        { text: "Kochen", timerMinutes: "1,5" },
        { text: "Servieren", timerMinutes: "" },
      ],
    });
  });

  it("ergibt beim Zurückrechnen denselben Body (Rundreise)", () => {
    const body = buildSubmissionBody(draftFromRecipe(recipe));
    expect(body.ingredients).toEqual([{ name: "Haferflocken", amount: 80.5, unit: "g" }]);
    expect(body.instructions).toEqual([{ text: "Kochen", timerSeconds: 90 }, { text: "Servieren" }]);
    expect(body.servings).toBe(2);
    expect(body.prep_minutes).toBe(25);
  });

  it("belegt die Zeit leer vor, wenn das Rezept (Bestand) keine hat", () => {
    expect(draftFromRecipe({ ...recipe, prepMinutes: null }).prepMinutes).toBe("");
  });

  it("verträgt ein Rezept ohne Zutaten/Schritte und lässt einen leeren Schritt stehen", () => {
    const draft = draftFromRecipe({ title: "Leer", servings: 1, mealType: null, ingredients: null, instructions: null });
    expect(draft.ingredients).toEqual([]);
    expect(draft.mealTypes).toEqual([]);
    expect(draft.steps).toEqual([{ text: "", timerMinutes: "" }]);
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
  it("ersetzt den technischen Mahlzeit-Text durch einen verständlichen", () => {
    const { fields } = splitFieldErrors({ meal_type: ["meal_type: mindestens einer aus breakfast, lunch, dinner, snack"] });
    expect(fields).toEqual({ meal_type: ["Wähle mindestens eine Mahlzeit."] });
  });
  it("hält den Zeit-Fehler als Feldfehler fest", () => {
    const { fields, rest } = splitFieldErrors({ prep_minutes: ["Zubereitungszeit fehlt"] });
    expect(fields).toEqual({ prep_minutes: ["Zubereitungszeit fehlt"] });
    expect(rest).toEqual([]);
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
