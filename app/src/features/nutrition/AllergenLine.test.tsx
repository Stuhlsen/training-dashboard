/* Tests: AllergenLine (E10) — Zeile aus containsTags über den echten
 * Taxonomie-Datenweg (core/nutrition-taxonomy.js), Leerzustand, Hinweis. */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ALLERGEN_TAXONOMY, allergenLabel } from "../../core/nutrition-taxonomy.js";
import { AllergenLine } from "./AllergenLine";
import { ALLERGEN_NOTE, allergenText } from "./allergen-text";

afterEach(cleanup);

describe("allergenText", () => {
  it("nennt mehrere Allergene mit den deutschen Taxonomie-Namen", () => {
    const keys = ALLERGEN_TAXONOMY.filter((e) => !e.isFreetext)
      .slice(0, 3)
      .map((e) => e.key);
    const labels = keys.map((k) => allergenLabel(k));
    expect(labels.every((l) => l !== "" && !keys.includes(l))).toBe(true);
    expect(allergenText(keys)).toBe(`Enthält: ${labels.join(", ")}`);
  });

  it("zeigt für jeden Taxonomie-Schlüssel das deutsche Label, nie den Rohschlüssel", () => {
    for (const { key, label } of ALLERGEN_TAXONOMY) {
      expect(allergenText([key])).toBe(`Enthält: ${label}`);
    }
  });

  it("ohne Tags: 'Keine Allergene hinterlegt'", () => {
    expect(allergenText([])).toBe("Keine Allergene hinterlegt");
    expect(allergenText(null)).toBe("Keine Allergene hinterlegt");
    expect(allergenText(undefined)).toBe("Keine Allergene hinterlegt");
  });

  it("ignoriert unbekannte Schlüssel und Duplikate", () => {
    expect(allergenText(["gluten", "gluten", "unbekannt"])).toBe(`Enthält: ${allergenLabel("gluten")}`);
    expect(allergenText(["unbekannt"])).toBe("Keine Allergene hinterlegt");
  });
});

describe("AllergenLine", () => {
  it("rendert Zeile und Orientierungs-Hinweis", () => {
    render(<AllergenLine tags={["gluten", "milk"]} />);
    expect(screen.getByText(`Enthält: ${allergenLabel("gluten")}, ${allergenLabel("milk")}`)).toBeTruthy();
    expect(screen.getByText(ALLERGEN_NOTE)).toBeTruthy();
  });

  it("rendert auch ohne Tags etwas (Leerzustand + Hinweis)", () => {
    render(<AllergenLine tags={[]} />);
    expect(screen.getByText("Keine Allergene hinterlegt")).toBeTruthy();
    expect(screen.getByText(ALLERGEN_NOTE)).toBeTruthy();
  });
});
