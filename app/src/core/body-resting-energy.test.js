/* Tests: core/body.js estimateRestingEnergy — Etappe E6-0, Fahrplan 23 (E33–E35) */
import { describe, it, expect } from "vitest";
import { estimateRestingEnergy } from "./body.js";
import { SOURCE_BY_KEY } from "./nutrition-sources.js";

const MAN = { weightKg: 75, heightCm: 180, age: 35, sex: "m" };

describe("estimateRestingEnergy — Ankerwerte (Ten-Haaf)", () => {
  it("Mann 75 kg / 180 cm / 35 J. → 1889", () => {
    const r = estimateRestingEnergy(MAN);
    expect(r.ok).toBe(true);
    expect(r.kcal).toBe(1889);
    expect(r.formula).toBe("ten-haaf-2014");
    expect(r.source).toBe("ten-haaf-2014");
    expect(r.hints).toEqual([]);
    expect(r.bodyFatDate).toBeNull();
  });

  it("Frau 60 kg / 168 cm / 30 J. → 1489", () => {
    const r = estimateRestingEnergy({ weightKg: 60, heightCm: 168, age: 30, sex: "f" });
    expect(r.kcal).toBe(1489);
  });

  it("Mann mit Geschlecht unbekannt (0,5) → 1793", () => {
    expect(estimateRestingEnergy({ ...MAN, sex: null }).kcal).toBe(1793);
  });

  it("Quellenschlüssel steht in der Quellenliste", () => {
    expect(SOURCE_BY_KEY.has(estimateRestingEnergy(MAN).source)).toBe(true);
    expect(SOURCE_BY_KEY.has("cunningham-1980")).toBe(true);
    expect(SOURCE_BY_KEY.has("oneill-2023")).toBe(true);
  });
});

describe("estimateRestingEnergy — Geschlecht", () => {
  it("m = 1, f = 0, w wie f, null/anderes = 0,5 mit Hinweis", () => {
    expect(estimateRestingEnergy({ ...MAN, sex: "m" }).kcal).toBe(1889);
    expect(estimateRestingEnergy({ ...MAN, sex: "f" }).kcal).toBe(1698);
    expect(estimateRestingEnergy({ ...MAN, sex: "w" }).kcal).toBe(1698);
    const unknown = estimateRestingEnergy({ ...MAN, sex: null });
    expect(unknown.hints).toEqual(["Geschlecht fehlt, Schätzung ungenauer"]);
    expect(estimateRestingEnergy({ ...MAN, sex: undefined }).kcal).toBe(1793);
  });
});

describe("estimateRestingEnergy — Alter (Hinweis nur außerhalb 18–35)", () => {
  const AGE_HINT = "Formel wurde an 18- bis 35-Jährigen geprüft, hier unsicherer";
  it.each([
    [17, true],
    [18, false],
    [35, false],
    [36, true],
  ])("Alter %i → Hinweis: %s", (age, expected) => {
    const r = estimateRestingEnergy({ ...MAN, age });
    expect(r.hints.includes(AGE_HINT)).toBe(expected);
  });
});

describe("estimateRestingEnergy — fehlende Angaben", () => {
  it("fehlendes Gewicht / Größe / Alter nennt das Feld", () => {
    const { weightKg, heightCm, age, ...rest } = MAN;
    expect(estimateRestingEnergy({ heightCm, age, ...rest })).toEqual({
      ok: false,
      hint: "Profil ergänzen: Gewicht (kg)",
    });
    expect(estimateRestingEnergy({ weightKg, age, ...rest }).hint).toBe("Profil ergänzen: Größe (cm)");
    expect(estimateRestingEnergy({ weightKg, heightCm, ...rest }).hint).toBe("Profil ergänzen: Alter");
  });

  it("alles fehlt / null / 0 / negativ → ok:false, nie NaN", () => {
    expect(estimateRestingEnergy({}).ok).toBe(false);
    expect(estimateRestingEnergy().ok).toBe(false);
    expect(estimateRestingEnergy({ ...MAN, weightKg: 0 }).ok).toBe(false);
    expect(estimateRestingEnergy({ ...MAN, heightCm: -180 }).ok).toBe(false);
    expect(estimateRestingEnergy({ ...MAN, age: NaN }).ok).toBe(false);
  });
});

describe("estimateRestingEnergy — Cunningham bei gemessenem Körperfett", () => {
  // FFM 62 kg bei 75 kg → 500 + 22 × 62 = 1864
  const BF_FFM_62 = 100 * (1 - 62 / 75);

  it("Körperfett mit FFM 62 kg → 1864, Datum in der Rückgabe, keine Hinweise", () => {
    const r = estimateRestingEnergy({ ...MAN, bodyFatPct: BF_FFM_62, bodyFatDate: "2026-09-01" });
    expect(r.kcal).toBe(1864);
    expect(r.formula).toBe("cunningham-1980");
    expect(r.source).toBe("cunningham-1980");
    expect(r.bodyFatDate).toBe("2026-09-01");
    expect(r.hints).toEqual([]);
  });

  it("kein Datum übergeben → bodyFatDate null", () => {
    expect(estimateRestingEnergy({ ...MAN, bodyFatPct: BF_FFM_62 }).bodyFatDate).toBeNull();
  });

  it("Cunningham bekommt keine Alters-/Geschlechtshinweise (Ten-Haaf-Pfad only)", () => {
    const r = estimateRestingEnergy({ ...MAN, age: 50, sex: null, bodyFatPct: BF_FFM_62 });
    expect(r.formula).toBe("cunningham-1980");
    expect(r.hints).toEqual([]);
  });

  const INVALID_HINT = "Körperfett-Wert ungültig, wird ignoriert";
  const IMPLAUSIBLE_HINT = "Körperfett-Wert passt nicht zu Gewicht und Größe, bitte prüfen";

  it.each([0, 100, 120, -5, NaN])("Körperfett %s % → Hinweis 'ungültig', Ten-Haaf-Ergebnis", (bf) => {
    const r = estimateRestingEnergy({ ...MAN, bodyFatPct: bf, bodyFatDate: "2026-09-01" });
    expect(r.formula).toBe("ten-haaf-2014");
    expect(r.kcal).toBe(1889);
    expect(r.hints).toEqual([INVALID_HINT]);
    expect(r.hints).not.toContain(IMPLAUSIBLE_HINT);
    expect(r.bodyFatDate).toBeNull();
  });

  it("ungültiges Körperfett kommt zusätzlich zu Alters- und Geschlechtshinweis", () => {
    const r = estimateRestingEnergy({ ...MAN, age: 40, sex: null, bodyFatPct: 0 });
    expect(r.hints).toEqual([
      INVALID_HINT,
      "Formel wurde an 18- bis 35-Jährigen geprüft, hier unsicherer",
      "Geschlecht fehlt, Schätzung ungenauer",
    ]);
  });

  it("kein Körperfett (null/undefined) → Ten-Haaf, KEIN Hinweis", () => {
    for (const r of [
      estimateRestingEnergy({ ...MAN, bodyFatPct: null }),
      estimateRestingEnergy({ ...MAN, bodyFatPct: undefined }),
      estimateRestingEnergy(MAN),
    ]) {
      expect(r.formula).toBe("ten-haaf-2014");
      expect(r.hints).toEqual([]);
    }
  });

  it("gültiger Wert liefert den 'ungültig'-Hinweis nicht", () => {
    expect(estimateRestingEnergy({ ...MAN, bodyFatPct: BF_FFM_62 }).hints).not.toContain(INVALID_HINT);
    expect(estimateRestingEnergy({ ...MAN, bodyFatPct: 60 }).hints).not.toContain(INVALID_HINT);
  });

  it("beide Körperfett-Hinweise erscheinen nie gleichzeitig", () => {
    for (const bf of [null, undefined, 0, 100, 120, -5, NaN, 5, 12, 20, 38.6, 38.8, 60, 99]) {
      const hints = estimateRestingEnergy({ ...MAN, bodyFatPct: bf }).hints;
      expect(hints.includes(INVALID_HINT) && hints.includes(IMPLAUSIBLE_HINT)).toBe(false);
    }
  });
});

describe("estimateRestingEnergy — Plausibilität (20 %-Grenze, bezogen auf Ten-Haaf)", () => {
  // Ten-Haaf (ungerundet) = 1888,90 → untere 20 %-Grenze = 1511,12 kcal
  // Cunningham(bf) = 500 + 22 × 75 × (1 − bf/100)
  it("Abweichung knapp unter 20 % (bf 38,6 → 1513) → Cunningham", () => {
    const r = estimateRestingEnergy({ ...MAN, bodyFatPct: 38.6 });
    expect(r.formula).toBe("cunningham-1980");
    expect(r.kcal).toBe(1513);
  });

  it("Abweichung knapp über 20 % (bf 38,8 → 1510) → Ten-Haaf + Hinweis", () => {
    const r = estimateRestingEnergy({ ...MAN, bodyFatPct: 38.8, bodyFatDate: "2026-09-01" });
    expect(r.formula).toBe("ten-haaf-2014");
    expect(r.kcal).toBe(1889);
    expect(r.hints).toEqual(["Körperfett-Wert passt nicht zu Gewicht und Größe, bitte prüfen"]);
    expect(r.bodyFatDate).toBeNull();
  });

  it("stark unplausibles Körperfett (60 %) → Ten-Haaf + Hinweis", () => {
    const r = estimateRestingEnergy({ ...MAN, bodyFatPct: 60 });
    expect(r.formula).toBe("ten-haaf-2014");
    expect(r.hints).toContain("Körperfett-Wert passt nicht zu Gewicht und Größe, bitte prüfen");
  });

  it("unplausibles Körperfett + Alter 40 + Geschlecht fehlt → alle drei Hinweise", () => {
    const r = estimateRestingEnergy({ ...MAN, age: 40, sex: null, bodyFatPct: 60 });
    expect(r.hints).toHaveLength(3);
  });
});
