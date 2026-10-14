/* Tests: nutrition-day-model — Gewichtsquelle (E30), Körperfett nur gemessen
 * (E34, Prozent → Dezimal), Ruhetag/Trainingstag, fehlende Angaben. */

import { describe, expect, it } from "vitest";
import type { NutritionGoal, PlanCard } from "../../api/types";
import {
  ageOn,
  buildNutritionDay,
  resolveWeight,
  sessionForDay,
  type NutritionDayInput,
} from "./nutrition-day-model";

const TODAY = "2026-10-14";

function card(partial: Partial<PlanCard> & { date: string }): PlanCard {
  return {
    id: "c1",
    sortOrder: 0,
    name: null,
    typ: null,
    km: null,
    durationMin: null,
    tssPlanned: null,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...partial,
  };
}

/** Ein steady-Block: Dauer in Sekunden, Intensität in % FTP. */
const steady = (durationS: number, pct: number) => ({
  steps: [{ kind: "steady", duration_s: durationS, target_pct_ftp: pct }],
});

/** Mann, 80 kg, 180 cm, 35 Jahre am Stichtag — ohne Körperfett → Ten-Haaf 1949 kcal. */
function input(patch: Partial<NutritionDayInput> = {}): NutritionDayInput {
  return {
    dateISO: TODAY,
    profile: { heightCm: 180, birthdate: "1991-01-15", weightKg: 80, sex: "m" },
    wellness: [],
    goal: null,
    cards: [],
    ftpWatts: 200,
    ...patch,
  };
}

describe("ageOn", () => {
  it("zählt volle Jahre: am Geburtstag schon, einen Tag davor noch nicht", () => {
    expect(ageOn("1991-10-14", TODAY)).toBe(35);
    expect(ageOn("1991-10-15", TODAY)).toBe(34);
  });

  it("liefert null bei fehlendem, ungültigem oder zukünftigem Geburtsdatum", () => {
    expect(ageOn(null, TODAY)).toBeNull();
    expect(ageOn("14.10.1991", TODAY)).toBeNull();
    expect(ageOn("2027-01-01", TODAY)).toBeNull();
  });
});

describe("resolveWeight (E30)", () => {
  it("nimmt den neuesten Wellness-Wert, wenn er höchstens 7 Tage alt ist", () => {
    const wellness = [
      { dateISO: "2026-10-07", weight: 79 },
      { dateISO: "2026-10-12", weight: 74.2 },
    ];
    expect(resolveWeight(wellness, 80, TODAY)).toEqual({ weightKg: 74.2, source: "wellness" });
  });

  it("genau 7 Tage alt zählt noch, 8 Tage nicht mehr", () => {
    expect(resolveWeight([{ dateISO: "2026-10-07", weight: 74 }], 80, TODAY)?.source).toBe("wellness");
    expect(resolveWeight([{ dateISO: "2026-10-06", weight: 74 }], 80, TODAY)).toEqual({
      weightKg: 80,
      source: "profile",
    });
  });

  it("ohne Wellness-Gewicht gilt das Profilgewicht; fehlt auch das → null", () => {
    expect(resolveWeight([], 80, TODAY)).toEqual({ weightKg: 80, source: "profile" });
    expect(resolveWeight([], null, TODAY)).toBeNull();
    expect(resolveWeight([{ dateISO: "2026-10-13", weight: null }], null, TODAY)).toBeNull();
  });

  it("ignoriert Wellness-Werte nach dem Stichtag und unsinnige Werte (0, negativ)", () => {
    const wellness = [
      { dateISO: "2026-10-20", weight: 70 },
      { dateISO: "2026-10-13", weight: 0 },
      { dateISO: "2026-10-12", weight: -5 },
    ];
    expect(resolveWeight(wellness, 80, TODAY)).toEqual({ weightKg: 80, source: "profile" });
  });

  it("liest auch das Feld `date`, wenn `dateISO` fehlt", () => {
    expect(resolveWeight([{ date: "2026-10-13", weight: 75 }], 80, TODAY)?.weightKg).toBe(75);
  });
});

describe("sessionForDay", () => {
  it("kein Karteneintrag = Ruhetag, nichts Unbekanntes", () => {
    expect(sessionForDay([], TODAY, 200)).toEqual({ session: null, unknown: false });
  });

  it("Watt aus der Workout-Struktur: 75 % von 200 W = 150 W", () => {
    const c = card({ date: TODAY, durationMin: 60, workoutStructure: steady(3600, 75) });
    expect(sessionForDay([c], TODAY, 200)).toEqual({ session: { watt: 150, min: 60 }, unknown: false });
  });

  it("Fallback auf den geplanten TSS: 50 TSS in 60 min → IF 0,707 → ca. 141 W", () => {
    const c = card({ date: TODAY, durationMin: 60, tssPlanned: 50 });
    const { session } = sessionForDay([c], TODAY, 200);
    expect(session?.min).toBe(60);
    expect(session?.watt).toBeCloseTo(141.42, 1);
  });

  it("ohne FTP oder ohne Intensitätsangabe: Einheit da, Energie unbekannt", () => {
    const withStructure = card({ date: TODAY, durationMin: 60, workoutStructure: steady(3600, 75) });
    expect(sessionForDay([withStructure], TODAY, null)).toEqual({ session: null, unknown: true });
    const bare = card({ date: TODAY, durationMin: 60 });
    expect(sessionForDay([bare], TODAY, 200)).toEqual({ session: null, unknown: true });
  });

  it("zählt weder abgesagte, noch fremde Tage, noch Lauf-Karten, noch Karten ohne Dauer", () => {
    const s = steady(3600, 75);
    const cards = [
      card({ date: TODAY, durationMin: 60, workoutStructure: s, cancelled: true }),
      card({ date: "2026-10-15", durationMin: 60, workoutStructure: s }),
      card({ date: TODAY, durationMin: 60, workoutStructure: s, sport: "run" }),
      card({ date: TODAY, durationMin: null, workoutStructure: s }),
    ];
    expect(sessionForDay(cards, TODAY, 200)).toEqual({ session: null, unknown: false });
  });

  it("zwei Karten am Tag werden energiegleich zu einer Einheit zusammengezogen", () => {
    const cards = [
      card({ id: "a", date: TODAY, durationMin: 60, workoutStructure: steady(3600, 75) }), // 150 W, 540 kJ
      card({ id: "b", date: TODAY, durationMin: 30, workoutStructure: steady(1800, 50) }), // 100 W, 180 kJ
    ];
    const { session } = sessionForDay(cards, TODAY, 200);
    expect(session?.min).toBe(90);
    expect(((session!.watt * session!.min * 60) / 1000)).toBeCloseTo(720, 5);
  });
});

describe("buildNutritionDay — fehlende Angaben", () => {
  it("ohne Profil fehlen alle drei Pflichtangaben", () => {
    expect(buildNutritionDay(input({ profile: null }))).toEqual({
      ok: false,
      missing: ["Gewicht", "Körpergröße", "Geburtsdatum"],
      hint: null,
    });
  });

  it("nennt genau die fehlenden Angaben", () => {
    const base = { heightCm: 180, birthdate: "1991-01-15", weightKg: 80, sex: "m" as const };
    const r1 = buildNutritionDay(input({ profile: { ...base, heightCm: null } }));
    expect(r1).toMatchObject({ ok: false, missing: ["Körpergröße"] });
    const r2 = buildNutritionDay(input({ profile: { ...base, birthdate: null } }));
    expect(r2).toMatchObject({ ok: false, missing: ["Geburtsdatum"] });
    const r3 = buildNutritionDay(input({ profile: { ...base, weightKg: null } }));
    expect(r3).toMatchObject({ ok: false, missing: ["Gewicht"] });
  });

  it("fehlendes Geschlecht ist KEINE fehlende Pflichtangabe", () => {
    const r = buildNutritionDay(
      input({ profile: { heightCm: 180, birthdate: "1991-01-15", weightKg: 80, sex: null } }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("buildNutritionDay — Ergebnis", () => {
  it("Ruhetag ohne Körperfett: Ten-Haaf, Grundumsatz 1949, kein Datum, keine Hinweise", () => {
    const r = buildNutritionDay(input());
    expect(r).toMatchObject({
      ok: true,
      formula: "ten-haaf-2014",
      bmr: 1949,
      bodyFatDate: null,
      hints: [],
      trainingKcal: 0,
      trainingUnknown: false,
      weightKg: 80,
      weightSource: "profile",
      sexAssumed: false,
    });
    if (r.ok) expect(r.floor).toBe(1760); // Standard-Körperfett 12 % → FFM 70,4 × 25
  });

  it("gemessenes Körperfett (Prozent!) → Cunningham, Datum aus der Wellness", () => {
    const r = buildNutritionDay(input({ wellness: [{ dateISO: "2026-10-10", bodyFat: 12 }] }));
    // 500 + 22 × 80 × (1 − 0,12) = 2048,8 → 2049 (wäre 12 als Dezimal gelesen worden, gäbe es keinen Treffer)
    expect(r).toMatchObject({ ok: true, formula: "cunningham-1980", bmr: 2049, bodyFatDate: "2026-10-10" });
  });

  it("Körperfett hat keine Frist: auch ein alter gemessener Wert zählt (E34)", () => {
    const r = buildNutritionDay(input({ wellness: [{ dateISO: "2026-03-01", bodyFat: 12 }] }));
    expect(r).toMatchObject({ ok: true, formula: "cunningham-1980", bodyFatDate: "2026-03-01" });
  });

  it("nimmt den NEUESTEN gemessenen Körperfett-Wert", () => {
    const r = buildNutritionDay(
      input({
        wellness: [
          { dateISO: "2026-09-01", bodyFat: 20 },
          { dateISO: "2026-10-01", bodyFat: 12 },
        ],
      }),
    );
    expect(r).toMatchObject({ bmr: 2049, bodyFatDate: "2026-10-01" });
  });

  it("unplausibles Körperfett (60 %) → Ten-Haaf plus Hinweis, kein Datum", () => {
    const r = buildNutritionDay(input({ wellness: [{ dateISO: "2026-10-10", bodyFat: 60 }] }));
    expect(r).toMatchObject({ ok: true, formula: "ten-haaf-2014", bodyFatDate: null });
    if (r.ok) expect(r.hints).toContain("Körperfett-Wert passt nicht zu Gewicht und Größe, bitte prüfen");
  });

  it("unbekanntes Geschlecht: sexAssumed und der Formel-Hinweis", () => {
    const r = buildNutritionDay(
      input({ profile: { heightCm: 180, birthdate: "1991-01-15", weightKg: 80, sex: null } }),
    );
    expect(r).toMatchObject({ ok: true, sexAssumed: true });
    if (r.ok) expect(r.hints).toContain("Geschlecht fehlt, Schätzung ungenauer");
  });

  it("Trainingstag: Energie der Einheit kommt auf das Ziel (75 % von 200 W, 60 min = 540 kcal)", () => {
    const c = card({ date: TODAY, durationMin: 60, workoutStructure: steady(3600, 75) });
    const rest = buildNutritionDay(input());
    const day = buildNutritionDay(input({ cards: [c] }));
    expect(day).toMatchObject({ ok: true, trainingKcal: 540, trainingUnknown: false });
    if (day.ok && rest.ok) expect(day.target).toBe(rest.target + 540);
  });

  it("Einheit ohne FTP: trainingUnknown, Energie 0 — kein stilles 'Ruhetag'", () => {
    const c = card({ date: TODAY, durationMin: 60, workoutStructure: steady(3600, 75) });
    const r = buildNutritionDay(input({ cards: [c], ftpWatts: null }));
    expect(r).toMatchObject({ ok: true, trainingKcal: 0, trainingUnknown: true });
  });

  it("Gewichtsquelle Wellness fließt in die Rechnung ein", () => {
    const r = buildNutritionDay(input({ wellness: [{ dateISO: "2026-10-13", weight: 74 }] }));
    expect(r).toMatchObject({ ok: true, weightKg: 74, weightSource: "wellness" });
  });

  it("Abnehm-Ziel senkt das Ziel um das Defizit (0,5 kg/Woche = 550 kcal)", () => {
    const goal: NutritionGoal = {
      id: "g1",
      profileId: "p1",
      goalType: "lose",
      targetWeightKg: 75,
      pacePerWeekKg: 0.5,
      targetDate: null,
      createdAt: "2026-10-01T00:00:00Z",
    };
    const base = buildNutritionDay(input());
    const lose = buildNutritionDay(input({ goal }));
    if (!base.ok || !lose.ok) throw new Error("erwartet ok");
    expect(lose.target).toBe(base.target - 550);
  });
});
