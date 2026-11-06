/* Tests: nutrition-day-model mit Zielprofil (Fahrplan 43, E6).
 * Eigene Datei, damit nutrition-day-model.test.ts unverändert bleibt.
 * Alle Werte sind erfunden. Ohne `goals` gibt es kein `goalInfo`. */

import { describe, expect, it } from "vitest";
import type { NutritionGoal, PlanCard } from "../../api/types";
import { buildNutritionDay, type NutritionDayInput } from "./nutrition-day-model";

const TODAY = "2026-10-14";
const TOMORROW = "2026-10-15";

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

const lose = (pacePerWeekKg: number): NutritionGoal => ({
  id: "g1",
  profileId: "p1",
  goalType: "lose",
  targetWeightKg: null,
  pacePerWeekKg,
  targetDate: null,
  createdAt: "2026-10-01T00:00:00Z",
});

const BODY_FAT_20 = [{ dateISO: "2026-10-10", bodyFat: 20 }];
const FAT = { fatLoss: true, protein: null, carbs: null };

function input(patch: Partial<NutritionDayInput> = {}): NutritionDayInput {
  return {
    dateISO: TODAY,
    profile: { heightCm: 180, birthdate: "1991-01-15", weightKg: 80, sex: "m" },
    wellness: BODY_FAT_20,
    goal: lose(0.3),
    cards: [],
    ftpWatts: 200,
    ...patch,
  };
}

function ok(day: ReturnType<typeof buildNutritionDay>) {
  if (!day.ok) throw new Error("Tagesziel erwartet");
  return day;
}

describe("buildNutritionDay ohne Zielprofil", () => {
  it("trägt kein goalInfo und rechnet wie zuvor", () => {
    const plain = ok(buildNutritionDay(input()));
    expect("goalInfo" in plain).toBe(false);
    const withNull = ok(buildNutritionDay(input({ goals: null })));
    expect(withNull).toEqual(plain);
    const notFat = ok(buildNutritionDay(input({ goals: { fatLoss: false, protein: null, carbs: null } })));
    expect(notFat.target).toBe(plain.target);
    expect(notFat.floor).toBe(plain.floor);
  });
});

describe("buildNutritionDay mit Ziel Fett verlieren", () => {
  it("setzt den strengen Boden bei gemessenem Körperfett", () => {
    const day = ok(buildNutritionDay(input({ goals: FAT })));
    expect(day.floor).toBe(1920); // 30 x FFM 64
    expect(day.goalInfo?.strictFloor).toBe(true);
  });

  it("streicht das Defizit ohne gemessenes Körperfett und nennt den Grund", () => {
    const hold = ok(buildNutritionDay(input({ wellness: [], goal: { ...lose(0.3), goalType: "maintain" } })));
    const day = ok(buildNutritionDay(input({ wellness: [], goals: FAT })));
    expect(day.target).toBe(hold.target);
    expect(day.goalInfo?.deficitBlockedReason).toBe("no-body-fat");
  });

  it("streicht das Defizit am Tag einer harten Einheit", () => {
    const easy = ok(buildNutritionDay(input({ goals: FAT, cards: [card({ date: TOMORROW, typ: "Z2 Lang" })] })));
    const hard = ok(
      buildNutritionDay(
        input({
          goals: FAT,
          cards: [card({ date: TODAY, typ: "Schwelle", durationMin: 60, tssPlanned: 70 }), card({ date: TOMORROW, typ: "Z2 Lang" })],
        }),
      ),
    );
    expect(easy.goalInfo?.deficitBlockedReason).toBeNull();
    expect(hard.goalInfo?.deficitBlockedReason).toBe("hard-day");
  });

  it("streicht das Defizit am Tag vor einer harten Einheit", () => {
    const day = ok(
      buildNutritionDay(input({ goals: FAT, cards: [card({ date: TOMORROW, typ: "VO2max", durationMin: 60, tssPlanned: 80 })] })),
    );
    expect(day.goalInfo?.deficitBlockedReason).toBe("hard-day");
  });

  it("ignoriert abgesagte harte Karten", () => {
    const day = ok(
      buildNutritionDay(
        input({ goals: FAT, cards: [card({ date: TOMORROW, typ: "VO2max", cancelled: true }), card({ date: TOMORROW, typ: "Z2" })] }),
      ),
    );
    expect(day.goalInfo?.deficitBlockedReason).toBeNull();
  });

  it("behält das Defizit und meldet es, wenn für den Folgetag nichts im Plan steht", () => {
    const day = ok(buildNutritionDay(input({ goals: FAT, cards: [] })));
    expect(day.goalInfo?.nextDayUnknown).toBe(true);
    expect(day.goalInfo?.deficitBlockedReason).toBeNull();
  });

  it("gilt der Folgetag als bekannt, sobald der Plan über heute hinausreicht", () => {
    const day = ok(buildNutritionDay(input({ goals: FAT, cards: [card({ date: "2026-10-16", typ: "Z2" })] })));
    expect(day.goalInfo?.nextDayUnknown).toBe(false);
  });

  it("rechnet den Eiweiß-Bereich in Gramm", () => {
    const day = ok(buildNutritionDay(input({ goals: { fatLoss: true, protein: { min: 1.8, max: 2.2 }, carbs: null } })));
    expect(day.goalInfo?.proteinG).toEqual({ min: 144, max: 176 });
  });

  it("lässt den Eiweiß-Bereich weg, wenn das Profil keinen liefert", () => {
    const day = ok(buildNutritionDay(input({ goals: FAT })));
    expect(day.goalInfo?.proteinG).toBeNull();
  });
});

describe("buildNutritionDay — Kohlenhydrate über estimateCarbTarget", () => {
  const ride = (date: string, typ: string) => card({ date, typ, durationMin: 90, tssPlanned: 80 });

  it("followLoad zeigt das Band zur Dauer der Tageseinheit", () => {
    const day = ok(
      buildNutritionDay(
        input({ goals: { fatLoss: false, protein: null, carbs: { followLoad: true } }, cards: [ride(TODAY, "Z2 Lang")] }),
      ),
    );
    // 90 min -> Band 6-10 g/kg bei 80 kg
    expect(day.goalInfo?.carbsG).toEqual([480, 800]);
  });

  it("followLoad zeigt ohne Einheit das Ruhetag-Band", () => {
    const day = ok(buildNutritionDay(input({ goals: { fatLoss: false, protein: null, carbs: { followLoad: true } } })));
    expect(day.goalInfo?.carbsG).toEqual([240, 400]);
  });

  it("hardDaysFueled zeigt das Band nur an harten Tagen", () => {
    const carbs = { hardDaysFueled: true };
    const easy = ok(
      buildNutritionDay(input({ goals: { fatLoss: false, protein: null, carbs }, cards: [ride(TODAY, "Z2 Lang")] })),
    );
    const hard = ok(
      buildNutritionDay(input({ goals: { fatLoss: false, protein: null, carbs }, cards: [ride(TODAY, "Schwelle")] })),
    );
    expect(easy.goalInfo?.carbsG).toBeNull();
    expect(hard.goalInfo?.carbsG).toEqual([480, 800]);
  });

  it("zeigt nichts, wenn das Profil keine Kohlenhydrat-Regel hat", () => {
    const day = ok(buildNutritionDay(input({ goals: FAT })));
    expect(day.goalInfo?.carbsG).toBeNull();
  });
});
