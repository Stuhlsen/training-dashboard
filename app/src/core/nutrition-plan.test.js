/* Tests: core/nutrition-plan.js — Ampel (E32), Tageszusammenstellung (E31),
 * Tauschkandidaten. Fixtures sind SYNTHETISCH (keine Daten aus planning/seed). */

import { describe, expect, it } from "vitest";
import { ALLERGEN_TAXONOMY } from "./nutrition-taxonomy.js";
import {
  AMPEL_GREEN_BAND,
  MEAL_SLOTS,
  PORTION_STEPS,
  PROTEIN_MAX_G,
  composeDay,
  dayAmpel,
  proteinMinFor,
  swapCandidates,
} from "./nutrition-plan.js";

/* ── Fixtures ─────────────────────────────────────────────── */

function recipe(id, mealType, kcal, protein, extra = {}) {
  return {
    id,
    status: "approved",
    mealType: [].concat(mealType),
    containsTags: [],
    nutrition: { kcal, protein, carbs: Math.round(kcal / 8), fat: Math.round(kcal / 30) },
    ...extra,
  };
}

/** 60 Rezepte: 12 Frühstück, 15 Mittag, 15 Abend, 12 Snack, Werte variieren deterministisch. */
function syntheticPool() {
  const counts = { breakfast: 12, lunch: 15, dinner: 15, snack: 12 };
  const base = { breakfast: 380, lunch: 640, dinner: 600, snack: 200 };
  const prot = { breakfast: 18, lunch: 34, dinner: 32, snack: 8 };
  const pool = [];
  for (const slot of MEAL_SLOTS) {
    for (let i = 0; i < counts[slot]; i++) {
      pool.push(recipe(`${slot}-${i}`, slot, base[slot] + i * 17, prot[slot] + (i % 5)));
    }
  }
  return pool;
}

const BASE = { target: 2600, floor: 1700, weightKg: 75, dateISO: "2026-10-14" };
const kcalOf = (pool, c) => pool.find((r) => r.id === c.recipeId).nutrition.kcal * c.servings;

/* ── dayAmpel ─────────────────────────────────────────────── */

describe("dayAmpel (E32, vereinfacht)", () => {
  it("rot nur unter dem RED-S-Boden — auch wenn die Summe sonst im Band läge", () => {
    expect(dayAmpel(1699, 1750, 1700)).toBe("red");
    expect(dayAmpel(1700, 1750, 1700)).toBe("green");
  });

  it("grün bei höchstens 10 Prozent Abweichung, in beide Richtungen", () => {
    expect(AMPEL_GREEN_BAND).toBe(0.1);
    expect(dayAmpel(2600, 2600, 1700)).toBe("green");
    expect(dayAmpel(2860, 2600, 1700)).toBe("green");
    expect(dayAmpel(2340, 2600, 1700)).toBe("green");
  });

  it("gelb außerhalb des Bands über dem Boden — es gibt keine 20-Prozent-Grenze", () => {
    expect(dayAmpel(2861, 2600, 1700)).toBe("yellow");
    expect(dayAmpel(2339, 2600, 1700)).toBe("yellow");
    expect(dayAmpel(5000, 2600, 1700)).toBe("yellow");
    expect(dayAmpel(1800, 2600, 1700)).toBe("yellow");
  });
});

describe("proteinMinFor", () => {
  it("max(0,25 g/kg; 20 g)", () => {
    expect(proteinMinFor(60)).toBe(20);
    expect(proteinMinFor(100)).toBe(25);
    expect(proteinMinFor(undefined)).toBe(20);
  });
});

/* ── composeDay ───────────────────────────────────────────── */

describe("composeDay — normaler Pool", () => {
  const pool = syntheticPool();

  it("füllt alle vier Slots mit Portionen aus den 0,5er-Schritten und trifft das Ziel nahe", () => {
    const res = composeDay({ ...BASE, recipes: pool });
    let sum = 0;
    for (const slot of MEAL_SLOTS) {
      expect(res.slots[slot]).not.toBeNull();
      expect(PORTION_STEPS).toContain(res.slots[slot].servings);
      sum += kcalOf(pool, res.slots[slot]);
    }
    expect(res.totals.kcal).toBe(Math.round(sum));
    expect(res.ampel).toBe("green");
    expect(res.flags.noMatch).toEqual([]);
  });

  it("Eiweiß-Obergrenze 40 g je Hauptmahlzeit ist hart", () => {
    const big = [
      recipe("b1", "breakfast", 500, 30),
      recipe("l1", "lunch", 800, 38),
      recipe("d1", "dinner", 800, 38),
      recipe("s1", "snack", 200, 5),
    ];
    const res = composeDay({ ...BASE, target: 5000, recipes: big });
    for (const slot of ["breakfast", "lunch", "dinner"]) {
      const c = res.slots[slot];
      const r = big.find((x) => x.id === c.recipeId);
      expect(r.nutrition.protein * c.servings).toBeLessThanOrEqual(PROTEIN_MAX_G);
    }
  });

  it("Eiweißbereich ist weich: bleibt eine Hauptmahlzeit darunter, kommt eine Markierung statt eines Fehlers", () => {
    const lowProtein = [
      recipe("b1", "breakfast", 450, 8),
      recipe("l1", "lunch", 700, 30),
      recipe("d1", "dinner", 700, 30),
      recipe("s1", "snack", 250, 5),
    ];
    const res = composeDay({ ...BASE, recipes: lowProtein });
    expect(res.slots.breakfast).not.toBeNull();
    expect(res.flags.proteinLow).toContain("breakfast");
  });

  it("bevorzugt bei gleicher Kalorien-Nähe das Frühstück mit genug Eiweiß", () => {
    const pair = [
      recipe("b-low", "breakfast", 450, 10),
      recipe("b-ok", "breakfast", 450, 26),
      recipe("l1", "lunch", 700, 30),
      recipe("d1", "dinner", 700, 30),
      recipe("s1", "snack", 250, 5),
    ];
    const res = composeDay({ ...BASE, recipes: pair });
    expect(res.slots.breakfast.recipeId).toBe("b-ok");
  });

  it("ignoriert Rezepte ohne Nährwerte, nicht genehmigte und solche mit ungültigen Werten", () => {
    const mixed = [
      ...syntheticPool(),
      { id: "no-nutri", status: "approved", mealType: ["breakfast"], containsTags: [], nutrition: null },
      recipe("pending-1", "lunch", 640, 40, { status: "pending" }),
      recipe("nan-1", "dinner", 600, 30, { nutrition: { kcal: NaN, protein: 30, carbs: 1, fat: 1 } }),
    ];
    const res = composeDay({ ...BASE, recipes: mixed });
    const ids = MEAL_SLOTS.map((s) => res.slots[s]?.recipeId);
    expect(ids).not.toContain("no-nutri");
    expect(ids).not.toContain("pending-1");
    expect(ids).not.toContain("nan-1");
  });

  it("ist deterministisch: gleiche Eingabe (auch in anderer Rezept-Reihenfolge), gleiches Ergebnis", () => {
    const a = composeDay({ ...BASE, recipes: pool });
    expect(composeDay({ ...BASE, recipes: [...pool].reverse() })).toEqual(a);
    expect(composeDay({ ...BASE, recipes: pool })).toEqual(a);
  });

  it("rotiert über zwei aufeinanderfolgende Tage (Strafe für bereits gewählte Rezepte)", () => {
    const day1 = composeDay({ ...BASE, dateISO: "2026-10-14", recipes: pool });
    const ids1 = MEAL_SLOTS.map((s) => day1.slots[s].recipeId);
    const day2 = composeDay({ ...BASE, dateISO: "2026-10-15", recipes: pool, planned: ids1 });
    const ids2 = MEAL_SLOTS.map((s) => day2.slots[s].recipeId);
    expect(ids2.filter((id, i) => id === ids1[i]).length).toBeLessThan(MEAL_SLOTS.length);

    const day3 = composeDay({ ...BASE, dateISO: "2026-10-16", recipes: pool, planned: [...ids1, ...ids2] });
    const ids3 = MEAL_SLOTS.map((s) => day3.slots[s].recipeId);
    expect(ids3.join()).not.toBe(ids2.join());
  });

  it("Rechenzeit unter 50 ms bei 60 Rezepten", () => {
    composeDay({ ...BASE, recipes: pool }); // Aufwärmen (JIT)
    const runs = 20;
    const start = performance.now();
    for (let i = 0; i < runs; i++) composeDay({ ...BASE, dateISO: `2026-10-${10 + (i % 15)}`, recipes: pool });
    const perRun = (performance.now() - start) / runs;
    // Messwert für den PR-Bericht
    process.stdout.write(`composeDay: ${perRun.toFixed(2)} ms je Aufruf (60 Rezepte)\n`);
    expect(perRun).toBeLessThan(50);
  });
});

describe("composeDay — Randfälle", () => {
  it("leerer Pool: alle Slots leer, Markierung statt Absturz", () => {
    const res = composeDay({ ...BASE, recipes: [] });
    expect(MEAL_SLOTS.every((s) => res.slots[s] === null)).toBe(true);
    expect(res.flags.noMatch).toEqual([...MEAL_SLOTS]);
    expect(res.totals.kcal).toBe(0);
  });

  it("fehlende/ungültige Rezeptliste crasht nicht", () => {
    expect(() => composeDay({ ...BASE, recipes: undefined })).not.toThrow();
    expect(() => composeDay({ ...BASE, recipes: [null, {}] })).not.toThrow();
  });

  it("weniger als 3 Kandidaten je Slot: poolSize meldet die Anzahl, der Tag wird trotzdem gebaut", () => {
    const small = [
      recipe("b1", "breakfast", 450, 25),
      recipe("b2", "breakfast", 500, 25),
      recipe("l1", "lunch", 700, 30),
      recipe("d1", "dinner", 700, 30),
      recipe("s1", "snack", 250, 5),
    ];
    const res = composeDay({ ...BASE, recipes: small });
    expect(res.flags.poolSize).toEqual({ breakfast: 2, lunch: 1, dinner: 1, snack: 1 });
    expect(MEAL_SLOTS.every((s) => res.slots[s] !== null)).toBe(true);
  });

  it("nur 1 Kandidat im Gesamtpool: der passende Slot ist belegt, die anderen sind leer", () => {
    const res = composeDay({ ...BASE, recipes: [recipe("only", ["lunch"], 700, 30)] });
    expect(res.slots.lunch?.recipeId).toBe("only");
    expect(res.flags.noMatch).toEqual(["breakfast", "dinner", "snack"]);
  });

  it.each(ALLERGEN_TAXONOMY.filter((e) => !e.isFreetext).map((e) => e.key))(
    "Allergen %s: ist jedes Rezept betroffen, bleibt jeder Slot leer",
    (key) => {
      const tagged = syntheticPool().map((r) => ({ ...r, containsTags: [key] }));
      const res = composeDay({ ...BASE, recipes: tagged, intolerances: [key] });
      expect(res.flags.noMatch).toEqual([...MEAL_SLOTS]);
      expect(res.flags.poolSize).toEqual({ breakfast: 0, lunch: 0, dinner: 0, snack: 0 });
    },
  );

  it("Intoleranz filtert nur die betroffenen Rezepte heraus (E19)", () => {
    const pool = syntheticPool().map((r, i) => (i % 2 === 0 ? { ...r, containsTags: ["gluten"] } : r));
    const res = composeDay({ ...BASE, recipes: pool, intolerances: ["gluten"] });
    for (const slot of MEAL_SLOTS) {
      const r = pool.find((x) => x.id === res.slots[slot].recipeId);
      expect(r.containsTags).not.toContain("gluten");
    }
  });

  it("Ziel genau am Boden: Summe nahe am Ziel, Ampel nie rot, solange die Summe nicht darunter fällt", () => {
    const res = composeDay({ ...BASE, target: 1700, floor: 1700, recipes: syntheticPool() });
    if (res.totals.kcal < 1700) expect(res.ampel).toBe("red");
    else expect(res.ampel).not.toBe("red");
    expect(Math.abs(res.totals.kcal - 1700)).toBeLessThan(400);
  });

  it("Ziel sehr hoch: beste Nähe plus Markierung, kein Absturz", () => {
    const res = composeDay({ ...BASE, target: 9000, recipes: syntheticPool() });
    expect(MEAL_SLOTS.every((s) => res.slots[s] !== null)).toBe(true);
    expect(res.ampel).toBe("yellow");
    expect(res.flags.targetUnreachable).toBe(true);
  });

  it("Ziel sehr niedrig: kleinste Portionen, Markierung", () => {
    const res = composeDay({ ...BASE, target: 600, floor: 400, recipes: syntheticPool() });
    expect(MEAL_SLOTS.every((s) => res.slots[s].servings <= 1)).toBe(true);
    expect(res.flags.targetUnreachable).toBe(true);
  });
});

/* ── swapCandidates ───────────────────────────────────────── */

describe("swapCandidates", () => {
  const pool = syntheticPool();
  const day = composeDay({ ...BASE, recipes: pool });

  it("liefert 2 bis 3 Alternativen mit neuer Tagessumme und Ampel, ohne das aktuelle Rezept", () => {
    const swaps = swapCandidates({ ...BASE, recipes: pool, slot: "lunch", current: day.slots });
    expect(swaps.length).toBeGreaterThanOrEqual(2);
    expect(swaps.length).toBeLessThanOrEqual(3);
    for (const s of swaps) {
      expect(s.recipeId).not.toBe(day.slots.lunch.recipeId);
      expect(["red", "yellow", "green"]).toContain(s.ampel);
      expect(s.totals.kcal).toBeGreaterThan(0);
    }
    expect(new Set(swaps.map((s) => s.recipeId)).size).toBe(swaps.length);
  });

  it("neue Tagessumme = Rest des Tages + Alternative", () => {
    const [first] = swapCandidates({ ...BASE, recipes: pool, slot: "dinner", current: day.slots });
    const rest = ["breakfast", "lunch", "snack"].reduce((acc, s) => acc + kcalOf(pool, day.slots[s]), 0);
    expect(first.totals.kcal).toBe(Math.round(rest + kcalOf(pool, first)));
  });

  it("nur 1 Kandidat im Slot: keine Alternativen (leere Liste)", () => {
    const one = [recipe("l1", "lunch", 700, 30)];
    expect(
      swapCandidates({ ...BASE, recipes: one, slot: "lunch", current: { lunch: { recipeId: "l1", servings: 1 } } }),
    ).toEqual([]);
  });

  it("unbekannter Slot / leerer Pool: leere Liste, kein Absturz", () => {
    expect(swapCandidates({ ...BASE, recipes: pool, slot: "brunch", current: {} })).toEqual([]);
    expect(swapCandidates({ ...BASE, recipes: [], slot: "lunch", current: {} })).toEqual([]);
  });

  it("respektiert den Intoleranz-Filter", () => {
    const tagged = pool.map((r) => (r.id.startsWith("lunch") ? { ...r, containsTags: ["eggs"] } : r));
    expect(swapCandidates({ ...BASE, recipes: tagged, slot: "lunch", current: {}, intolerances: ["eggs"] })).toEqual([]);
  });
});
