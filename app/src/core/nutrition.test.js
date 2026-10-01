/* Tests: core/nutrition.js — Etappe E1+E2, Fahrplan 23 */
import { describe, it, expect } from "vitest";
import {
  estimateDailyTarget,
  estimateDailyGoal,
  redSFloor,
  filterByIntolerances,
  trainingNutritionHint,
  weightMissingHint,
  estimateCarbTarget,
  estimateBaselineExpenditure,
  paceToDailyKcal,
  ENERGY_PER_KG_BODY_MASS,
  NON_EXERCISE_PAL,
} from "./nutrition.js";

import {
  NUTRITION_SOURCES,
  SOURCE_BY_KEY,
  SOURCE_KEYS,
} from "./nutrition-sources.js";

/* ──────────────────────────────────────────────────────────
   Sources-Liste
   ────────────────────────────────────────────────────────── */
describe("core/nutrition-sources", () => {
  it("exports exactly 11 entries", () => {
    expect(NUTRITION_SOURCES).toHaveLength(11);
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
      "fao-who-unu-pal",
      "ioc-reds-2023",
      "mifflin-st-jeor",
      "neat-goshozono-2024",
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

  it("negative weight returns ok:false + hint", () => {
    const r = estimateDailyTarget({ weightKg: -80, heightCm: 180, age: 35, sex: "m" });
    expect(r.ok).toBe(false);
    expect(r.hint).toMatch(/Gewicht/);
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

  it("sex 'w' (outside 'm'/'f' schema) → treated as unknown, sexAssumed flag", () => {
    const r = redSFloor({ sex: "w", weightKg: 70, bodyFat: 0.15 });
    expect(r.ok).toBe(true);
    expect(r.sexAssumed).toBe(true);
    // 30 kcal/kg, FFM = 70*0.85 = 59.5 -> 30*59.5 = 1785
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
    // BMR (55kg, 165cm, 35y, f) = 10*55 + 6.25*165 - 5*35 - 161 =
    //   550 + 1031.25 - 175 - 161 = 1245.25 → 1245
    // Aggressives Defizit: 1.5 kg/Woche → paceToDailyKcal(1.5) ≈ 1650
    // target = 1245 - 1650 = -405 → durch Floor auf 1287 gecapped
    const r = estimateDailyGoal({
      profile: { weightKg: 55, heightCm: 165, age: 35, sex: "f", bodyFat: 0.22 },
      goal: { goalType: "lose", pacePerWeekKg: 1.5 },
    });
    expect(r.ok).toBe(true);
    expect(r.capped).toBe(true);
    expect(r.target).toBe(1287);
    expect(r.floor).toBe(1287);
    expect(r.note).toContain("begrenzt");
  });

  it("returns source key ioc-reds-2023", () => {
    const r = redSFloor(manParams);
    expect(r.source).toBe("ioc-reds-2023");
  });
});

/* -----------------------------------------------------------
   estimateDailyGoal
   ----------------------------------------------------------- */
describe("NON_EXERCISE_PAL", () => {
  it("equals 1.55 (FAO/WHO/UNU: Alltag ohne regelmaessigen Sport)", () => {
    expect(NON_EXERCISE_PAL).toBe(1.55);
  });
});

/* ──────────────────────────────────────────────────────────
   estimateBaselineExpenditure — Messung je Feld, sonst Schaetzung
   ────────────────────────────────────────────────────────── */
describe("estimateBaselineExpenditure", () => {
  const TODAY = "2026-10-15"; // Fenster: 2026-10-01 .. 2026-10-14 (ohne heute)
  const BMR = 1755;
  /** n Tage ab dem 2026-10-01 mit den gegebenen Feldern. */
  const days = (n, fields, start = 1) =>
    Array.from({ length: n }, (_, i) => ({
      dateISO: `2026-10-${String(start + i).padStart(2, "0")}`,
      ...fields,
    }));

  it("ohne Daten: Grundumsatz = Formel, Alltag = Grundumsatz x 0,55 (geschaetzt)", () => {
    const r = estimateBaselineExpenditure({ bmr: BMR });
    expect(r.restingKcal).toBe(1755);
    expect(r.activityKcal).toBe(965); // round(1755 x 0,55)
    expect(r.totalKcal).toBe(2720);
    expect(r.restingSource).toBe("formula");
    expect(r.activitySource).toBe("estimate");
  });

  it("kein todayISO oder wellness null -> Schaetzung, kein Absturz", () => {
    const noToday = estimateBaselineExpenditure({ bmr: BMR, wellness: days(10, { restingEnergy: 1800 }) });
    expect(noToday.restingSource).toBe("formula");
    const noWellness = estimateBaselineExpenditure({ bmr: BMR, wellness: null, todayISO: TODAY });
    expect(noWellness.restingSource).toBe("formula");
    expect(Number.isFinite(noWellness.totalKcal)).toBe(true);
  });

  it("Grundumsatz gemessen ab 7 Tagen mit Wert; der Alltag nutzt dann den gemessenen Grundumsatz", () => {
    const r = estimateBaselineExpenditure({
      bmr: BMR,
      wellness: days(7, { restingEnergy: 1800 }),
      todayISO: TODAY,
    });
    expect(r.restingKcal).toBe(1800);
    expect(r.restingSource).toBe("measured");
    expect(r.restingDays).toBe(7);
    expect(r.activityKcal).toBe(990); // round(1800 x 0,55), Alltag geschaetzt
    expect(r.totalKcal).toBe(2790);
  });

  it("nur 6 Tage mit Grundumsatz -> Formel", () => {
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness: days(6, { restingEnergy: 1800 }), todayISO: TODAY });
    expect(r.restingSource).toBe("formula");
    expect(r.restingKcal).toBe(1755);
  });

  it("unplausibler gemessener Grundumsatz (zu klein/gross) -> Formel", () => {
    for (const v of [100, 5000]) {
      const r = estimateBaselineExpenditure({ bmr: BMR, wellness: days(7, { restingEnergy: v }), todayISO: TODAY });
      expect(r.restingSource).toBe("formula");
    }
  });

  it("Alltag gemessen nur mit vollstaendiger Fahrten-Liste: activeEnergy 900 ohne Fahrten -> 900", () => {
    const r = estimateBaselineExpenditure({
      bmr: BMR,
      wellness: days(7, { activeEnergy: 900 }),
      rides: [],
      todayISO: TODAY,
    });
    expect(r.activitySource).toBe("measured");
    expect(r.activityKcal).toBe(900);
    expect(r.activityDays).toBe(7);
    expect(r.restingSource).toBe("formula"); // Grundumsatz nicht gemessen -> Formel
    expect(r.totalKcal).toBe(1755 + 900);
  });

  it("ohne rides-Liste bleibt der Alltag geschaetzt, auch wenn activeEnergy da ist (kein Doppelzaehlen)", () => {
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness: days(10, { activeEnergy: 900 }), todayISO: TODAY });
    expect(r.activitySource).toBe("estimate");
    expect(r.activityKcal).toBe(965);
  });

  it("Training wird aus activeEnergy herausgerechnet: 1000 - (200 W x 30 min = 360) = 640", () => {
    const wellness = days(7, { activeEnergy: 1000 });
    const rides = wellness.map((w) => ({ dateISO: w.dateISO, watt: 200, min: 30 }));
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness, rides, todayISO: TODAY });
    expect(r.activityKcal).toBe(640);
    expect(r.activitySource).toBe("measured");
  });

  it("Abzug wird bei 0 gedeckelt (Uhr schaetzt weniger als die Wattmessung)", () => {
    const wellness = days(7, { activeEnergy: 300 });
    const rides = wellness.map((w) => ({ dateISO: w.dateISO, watt: 200, min: 30 })); // 360 kJ > 300
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness, rides, todayISO: TODAY });
    expect(r.activityKcal).toBe(0);
  });

  it("heute und Tage ausserhalb des 14-Tage-Fensters zaehlen nicht", () => {
    const wellness = [
      ...days(6, { activeEnergy: 900 }),
      { dateISO: TODAY, activeEnergy: 5000 }, // heute: unvollstaendiger Tag
      { dateISO: "2026-09-30", activeEnergy: 5000 }, // 15 Tage vorher
    ];
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness, rides: [], todayISO: TODAY });
    expect(r.activityDays).toBe(6); // zu wenig -> Schaetzung
    expect(r.activitySource).toBe("estimate");
  });

  it("doppelte Datumseintraege zaehlen einmal; Zeilen ohne Datum werden ignoriert", () => {
    const wellness = [...days(6, { activeEnergy: 900 }), { dateISO: "2026-10-01", activeEnergy: 900 }, { activeEnergy: 900 }];
    const r = estimateBaselineExpenditure({ bmr: BMR, wellness, rides: [], todayISO: TODAY });
    expect(r.activityDays).toBe(6);
  });
});

/* ──────────────────────────────────────────────────────────
   estimateDailyGoal
   ────────────────────────────────────────────────────────── */
describe("estimateDailyGoal", () => {
  const validProfile = { weightKg: 80, heightCm: 180, age: 35, sex: "m", bodyFat: 0.12 };
  // BMR 1755, Alltag 965 (x 0,55) -> Grundlage 2720; Boden 1760 (FFM 70,4 x 25)
  const roomyProfile = { ...validProfile, bodyFat: 0.2 };
  // roomyProfile: FFM 64, Boden 1600

  it("ohne Ziel: Ziel = Grundlage (Grundumsatz + geschaetzter Alltag), Boden nicht erreicht", () => {
    const r = estimateDailyGoal({ profile: roomyProfile });
    expect(r.ok).toBe(true);
    expect(r.bmr).toBe(1755);
    expect(r.baseline.totalKcal).toBe(2720);
    expect(r.target).toBe(2720);
    expect(r.adjustment).toBe(0);
    expect(r.floor).toBe(1600);
    expect(r.capped).toBe(false);
    expect(r.source).toContain("mifflin-st-jeor");
    expect(r.source).toContain("fao-who-unu-pal");
    expect(r.note).toContain("2720");
    expect(r.note).toContain("geschaetzt");
  });

  it("Erhalt/unbekannter Zieltyp/ohne Tempo/Tempo 0 -> keine Anpassung", () => {
    for (const goal of [
      { goalType: "maintain" },
      { goalType: "lose" },
      { goalType: "lose", pacePerWeekKg: 0 },
      { goalType: "unknown", pacePerWeekKg: 0.5 },
    ]) {
      const r = estimateDailyGoal({ profile: roomyProfile, goal });
      expect(r.ok).toBe(true);
      expect(r.target).toBe(2720);
      expect(r.adjustment).toBe(0);
    }
  });

  it("abnehmen 0,5 kg/Woche: 2720 - 550 = 2170 (Boden 1600 nicht erreicht)", () => {
    const r = estimateDailyGoal({ profile: roomyProfile, goal: { goalType: "lose", pacePerWeekKg: 0.5 } });
    expect(r.adjustment).toBe(550);
    expect(r.target).toBe(2170);
    expect(r.capped).toBe(false);
    expect(r.source).toContain("7700-kcal-per-kg");
  });

  it("abnehmen 1,5 kg/Woche (1650 kcal Defizit): 2720 - 1650 = 1070 -> auf den Boden 1600 angehoben", () => {
    const r = estimateDailyGoal({ profile: roomyProfile, goal: { goalType: "lose", pacePerWeekKg: 1.5 } });
    expect(r.target).toBe(1600);
    expect(r.floor).toBe(1600);
    expect(r.capped).toBe(true);
    expect(r.source).toContain("ioc-reds-2023");
    expect(r.note).toContain("RED-S-Minimum");
  });

  it("zunehmen: goalType bestimmt das Vorzeichen, nicht das Vorzeichen des Tempos (+0,5 -> +550)", () => {
    const r = estimateDailyGoal({ profile: roomyProfile, goal: { goalType: "gain", pacePerWeekKg: 0.5 } });
    expect(r.adjustment).toBe(-550);
    expect(r.target).toBe(3270);
  });

  it("fehlendes Profil -> Hinweis; fehlendes Gewicht -> Hinweis; kein NaN", () => {
    expect(estimateDailyGoal({}).ok).toBe(false);
    const r = estimateDailyGoal({ profile: { heightCm: 180, age: 35, sex: "m" } });
    expect(r.ok).toBe(false);
    expect(r.hint).toBeTruthy();
  });

  it("nutzt gemessene Daten, wenn genug da sind (Grundumsatz 1800 gemessen, Alltag 900 gemessen)", () => {
    const wellness = Array.from({ length: 7 }, (_, i) => ({
      dateISO: `2026-10-${String(i + 1).padStart(2, "0")}`,
      restingEnergy: 1800,
      activeEnergy: 900,
    }));
    const r = estimateDailyGoal({ profile: roomyProfile, wellness, rides: [], todayISO: "2026-10-15" });
    expect(r.baseline.restingSource).toBe("measured");
    expect(r.baseline.activitySource).toBe("measured");
    expect(r.target).toBe(2700); // 1800 + 900
    expect(r.note).toContain("gemessen");
    expect(r.source).not.toContain("fao-who-unu-pal");
  });
});

describe("estimateDailyGoal — Boden gilt immer, fail-closed", () => {
  const validProfile = { weightKg: 80, heightCm: 180, age: 35, sex: "m", bodyFat: 0.12 };

  it("ungueltiger Koerperfett-Wert mit Defizit-Ziel -> kein Ziel, nur Hinweis (kein Defizit ohne Boden)", () => {
    const r = estimateDailyGoal({
      profile: { ...validProfile, bodyFat: 150 },
      goal: { goalType: "lose", pacePerWeekKg: 0.5 },
    });
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("Körperfett");
    expect(r.target).toBeUndefined();
  });

  it("ungueltiger Koerperfett-Wert ohne Ziel -> ebenfalls kein Ziel (Boden nicht berechenbar)", () => {
    const r = estimateDailyGoal({ profile: { ...validProfile, bodyFat: -0.1 } });
    expect(r.ok).toBe(false);
    expect(r.hint).toContain("Körperfett");
  });

  it("der Boden wird immer berechnet und geliefert, auch ohne Defizit", () => {
    const r = estimateDailyGoal({ profile: validProfile });
    expect(r.floor).toBe(1760); // FFM 70,4 x 25
    expect(r.note).toContain("RED-S-Minimum");
  });

  it("fehlendes Geschlecht und Koerperfett -> strengerer Boden (30) und beide Annahmen gekennzeichnet", () => {
    const r = estimateDailyGoal({ profile: { weightKg: 80, heightCm: 180, age: 35 } });
    expect(r.ok).toBe(true);
    expect(r.sexAssumed).toBe(true);
    expect(r.bodyFatAssumed).toBe(true);
    expect(r.floor).toBe(1920); // 80 kg x (1 - 0,20) x 30
  });

  it("gemessenes Geschlecht und Koerperfett -> keine Annahme gekennzeichnet", () => {
    const r = estimateDailyGoal({ profile: validProfile });
    expect(r.sexAssumed).toBe(false);
    expect(r.bodyFatAssumed).toBe(false);
  });
});

describe("estimateDailyGoal — Trainingsenergie der geplanten Einheit", () => {
  const profile = { weightKg: 80, heightCm: 180, age: 35, sex: "m", bodyFat: 0.2 }; // Boden 1600

  it("ohne Einheit: trainingKcal 0", () => {
    const r = estimateDailyGoal({ profile });
    expect(r.trainingKcal).toBe(0);
    expect(r.target).toBe(2720);
  });

  it("200 W x 60 min = 720 kJ -> +720 kcal auf das Ziel", () => {
    const r = estimateDailyGoal({ profile, session: { watt: 200, min: 60 } });
    expect(r.trainingKcal).toBe(720);
    expect(r.target).toBe(2720 + 720);
    expect(r.note).toContain("Training +720");
  });

  it("Training und Defizit werden verrechnet: 2720 + 720 - 550 = 2890", () => {
    const r = estimateDailyGoal({
      profile,
      goal: { goalType: "lose", pacePerWeekKg: 0.5 },
      session: { watt: 200, min: 60 },
    });
    expect(r.target).toBe(2890);
    expect(r.capped).toBe(false);
  });

  it("unvollstaendige oder unsinnige Einheit -> 0, nie NaN", () => {
    for (const session of [{ watt: 200 }, { min: 60 }, { watt: -50, min: 60 }, {}, null]) {
      const r = estimateDailyGoal({ profile, session });
      expect(r.ok).toBe(true);
      expect(r.trainingKcal).toBe(0);
      expect(Number.isFinite(r.target)).toBe(true);
    }
  });

  it("der Boden gilt auch mit Training (Defizit darf nie unter den Boden fuehren)", () => {
    const r = estimateDailyGoal({
      profile: { ...profile, bodyFat: 0.12 }, // Boden 1760
      goal: { goalType: "lose", pacePerWeekKg: 1.5 }, // 1650 kcal Defizit
      session: { watt: 100, min: 30 }, // 180 kcal
    });
    // 2720 + 180 - 1650 = 1250 -> auf Boden 1760 angehoben
    expect(r.target).toBe(1760);
    expect(r.capped).toBe(true);
  });
});

describe("Quellen-Schluessel bleiben synchron (kein Drift)", () => {
  it("jeder Wert in SOURCE_KEYS existiert in der Quellenliste", () => {
    for (const key of Object.values(SOURCE_KEYS)) {
      expect(SOURCE_BY_KEY.has(key)).toBe(true);
    }
  });

  it("jeder von nutrition.js zurueckgegebene Quellen-Schluessel existiert in der Quellenliste", () => {
    const profile = { weightKg: 80, heightCm: 180, age: 35, sex: "m", bodyFat: 0.12 };
    const keys = [
      estimateDailyTarget(profile).source,
      redSFloor({ sex: "m", weightKg: 80, bodyFat: 0.12 }).source,
      estimateCarbTarget({ weightKg: 70, plannedDurationMin: 90 }).source,
      ...estimateDailyGoal({ profile, goal: { goalType: "lose", pacePerWeekKg: 0.5 } }).source,
    ];
    for (const key of keys) {
      expect(SOURCE_BY_KEY.has(key)).toBe(true);
    }
  });
});

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

  it("no session (null/undefined) → treated as rest day (3-5 g/kg)", () => {
    const r1 = estimateCarbTarget({ weightKg });
    expect(r1.ok).toBe(true);
    expect(r1.band).toEqual([3, 5]);
    expect(r1.gramRange).toEqual([210, 350]);
    expect(r1.note).toContain("Ruhetag");
    const r2 = estimateCarbTarget({ weightKg, plannedDurationMin: undefined });
    expect(r2.ok).toBe(true);
    expect(r2.band).toEqual([3, 5]);
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

  it("negative duration → treated as rest day (3-5 g/kg)", () => {
    const r = estimateCarbTarget({ weightKg, plannedDurationMin: -5 });
    expect(r.ok).toBe(true);
    expect(r.band).toEqual([3, 5]);
    expect(r.note).toContain("Ruhetag");
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
  it("nutrition.js imports only from core/ (no api/, hooks/, etc.)", () => {
    // Statische Regression: source auf unerlaubte Importe scannen
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "nutrition.js"),
      "utf-8"
    );
    const importLines = src.match(/import\s+.*\s+from\s+"([^"]+)"/g) || [];
    const forbidden = ["api/", "hooks/", "features/", "components/", "charts/"];
    for (const line of importLines) {
      for (const frag of forbidden) {
        expect(line).not.toContain(frag);
      }
    }
    // Ausserdem muessen alle Imports mit ./ oder ../ beginnen (core/ oder types.js)
    for (const line of importLines) {
      const m = line.match(/from\s+"([^"]+)"/);
      if (m) {
        expect(m[1]).toMatch(/^\.\.?\//);
      }
    }
  });

  it("no console.* or DOM globals in nutrition.js", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "nutrition.js"),
      "utf-8"
    );
    // Pruefe auf tatsaechliche Nutzung (nicht blosse Erwaehnung in Kommentaren)
    expect(src).not.toMatch(/console\.(log|warn|error|debug|info|trace)/);
    expect(src).not.toMatch(/\bdocument\s*[.(]/);
    expect(src).not.toMatch(/\bwindow\s*[.(]/);
    expect(src).not.toMatch(/\blocalStorage\s*[.(]/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  it("nutrition-sources.js imports nothing from the module tree", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "nutrition-sources.js"),
      "utf-8"
    );
    const importLines = src.match(/import\s+.*\s+from\s+"([^"]+)"/g) || [];
    expect(importLines).toHaveLength(0);
  });
});