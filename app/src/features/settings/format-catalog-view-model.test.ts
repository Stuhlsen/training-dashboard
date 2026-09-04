import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  draftFromFormat,
  validateSteps,
  validateFormatDraft,
  type FormatDraft,
} from "./format-catalog-view-model";

const ZONE_STEPS = JSON.stringify([
  { id: "S1", structureLabel: "3×10", pctFtp: 88, zoneTimeMin: 30 },
  { id: "S2", structureLabel: "3×12", pctFtp: 88, zoneTimeMin: 36 },
]);

function validDraft(over: Partial<FormatDraft> = {}): FormatDraft {
  return {
    id: "my-format",
    label: "Mein Format",
    targetSystem: "schwelle",
    currency: "zone-time",
    evidenceGrade: "coaching-konsens",
    blockTargets: "Schwelle, Sweet Spot",
    stepsJson: ZONE_STEPS,
    ...over,
  };
}

describe("validateSteps", () => {
  it("akzeptiert gültige zone-time-Stufen", () => {
    const r = validateSteps(ZONE_STEPS, "zone-time");
    expect(r.ok).toBe(true);
    expect(r.ok && r.steps).toHaveLength(2);
  });

  it("meldet ungültiges JSON", () => {
    const r = validateSteps("[{", "zone-time");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors[0]).toMatch(/ungültig/);
  });

  it("verlangt ein nicht-leeres Array", () => {
    expect(validateSteps("[]", "zone-time").ok).toBe(false);
    expect(validateSteps('{"a":1}', "zone-time").ok).toBe(false);
  });

  it("verlangt id und structureLabel je Stufe", () => {
    const r = validateSteps(JSON.stringify([{ pctFtp: 90, zoneTimeMin: 30 }]), "zone-time");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors.join(" ")).toMatch(/id.*fehlt/);
    expect(r.ok === false && r.errors.join(" ")).toMatch(/structureLabel.*fehlt/);
  });

  it("erkennt doppelte Stufen-IDs", () => {
    const dup = JSON.stringify([
      { id: "S1", structureLabel: "a", pctFtp: 88, zoneTimeMin: 30 },
      { id: "S1", structureLabel: "b", pctFtp: 88, zoneTimeMin: 30 },
    ]);
    const r = validateSteps(dup, "zone-time");
    expect(r.ok === false && r.errors.join(" ")).toMatch(/doppelt/);
  });

  it("prüft currency-abhängige Zahlenfelder — over-time", () => {
    const bad = JSON.stringify([{ id: "OU1", structureLabel: "3×9", pctFtp: 100, zoneTimeMin: 20 }]);
    expect(validateSteps(bad, "over-time").ok).toBe(false);
    const good = JSON.stringify([{ id: "OU1", structureLabel: "3×9", pctFtpOver: 105, pctFtpUnder: 88 }]);
    expect(validateSteps(good, "over-time").ok).toBe(true);
  });

  it("prüft currency-abhängige Zahlenfelder — reps", () => {
    const good = JSON.stringify([{ id: "SP1", structureLabel: "3×10s", reps: 3, workSec: 10, restMin: 4 }]);
    expect(validateSteps(good, "reps").ok).toBe(true);
    const bad = JSON.stringify([{ id: "SP1", structureLabel: "3×10s", reps: 0, workSec: 10, restMin: 4 }]);
    expect(validateSteps(bad, "reps").ok).toBe(false);
  });

  it("lehnt nicht-positive Zahlen ab", () => {
    const bad = JSON.stringify([{ id: "S1", structureLabel: "a", pctFtp: 0, zoneTimeMin: -5 }]);
    expect(validateSteps(bad, "zone-time").ok).toBe(false);
  });
});

describe("validateFormatDraft", () => {
  it("gibt bei gültigem Entwurf einen Schreibwert zurück", () => {
    const r = validateFormatDraft(validDraft());
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toMatchObject({
      id: "my-format",
      label: "Mein Format",
      targetSystem: "schwelle",
      currency: "zone-time",
      evidenceGrade: "coaching-konsens",
      blockTargets: ["Schwelle", "Sweet Spot"],
    });
    expect(r.ok && r.value.axes.explicitSteps).toHaveLength(2);
  });

  it("trimmt id/label und leeres block_targets → []", () => {
    const r = validateFormatDraft(validDraft({ id: "  x1  ", label: "  L  ", blockTargets: "  ,  " }));
    expect(r.ok && r.value.id).toBe("x1");
    expect(r.ok && r.value.label).toBe("L");
    expect(r.ok && r.value.blockTargets).toEqual([]);
  });

  it("lehnt eine id mit Großbuchstaben/Leerzeichen ab", () => {
    expect(validateFormatDraft(validDraft({ id: "My Format" })).ok).toBe(false);
    expect(validateFormatDraft(validDraft({ id: "-lead" })).ok).toBe(false);
  });

  it("lehnt unbekannte Enum-Werte ab", () => {
    const r = validateFormatDraft(validDraft({ targetSystem: "unsinn", currency: "nope", evidenceGrade: "x" }));
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errors).toHaveLength(3);
  });

  it("reicht Stufen-Fehler durch", () => {
    const r = validateFormatDraft(validDraft({ stepsJson: "[]" }));
    expect(r.ok).toBe(false);
  });

  it("verlangt id und label", () => {
    const r = validateFormatDraft(validDraft({ id: "", label: "  " }));
    expect(r.ok === false && r.errors.join(" ")).toMatch(/`id` ist Pflicht/);
    expect(r.ok === false && r.errors.join(" ")).toMatch(/`label` ist Pflicht/);
  });
});

describe("draftFromFormat / emptyDraft", () => {
  it("emptyDraft ist selbst noch kein gültiger Schreibwert (leere Stufen)", () => {
    expect(validateFormatDraft(emptyDraft()).ok).toBe(false);
  });

  it("draftFromFormat serialisiert explicitSteps zurück in JSON-Text", () => {
    const d = draftFromFormat({
      id: "f1",
      label: "F1",
      targetSystem: "vo2max",
      currency: "zone-time",
      evidenceGrade: "studienlage",
      blockTargets: ["VO2max"],
      axes: { explicitSteps: [{ id: "V1", structureLabel: "4×3", pctFtp: 112, zoneTimeMin: 12 }] },
    });
    expect(d.blockTargets).toBe("VO2max");
    expect(JSON.parse(d.stepsJson)).toHaveLength(1);
    // Roundtrip: Entwurf aus einem echten Format ist wieder gültig.
    expect(validateFormatDraft(d).ok).toBe(true);
  });
});
