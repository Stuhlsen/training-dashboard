import { describe, expect, it } from "vitest";
import { GLOSSARY, glossaryEntry } from "./glossary";

describe("glossaryEntry", () => {
  it("liefert einen Eintrag für bekannte Keys", () => {
    const e = glossaryEntry("ctl");
    expect(e).not.toBeNull();
    expect(e?.title).toMatch(/CTL/);
    expect(e?.text.length).toBeGreaterThan(0);
  });

  it("liefert null für unbekannte Keys und den Leerstring", () => {
    expect(glossaryEntry("gibt-es-nicht")).toBeNull();
    expect(glossaryEntry("")).toBeNull();
  });
});

describe("GLOSSARY-Inhalt", () => {
  it("jeder Eintrag hat einen nicht-leeren Titel und einen Satz als Text", () => {
    for (const [key, entry] of Object.entries(GLOSSARY)) {
      expect(entry.title.trim().length, key).toBeGreaterThan(0);
      const text = entry.text.trim();
      // "Ein Satz" — Heuristik: endet mit Punkt, bleibt kurz genug für die Box.
      expect(text.length, key).toBeGreaterThan(0);
      expect(text.endsWith("."), key).toBe(true);
      expect(text.length, key).toBeLessThan(200);
    }
  });
});
