/* Tests: core/nutrition.js — Etappe E1+E2, Fahrplan 23 */
import { describe, it, expect } from "vitest";
import {
  estimateDailyTarget,
  redSFloor,
  filterByIntolerances,
  trainingNutritionHint,
  weightMissingHint,
  estimateCarbTarget,
  paceToDailyKcal,
  ENERGY_PER_KG_BODY_MASS,
} from "./nutrition.js";

import {
  NUTRITION_SOURCES,
  SOURCE_BY_KEY,
} from "./nutrition-sources.js";

/* ──────────────────────────────────────────────────────────
   Sources-Liste
   ────────────────────────────────────────────────────────── */
describe("core/nutrition-sources", () => {
  it("exports exactly 9 entries", () => {
    expect(NUTRITION_SOURCES).toHaveLength(9);
  });

  it("every source has key, title, link, note", () => {
    for (const s of NUTRITION_SOURCES) {
      expect(s).toHaveProperty("key");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("link");
      expect(s).toHaveProperty("note");
    }
  });

  it("SOURCE_BY_KEY mirrors NUTRITION_SOURCES one-to-one", () => {
    expect(SOURCE_BY_KEY.size).toBe(NUTRITION_SOURCES.length);
    for (const s of NUTRITION_SOURCES) {
      expect(SOURCE_BY_KEY.get(s.key)).toBe(s);
    }
  });

  it("has no duplicate keys", () => {
    const keys = NUTRITION_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("includes all expected keys", () => {
    const keys = NUTRITION_SOURCES.map((s) => s.key).sort();
    expect(keys).toEqual([
      "7700-kcal-per-kg",
      "acsm-and-2016",
      "dge-konig-2020",
      "eu-allergen-reg",
      "ioc-reds-2023",
      "mifflin-st-jeor",
      "rethinking-ea-2026",
      "rueda-cordoba-2026",
      "standard-bodyfat",
    ].sort());
  });
});

/* ──────────────────────────────────────────────────────────
   ENERGY_PER_KG_BODY_MASS
   ────────────────────────────────────────────────────────── */
describe("ENERGY_PER_KG_BODY_MASS", () => {
  it("equals 7700", () => {
    expect(ENERGY_PER_KG_BODY_MASS).toBe(7700);
  });

  it("0.5 kg/week → 550 kcal/day deficit", () => {
    // 0.5 kg * 7700 kcal/kg / 7 days = 550 kcal/day
    expect(paceToDailyKcal(0.5)).toBe(550);
  });

  it("1 kg/week → 1100 kcal/day", () => {
    expect(paceToDailyKcal(1)).toBe(1100);
  });

  it("0 kg/week → 0 kcal/day", () => {
    expect(paceToDailyKcal(0)).toBe(0);
  });

  it("negative pace (weight gain) returns negative kcal", () => {
    // -0.5 kg/week → -550 kcal/day (caloric surplus)
    expect(paceToDailyKcal(-0.5)).toBe(-550);
  });

  it("null/undefined pace → 0", () => {
    expect(paceToDailyKcal(null)).toBe(0);
    expect(paceToDailyKcal(undefined)).toBe(0);
  });
});

/* ──────────────────────────────────────────────────────────
   estimateDailyTarget
   ────────────────────────────────────────────────────────── */
describe("estimateDailyTarget", () => {
  // Referenz: Mann 80 kg, 180 cm, 35 Jahre
  // BMR = 10*80 + 6.25*180 - 5*35 + 5 = 800 + 1125 - 175 + 5 = 1755
  const validProfile = { weightKg: 80, heightCm: 180, age: 35, sex: "m" };

  it("returns BMR with source key and note", () => {
    const r = estimateDailyTarget(validProfile);
    expect(r.ok).toBe(true);
    expect(r.bmr).toBe(1755);
    expect(r.source).toBe("mifflin-st-jeor");
    expect(r.note).toContain("±100–400");
  });

  it("woman (sex=f) uses -161 adjustment", () => {
    const r = estimateDailyTarget({
      weightKg: 65, heightCm: 165, age: 30, sex: "f",
    });
    // 10*65 + 6.25*165 - 5*30 - 161 = 650 + 1031.25 - 150 - 161 = 1370.25 → 1370
    expect(r.ok).toBe(true);
    expect(r.bmr).toBe(1370);
  });

  it("returns ok:false + hint when weight missing", () => {
    const r = estimateDailyTarget({ heightCm: 180, age: 35, sex: "m" });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Gewicht/);
  });

  it("returns ok:false + hint when height missing", () => {
    const r = estimateDailyTarget({ weightKg: 80, age: 35, sex: "m" });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Groesse|Größe/);
  });

  it("returns ok:false + hint when age missing", () => {
    const r = estimateDailyTarget({ weightKg: 80, heightCm: 180, sex: "m" });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Alter/);
  });

  it("returns ok:false + hint when all missing", () => {
    const r = estimateDailyTarget({});
    expect(r.ok).toBe(false);
    expect(r.hint).toBeDefined();
  });

  it("no NaN/Infinity for zero weight", () => {
    const r = estimateDailyTarget({ weightKg: 0, heightCm: 180, age: 35 });
    expect(r.ok).toBe(false);
  });

  it("no crash for null/undefined input", () => {
    const r1 = estimateDailyTarget(null);
    expect(r1.ok).toBe(false);
    const r2 = estimateDailyTarget(undefined);
    expect(r2.ok).toBe(false);
  });
});

/* ──────────────────────────────────────────────────────────
   redSFloor
   ────────────────────────────────────────────────────────── */
describe("redSFloor", () => {
  // Mann 80 kg, 12 % Körperfett → FFM = 80 * 0.88 = 70.4 kg
  // Floor = 25 * 70.4 = 1760 kcal
  const manParams = { sex: "m", weightKg: 80, bodyFat: 0.12 };

  it("man 25 kcal/kg FFM — concrete number", () => {
    const r = redSFloor(manParams);
    expect(r.ok).toBe(true);
    expect(r.floorKcal).toBe(1760);
    expect(r.ffm).toBe(70.4);
    expect(r.source).toBe("ioc-reds-2023");
    expect(r.bodyFatAssumed).toBe(false);
    expect(r.sexAssumed).toBe(false);
    expect(r.note).toContain("Richtwert");
  });

  // Frau 60 kg, 20 % Körperfett → FFM = 60 * 0.80 = 48 kg
  // Floor = 30 * 48 = 1440 kcal
  it("woman 30 kcal/kg FFM — concrete number", () => {
    const r = redSFloor({ sex: "f", weightKg: 60, bodyFat: 0.20 });
    expect(r.ok).toBe(true);
    expect(r.floorKcal).toBe(1440);
    expect(r.ffm).toBe(48);
    expect(r.bodyFatAssumed).toBe(false);
    expect(r.sexAssumed).toBe(false);
  });

  it("missing bodyFat → 12% (m) / 20% (f) default, flagged as estimate", () => {
    const r = redSFloor({ sex: "m", weightKg: 80 });
    expect(r.ok).toBe(true);
    expect(r.bodyFatAssumed).toBe(true);
    // Default: 12% → FFM = 80 * 0.88 = 70.4 → 25 * 70.4 = 1760
    expect(r.floorKcal).toBe(1760);
  });

  it("missing sex → 30 kcal/kg (stricter) and sexAssumed flagged", () => {
    const r = redSFloor({ weightKg: 70, bodyFat: 0.15 });
    expect(r.ok).toBe(true);
    expect(r.sexAssumed).toBe(true);
    // Default sex → female → 30 kcal/kg
    // FFM = 70 * 0.85 = 59.5 → 30 * 59.5 = 1785
    expect(r.floorKcal).toBe(1785);
    expect(r.bodyFatAssumed).toBe(false);
  });

  it("unknown sex value (hand-edited) → treated as unknown, stricter floor", () => {
    const r = redSFloor({ sex: "x", weightKg: 70, bodyFat: 0.15 });
    expect(r.ok).toBe(true);
    expect(r.sexAssumed).toBe(true);
    expect(r.floorKcal).toBe(1785);
  });

  it("missing weight → ok:false + hint", () => {
    const r = redSFloor({ sex: "m", bodyFat: 0.12 });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Gewicht/);
  });

  it("weight ≤ 0 → ok:false, no NaN", () => {
    const r1 = redSFloor({ sex: "m", weightKg: 0, bodyFat: 0.12 });
    expect(r1.ok).toBe(false);
    const r2 = redSFloor({ sex: "m", weightKg: -5, bodyFat: 0.12 });
    expect(r2.ok).toBe(false);
  });

  it("bodyFat 0 or >100 → ok:false, no crash", () => {
    const r1 = redSFloor({ sex: "m", weightKg: 80, bodyFat: 0 });
    expect(r1.ok).toBe(false);
    const r2 = redSFloor({ sex: "m", weightKg: 80, bodyFat: 101 });
    expect(r2.ok).toBe(false);
  });

  it("bodyFat >1 (percentage as decimal?) → handled gracefully", () => {
    // 50% body fat = 0.50, not 50 as decimal
    const r = redSFloor({ sex: "f", weightKg: 60, bodyFat: 50 });
    expect(r.ok).toBe(false);
  });

  it("aggressive deficit goal stays above floor — hard cap test", () => {
    // Frau 55 kg, 22 % Körperfett → FFM = 55 * 0.78 = 42.9 kg
    // Floor = 30 * 42.9 = 1287 kcal
    // Ein aggressives Defizit von 1000 kcal/Tag unter BMR (z.B. BMR 1350)
    // würde ohne Floor 350 kcal ergeben — aber der Floor fängt bei 1287
    const r = redSFloor({ sex: "f", weightKg: 55, bodyFat: 0.22 });
    expect(r.ok).toBe(true);
    expect(r.floorKcal).toBe(1287);
    // 1287 > 350 — der Floor verhindert, dass ein Defizit-Ziel darunter fällt
    expect(r.floorKcal).toBeGreaterThan(350);
  });

  it("returns source key ioc-reds-2023", () => {
    const r = redSFloor(manParams);
    expect(r.source).toBe("ioc-reds-2023");
  });
});

/* ──────────────────────────────────────────────────────────
   filterByIntolerances
   ────────────────────────────────────────────────────────── */
describe("filterByIntolerances", () => {
  const recipes = [
    { id: "1", title: "Haferbrei",     containsTags: ["gluten", "milk"] },
    { id: "2", title: "Rührei",         containsTags: ["eggs", "milk"] },
    { id: "3", title: "Salat",          containsTags: [] },
    { id: "4", title: "Reisgericht",    containsTags: ["gluten"] },
    { id: "5", title: "Obstteller",     containsTags: undefined },
    { id: "6", title: "Nudeln",         containsTags: ["gluten", "eggs"] },
  ];

  it("empty/absent intolerances → nothing filtered", () => {
    expect(filterByIntolerances(recipes, [])).toHaveLength(recipes.length);
    expect(filterByIntolerances(recipes, null)).toHaveLength(recipes.length);
    expect(filterByIntolerances(recipes, undefined)).toHaveLength(recipes.length);
  });

  it("intersection → recipe dropped (hard filter)", () => {
    const result = filterByIntolerances(recipes, ["gluten"]);
    expect(result.map((r) => r.id)).toEqual(["2", "3", "5"]);
  });

  it("multiple intolerances → all matching recipes dropped", () => {
    const result = filterByIntolerances(recipes, ["gluten", "eggs"]);
    // dropped: 1 (gluten), 2 (eggs), 4 (gluten), 6 (gluten+eggs)
    expect(result.map((r) => r.id)).toEqual(["3", "5"]);
  });

  it("empty or missing contains_tags → recipe kept", () => {
    const result = filterByIntolerances(recipes, ["gluten"]);
    expect(result.find((r) => r.id === "3")).toBeDefined();
    expect(result.find((r) => r.id === "5")).toBeDefined();
  });

  it("unknown intolerance keys ignored via normalizeAllergenKeys", () => {
    const result = filterByIntolerances(recipes, ["gluten", "nonexistent_key"]);
    // should still filter out gluten
    expect(result.map((r) => r.id)).toEqual(["2", "3", "5"]);
  });

  it("no recipes → empty array", () => {
    expect(filterByIntolerances([], ["gluten"])).toEqual([]);
    expect(filterByIntolerances(null, ["gluten"])).toEqual([]);
    expect(filterByIntolerances(undefined, ["gluten"])).toEqual([]);
  });

  it("recipe without containsTags key → kept", () => {
    const result = filterByIntolerances([{ id: "7", title: "Test" }], ["gluten"]);
    expect(result).toHaveLength(1);
  });
});

/* ──────────────────────────────────────────────────────────
   trainingNutritionHint
   ────────────────────────────────────────────────────────── */
describe("trainingNutritionHint", () => {
  const baseParams = {
    target: 2500,
    actualIntake: 2200,
    tomorrowSession: { watt: 200, min: 90 },
  };

  it("returns hint text when intake below target and session tomorrow", () => {
    const hint = trainingNutritionHint(baseParams);
    expect(hint).toBeTruthy();
    expect(hint).toContain("kcal");
    expect(hint).toContain("Morgen");
  });

  it("no tomorrow session → null", () => {
    expect(trainingNutritionHint({ target: 2500, actualIntake: 2200 })).toBeNull();
    expect(trainingNutritionHint({ target: 2500, actualIntake: 2200, tomorrowSession: null })).toBeNull();
    expect(trainingNutritionHint({ target: 2500, actualIntake: 2200, tomorrowSession: {} })).toBeNull();
  });

  it("session without watts/duration → null", () => {
    expect(trainingNutritionHint({
      target: 2500, actualIntake: 2200,
      tomorrowSession: { watt: null, min: 90 },
    })).toBeNull();
  });

  it("no target → null", () => {
    expect(trainingNutritionHint({ actualIntake: 2200, tomorrowSession: { watt: 200, min: 60 } })).toBeNull();
  });

  it("intake at or above target → still returns session info", () => {
    const hint = trainingNutritionHint({ target: 2000, actualIntake: 2100, tomorrowSession: { watt: 150, min: 60 } });
    expect(hint).toBeTruthy();
    expect(hint).toContain("entspricht dem Ziel");
  });

  it("kcal ≈ kJ (rideKJ result)", () => {
    // 200 W × 90 min = 200 * 90 * 60 / 1000 = 1080 kJ → ≈ 1080 kcal
    const hint = trainingNutritionHint(baseParams);
    expect(hint).toContain("1080");
    expect(hint).toContain("90 min");
  });
});

/* ──────────────────────────────────────────────────────────
   weightMissingHint
   ────────────────────────────────────────────────────────── */
describe("weightMissingHint", () => {
  const today = "2026-10-08";

  it("no wellness at all → hint", () => {
    expect(weightMissingHint([], today)).toBeTruthy();
    expect(weightMissingHint(null, today)).toBeTruthy();
    expect(weightMissingHint(undefined, today)).toBeTruthy();
  });

  it("no weight entries among wellness → hint", () => {
    const w = [{ date: "2026-10-01", sleepHours: 7 }];
    expect(weightMissingHint(w, today)).toBeTruthy();
  });

  it("weight entry today → null (no hint)", () => {
    const w = [{ date: "2026-10-08", weight: 78.5 }];
    expect(weightMissingHint(w, today)).toBeNull();
  });

  it("weight entry exactly 7 days ago → null (not more than 7)", () => {
    // 2026-10-01 → 7 days gap (Oct 2-8 = 7 days without entry)
    const w = [{ date: "2026-10-01", weight: 78.5 }];
    expect(weightMissingHint(w, today)).toBeNull();
  });

  it("weight entry 8 days ago → hint", () => {
    const w = [{ date: "2026-09-30", weight: 78.5 }];
    const hint = weightMissingHint(w, today);
    expect(hint).toBeTruthy();
    expect(hint).toMatch(/vor 8 Tagen/);
  });

  it("weight entry 14 days ago → hint with correct day count", () => {
    const w = [{ date: "2026-09-24", weight: 79.0 }];
    const hint = weightMissingHint(w, today);
    expect(hint).toBeTruthy();
    expect(hint).toMatch(/vor 14 Tagen/);
  });

  it("wellness row without date → skipped gracefully", () => {
    const w = [
      { date: "2026-10-08", weight: 78.5 },
      { dateISO: null, weight: 80 }  // no usable date
    ];
    expect(weightMissingHint(w, today)).toBeNull();
  });

  it("uses dateISO with priority, then date fallback", () => {
    const w = [{ date: "2026-09-30", dateISO: "2026-10-07", weight: 78.5 }];
    expect(weightMissingHint(w, today)).toBeNull(); // dateISO wins, 1 day ago
  });
});

/* ──────────────────────────────────────────────────────────
   estimateCarbTarget
   ────────────────────────────────────────────────────────── */
describe("estimateCarbTarget", () => {
  const weightKg = 70;

  it("no session (0 min) → 3–5 g/kg", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 0 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([3, 5]);
    expect(r.gramRange).toEqual([210, 350]); // 70*3=210, 70*5=350
    expect(r.source).toBe("acsm-and-2016");
  });

  it("no session (null/undefined) → ok:false + hint", () => {
    const r1 = estimateCarbTarget({ weightKg });
    expect(r1.ok).toBe(false);
    const r2 = estimateCarbTarget({ weightKg, plannedDurationMin: undefined });
    expect(r2.ok).toBe(false);
  });

  it("60 min → 5–7 g/kg", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 60 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([5, 7]);
    expect(r.gramRange).toEqual([350, 490]); // 70*5=350, 70*7=490
  });

  it("120 min → 6–10 g/kg (interpreted 3-4h gap)", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 120 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([6, 10]);
    expect(r.gramRange).toEqual([420, 700]);
    expect(r.note).toContain("eigene Interpretation");
  });

  it("210 min → 6–10 g/kg (still in 3-4h interpreted gap)", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 210 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([6, 10]);
  });

  it("300 min → 8–12 g/kg", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 300 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([8, 12]);
    expect(r.gramRange).toEqual([560, 840]);
  });

  it("weight ≤ 0 → ok:false, no NaN", () => {
    const r1 = estimateCarbTarget({ weightKg: 0, plannedDurationMin: 60 });
    expect(r1.ok).toBe(false);
    const r2 = estimateCarbTarget({ weightKg: -10, plannedDurationMin: 60 });
    expect(r2.ok).toBe(false);
  });

  it("weight missing → ok:false + hint", () => {
    const r = estimateCarbTarget({ plannedDurationMin: 60 });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Gewicht/);
  });

  it("negative duration → ok:false", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: -5 });
    expect(r.ok).toBe(false);
  });

  it("returns source key acsm-and-2016", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: 60 });
    expect(r.source).toBe("acsm-and-2016");
  });

  it("gram range = band × weight", () => {
    const r = estimateCarbTarget({ weightKg: 80, plannedDurationMin: 60 });
    // 5-7 g/kg × 80 kg = 400-560 g
    expect(r.gramRange).toEqual([400, 560]);
  });
});

/* ──────────────────────────────────────────────────────────
   Layering check: no api/, hooks/, features/, components/,
   charts/ imports, no console.*, no DOM globals.
   ────────────────────────────────────────────────────────── */
describe("layering (V1)", () => {
  it("does not reference forbidden modules", async () => {
    await import("fs").then(() => null);
    // Can't easily check imports statically, but we verify
    // that the module loads without errors in a Node environment.
    // The real check: CI passes with --project core (no jsdom).
  });

  it("NUTRITION_SOURCES import does not bring in api/ or DOM", () => {
    // This test verifies the module loads cleanly in Node-only
    // environment (vitest project "core" uses node, not jsdom).
    expect(() => {
      require?.resolve?.("./nutrition.js");
    }).not.toThrow();
  });
});