import { describe, it, expect } from "vitest";
import {
  ALLERGEN_TAXONOMY,
  ALLERGEN_KEYS,
  ALLERGEN_FREETEXT_KEY,
  ALLERGEN_LABEL_MAP,
  isValidAllergenKey,
  allergenLabel,
  normalizeAllergenKeys,
} from "./nutrition-taxonomy.js";

describe("core/nutrition-taxonomy", () => {
  // ── AC: exactly 14 EU allergens + sonstiges ──────────────────────
  it("exports exactly 15 entries (14 EU allergens + sonstiges)", () => {
    expect(ALLERGEN_TAXONOMY).toHaveLength(15);
  });

  // ── AC: keys are stable ascii identifiers, labels are German ──────
  describe("machine keys and labels", () => {
    it("all keys are lowercase ascii only", () => {
      for (const entry of ALLERGEN_TAXONOMY) {
        expect(entry.key).toMatch(/^[a-z]+$/);
      }
    });

    it("all labels are German", () => {
      // Spot-check a few representative labels
      const map = new Map(ALLERGEN_TAXONOMY.map((e) => [e.key, e.label]));
      expect(map.get("gluten")).toBe("Gluten");
      expect(map.get("eggs")).toBe("Eier");
      expect(map.get("peanuts")).toBe("Erdnüsse");
      expect(map.get("milk")).toBe("Milch/Laktose");
      expect(map.get("sesame")).toBe("Sesam");
      expect(map.get("sulphites")).toBe("Sulfite/Schwefeldioxid");
    });

    it("ALLERGEN_LABEL_MAP mirrors ALLERGEN_TAXONOMY one-to-one", () => {
      expect(ALLERGEN_LABEL_MAP.size).toBe(ALLERGEN_TAXONOMY.length);
      for (const entry of ALLERGEN_TAXONOMY) {
        expect(ALLERGEN_LABEL_MAP.get(entry.key)).toBe(entry.label);
      }
    });
  });

  // ── AC: sonstiges is present and flagged as free-text marker ────
  it("sonstiges is present", () => {
    const entry = ALLERGEN_TAXONOMY.find((e) => e.key === "sonstiges");
    expect(entry).toBeDefined();
    expect(entry.label).toBe("Sonstiges");
    expect(entry.isFreetext).toBe(true);
  });

  it("ALLERGEN_FREETEXT_KEY equals 'sonstiges'", () => {
    expect(ALLERGEN_FREETEXT_KEY).toBe("sonstiges");
  });

  // ── AC: no duplicate keys ──────────────────────────────────────
  it("has no duplicate keys", () => {
    const keys = ALLERGEN_TAXONOMY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // ── AC: no key collides with DietTag values ────────────────────
  it("no key collides with diet_tags values (veg/vegan/glutenfrei/omnivor)", () => {
    const dietTagValues = ["veg", "vegan", "glutenfrei", "omnivor"];
    for (const entry of ALLERGEN_TAXONOMY) {
      expect(dietTagValues).not.toContain(entry.key);
    }
  });

  // ── AC: sonstiges is the only freetext entry ───────────────────
  it("only sonstiges has isFreetext flag", () => {
    const freetext = ALLERGEN_TAXONOMY.filter((e) => e.isFreetext);
    expect(freetext).toHaveLength(1);
    expect(freetext[0].key).toBe("sonstiges");
  });

  // ── Edge case: unknown key handling ────────────────────────────
  describe("unknown key handling", () => {
    it("isValidAllergenKey returns false for unknown keys", () => {
      expect(isValidAllergenKey("non_eu_value")).toBe(false);
      expect(isValidAllergenKey("")).toBe(false);
      expect(isValidAllergenKey("Gluten")).toBe(false); // uppercase
      expect(isValidAllergenKey("gluten ")).toBe(false); // trailing space
    });

    it("isValidAllergenKey returns true for all defined keys", () => {
      for (const entry of ALLERGEN_TAXONOMY) {
        expect(isValidAllergenKey(entry.key)).toBe(true);
      }
    });

    it("allergenLabel returns the key itself for unknown values (graceful degradation)", () => {
      expect(allergenLabel("non_eu_value")).toBe("non_eu_value");
      expect(allergenLabel("")).toBe("");
    });

    it("allergenLabel returns German label for known keys", () => {
      expect(allergenLabel("milk")).toBe("Milch/Laktose");
      expect(allergenLabel("fish")).toBe("Fisch");
    });

    it("normalizeAllergenKeys strips unknown keys and deduplicates", () => {
      const input = ["gluten", "non_eu_value", "gluten", "milk", "xyz"];
      const result = normalizeAllergenKeys(input);
      expect(result).toEqual(["gluten", "milk"]);
    });

    it("normalizeAllergenKeys returns empty array for null/non-array", () => {
      expect(normalizeAllergenKeys(null)).toEqual([]);
      expect(normalizeAllergenKeys(undefined)).toEqual([]);
      expect(normalizeAllergenKeys(123)).toEqual([]);
    });

    it("normalizeAllergenKeys preserves order of first occurrence", () => {
      const input = ["milk", "peanuts", "milk", "sesame"];
      expect(normalizeAllergenKeys(input)).toEqual(["milk", "peanuts", "sesame"]);
    });
  });

  // ── Frozenness ─────────────────────────────────────────────────
  it("ALLERGEN_TAXONOMY is frozen and cannot be mutated", () => {
    expect(Object.isFrozen(ALLERGEN_TAXONOMY)).toBe(true);
  });

  it("ALLERGEN_KEYS is frozen", () => {
    expect(Object.isFrozen(ALLERGEN_KEYS)).toBe(true);
  });

  it("ALLERGEN_LABEL_MAP is frozen", () => {
    expect(Object.isFrozen(ALLERGEN_LABEL_MAP)).toBe(true);
  });
});