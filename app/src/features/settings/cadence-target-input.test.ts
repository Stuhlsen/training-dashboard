import { describe, test, expect } from "vitest";
import { parseCadenceTargetInput } from "./cadence-target-input";

describe("parseCadenceTargetInput", () => {
  test("leeres Feld (auch nur Whitespace) → null = zurück auf den Standard", () => {
    expect(parseCadenceTargetInput("")).toEqual({ ok: true, value: null });
    expect(parseCadenceTargetInput("   ")).toEqual({ ok: true, value: null });
  });

  test("gültige Ganzzahl im Bereich → value", () => {
    expect(parseCadenceTargetInput("78")).toEqual({ ok: true, value: 78 });
    expect(parseCadenceTargetInput(" 90 ")).toEqual({ ok: true, value: 90 });
  });

  test("Bereichsgrenzen 60 und 120 sind inklusive", () => {
    expect(parseCadenceTargetInput("60")).toEqual({ ok: true, value: 60 });
    expect(parseCadenceTargetInput("120")).toEqual({ ok: true, value: 120 });
  });

  test("außerhalb 60–120 → Fehler", () => {
    expect(parseCadenceTargetInput("59").ok).toBe(false);
    expect(parseCadenceTargetInput("121").ok).toBe(false);
  });

  test("keine Ganzzahl → Fehler", () => {
    expect(parseCadenceTargetInput("80.5").ok).toBe(false);
    expect(parseCadenceTargetInput("abc").ok).toBe(false);
  });
});
