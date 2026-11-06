/* Tests: core/nutrition.js — zielgesteuerte Ernährung (Fahrplan 43, E6).
   Eigene Datei, damit nutrition.test.js unverändert bleibt (harte Grenze:
   ohne aktives Ziel „Fett verlieren“ rechnet alles wie zuvor). Alle Zahlen
   sind erfunden. */
import { describe, it, expect } from "vitest";
import {
  estimateDailyGoal,
  paceToDailyKcal,
  maxPacePerWeekKg,
  proteinRangeG,
  deficitLoadWarning,
  STRICT_FLOOR_KCAL_PER_KG_FFM,
  STRICT_WARN_UPPER_KCAL_PER_KG_FFM,
  DEFICIT_LOAD_TSS_FACTOR,
} from "./nutrition.js";

// FFM 64 kg, Grundlage 2957 kcal (wie in nutrition.test.js), strenger Boden 30 x 64 = 1920
const measured = { weightKg: 80, heightCm: 180, age: 35, sex: "m", bodyFat: 0.2 };
const unmeasured = { ...measured, bodyFat: null };
const lose = (pacePerWeekKg) => ({ goalType: "lose", pacePerWeekKg });
const fat = (extra = {}) => ({ fatLoss: true, hardDay: false, hardTomorrow: false, ...extra });

describe("estimateDailyGoal — ohne Zielkontext exakt wie zuvor", () => {
  it("liefert dasselbe Ergebnis ohne Feld, mit undefined und mit fatLoss:false", () => {
    const base = estimateDailyGoal({ profile: measured, goal: lose(0.3) });
    expect(estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: undefined })).toEqual(base);
    expect(estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: { fatLoss: false } })).toEqual(base);
    expect(estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: null })).toEqual(base);
  });

  it("trägt ohne Kontext keine der neuen Felder", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3) });
    for (const key of ["deficitBlockedReason", "nextDayUnknown", "eaWarn", "paceCapped", "strictFloor"]) {
      expect(r).not.toHaveProperty(key);
    }
  });

  it("lässt ein hohes Tempo ohne Kontext unangetastet (kein Deckel)", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.9) });
    expect(r.adjustment).toBe(paceToDailyKcal(0.9));
  });
});

describe("estimateDailyGoal — strenger Boden bei Fett verlieren", () => {
  it("benennt die Konstanten (eigene Festlegung)", () => {
    expect(STRICT_FLOOR_KCAL_PER_KG_FFM).toBe(30);
    expect(STRICT_WARN_UPPER_KCAL_PER_KG_FFM).toBe(45);
  });

  it("setzt den Boden für Männer auf 30 statt 25 kcal/kg Magermasse", () => {
    const plain = estimateDailyGoal({ profile: measured });
    const strict = estimateDailyGoal({ profile: measured, goalContext: fat() });
    expect(plain.floor).toBe(1600);
    expect(strict.floor).toBe(1920);
    expect(strict.eaFloorKcal).toBe(1920);
    expect(strict.strictFloor).toBe(true);
  });

  it("zählt den Trainingsverbrauch wie heute oben drauf", () => {
    const strict = estimateDailyGoal({
      profile: measured,
      session: { watt: 200, min: 60 },
      goalContext: fat(),
    });
    expect(strict.floor).toBe(1920 + strict.trainingKcal);
    expect(strict.trainingKcal).toBeGreaterThan(0);
  });

  it("kennzeichnet den Warnbereich 30 bis 45 kcal/kg Magermasse", () => {
    const inRange = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat() });
    // (2957 - 330) / 64 = 41 -> im Warnbereich
    expect(inRange.eaWarn).toBe(true);
    const above = estimateDailyGoal({ profile: measured, goalContext: fat() });
    // 2957 / 64 = 46,2 -> darüber
    expect(above.eaWarn).toBe(false);
  });

  it("rechnet bei fehlendem Körperfett mit dem bisherigen Boden (kein Standardwert für den strengen)", () => {
    const plain = estimateDailyGoal({ profile: unmeasured });
    const strict = estimateDailyGoal({ profile: unmeasured, goalContext: fat() });
    expect(strict.floor).toBe(plain.floor);
    expect(strict.strictFloor).toBe(false);
    expect(strict.eaWarn).toBe(false);
  });
});

describe("estimateDailyGoal — kein Defizit ohne gemessenes Körperfett", () => {
  it("rechnet wie „halten“ und nennt den Grund", () => {
    const hold = estimateDailyGoal({ profile: unmeasured, goal: { goalType: "maintain" } });
    const r = estimateDailyGoal({ profile: unmeasured, goal: lose(0.3), goalContext: fat() });
    expect(r.adjustment).toBe(0);
    expect(r.target).toBe(hold.target);
    expect(r.deficitBlockedReason).toBe("no-body-fat");
  });

  it("lässt mit gemessenem Körperfett das Defizit zu", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat() });
    expect(r.adjustment).toBe(paceToDailyKcal(0.3));
    expect(r.deficitBlockedReason).toBeNull();
  });

  it("nennt keinen Grund, wenn es ohnehin kein Defizit gäbe", () => {
    const r = estimateDailyGoal({ profile: unmeasured, goal: { goalType: "maintain" }, goalContext: fat() });
    expect(r.deficitBlockedReason).toBeNull();
  });
});

describe("estimateDailyGoal — kein Defizit vor harten Tagen", () => {
  it("streicht das Defizit am Tag der harten Einheit", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat({ hardDay: true }) });
    expect(r.adjustment).toBe(0);
    expect(r.deficitBlockedReason).toBe("hard-day");
  });

  it("streicht das Defizit am Tag vor der harten Einheit", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat({ hardTomorrow: true }) });
    expect(r.adjustment).toBe(0);
    expect(r.deficitBlockedReason).toBe("hard-day");
  });

  it("behält das Defizit an normalen Tagen", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat() });
    expect(r.adjustment).toBe(paceToDailyKcal(0.3));
    expect(r.nextDayUnknown).toBe(false);
  });

  it("behält das Defizit und meldet es, wenn der Folgetag unbekannt ist", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat({ hardTomorrow: null }) });
    expect(r.adjustment).toBe(paceToDailyKcal(0.3));
    expect(r.nextDayUnknown).toBe(true);
  });

  it("meldet „Folgetag unbekannt“ nicht, wenn es kein Defizit gibt", () => {
    const r = estimateDailyGoal({ profile: measured, goalContext: fat({ hardTomorrow: null }) });
    expect(r.nextDayUnknown).toBe(false);
  });
});

describe("estimateDailyGoal — Tempo-Deckel gegen das aktuelle Gewicht", () => {
  it("kürzt ein zu hohes gespeichertes Tempo auf den Deckel und meldet es", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.9), goalContext: fat() });
    expect(r.adjustment).toBe(paceToDailyKcal(0.4));
    expect(r.paceCapped).toBe(true);
  });

  it("lässt ein Tempo im Rahmen unverändert", () => {
    const r = estimateDailyGoal({ profile: measured, goal: lose(0.3), goalContext: fat() });
    expect(r.paceCapped).toBe(false);
  });
});

describe("maxPacePerWeekKg", () => {
  it("rechnet 0,5 % des Gewichts, abgerundet auf 0,05 kg", () => {
    expect(maxPacePerWeekKg(70)).toBe(0.35);
    expect(maxPacePerWeekKg(80)).toBe(0.4);
    expect(maxPacePerWeekKg(70.3)).toBe(0.35);
    expect(maxPacePerWeekKg(69.9)).toBe(0.3);
  });

  it("liefert null ohne brauchbares Gewicht", () => {
    for (const v of [null, undefined, 0, -5, NaN, "70", 5]) {
      expect(maxPacePerWeekKg(v)).toBeNull();
    }
  });
});

describe("proteinRangeG", () => {
  it("rechnet den Gramm-Bereich aus g/kg und Gewicht", () => {
    expect(proteinRangeG({ min: 1.8, max: 2.2 }, 70)).toEqual({ min: 126, max: 154 });
  });

  it("liefert null ohne Bereich oder Gewicht", () => {
    expect(proteinRangeG(null, 70)).toBeNull();
    expect(proteinRangeG({ min: 1.8, max: 2.2 }, null)).toBeNull();
    expect(proteinRangeG({ min: 1.8, max: 2.2 }, 0)).toBeNull();
    expect(proteinRangeG({ min: "x", max: 2.2 }, 70)).toBeNull();
  });
});

describe("deficitLoadWarning", () => {
  it("benennt die Schwelle (eigene Festlegung)", () => {
    expect(DEFICIT_LOAD_TSS_FACTOR).toBe(7.5);
  });

  it("warnt bei Defizit und Wochenlast über CTL x Faktor", () => {
    const r = deficitLoadWarning({ deficitActive: true, weekPlannedTss: 400, ctl: 50 });
    expect(r.warn).toBe(true);
    expect(r.text).not.toBe("");
  });

  it("warnt nicht bei Wochenlast darunter oder genau auf der Schwelle", () => {
    expect(deficitLoadWarning({ deficitActive: true, weekPlannedTss: 300, ctl: 50 }).warn).toBe(false);
    expect(deficitLoadWarning({ deficitActive: true, weekPlannedTss: 375, ctl: 50 }).warn).toBe(false);
  });

  it("warnt nicht ohne Defizit, ohne CTL oder ohne Last", () => {
    expect(deficitLoadWarning({ deficitActive: false, weekPlannedTss: 900, ctl: 50 }).warn).toBe(false);
    expect(deficitLoadWarning({ deficitActive: true, weekPlannedTss: 900, ctl: null }).warn).toBe(false);
    expect(deficitLoadWarning({ deficitActive: true, weekPlannedTss: 0, ctl: 50 }).warn).toBe(false);
    expect(deficitLoadWarning({ deficitActive: true, weekPlannedTss: 900, ctl: 0 }).warn).toBe(false);
    expect(deficitLoadWarning(undefined).warn).toBe(false);
  });

  it("bleibt sachlich: kein Druck, keine Dringlichkeit, kein Lob", () => {
    const { text } = deficitLoadWarning({ deficitActive: true, weekPlannedTss: 400, ctl: 50 });
    expect(text).not.toMatch(/sofort|unbedingt|gefährlich|gut gemacht|stark|Diät|Krankheit/i);
  });
});
