/* Tests: nutrition-goal-model — aktive Ziele → Ernährungsprofil, Last-Warnung
 * (Fahrplan 43, E6). Alle Werte erfunden. */

import { describe, expect, it } from "vitest";
import type { Goal, GoalKey, GoalRole, NutritionGoal, PlanCard } from "../../api/types";
import { buildLoadWarning, dayGoalProfileFrom, weekKeyOf } from "./nutrition-goal-model";

function goal(goalKey: GoalKey | null, role: GoalRole | null): Goal {
  return { id: `${goalKey}-${role}`, kind: "x", targetValue: null, targetDate: null, note: null, isActive: true, goalKey, role };
}

describe("dayGoalProfileFrom", () => {
  it("liefert null ohne Ziele, mit Notiz-Zielen und mit Zielen ohne Wirkung", () => {
    expect(dayGoalProfileFrom([])).toBeNull();
    expect(dayGoalProfileFrom([goal("sonstiges", "main")])).toBeNull();
    expect(dayGoalProfileFrom([goal("laufen_starten", "main")])).toBeNull();
    expect(dayGoalProfileFrom([goal(null, null)])).toBeNull();
  });

  it("erkennt Fett verlieren als Haupt- und als Nebenziel", () => {
    expect(dayGoalProfileFrom([goal("fett_verlieren", "main")])?.fatLoss).toBe(true);
    expect(dayGoalProfileFrom([goal("ftp", "main"), goal("fett_verlieren", "side")])?.fatLoss).toBe(true);
  });

  it("gibt den Eiweiß-Bereich aus dem Profil weiter", () => {
    expect(dayGoalProfileFrom([goal("fett_verlieren", "main")])?.protein).toEqual({ min: 1.8, max: 2.2 });
    expect(dayGoalProfileFrom([goal("muskeln_kraft", "main")])).toMatchObject({ fatLoss: false, protein: { min: 1.6, max: 2.0 } });
  });

  it("gibt die Kohlenhydrat-Regeln weiter", () => {
    expect(dayGoalProfileFrom([goal("ausdauer", "main")])?.carbs).toMatchObject({ followLoad: true });
    expect(dayGoalProfileFrom([goal("ftp", "main")])?.carbs).toMatchObject({ hardDaysFueled: true });
  });

  it("verwendet kein trainLow", () => {
    const carbs = dayGoalProfileFrom([goal("ausdauer", "main")])?.carbs as Record<string, unknown>;
    expect(carbs.trainLow).toBe(false);
  });
});

const lose = (pace: number): NutritionGoal => ({
  id: "n",
  profileId: "p",
  goalType: "lose",
  targetWeightKg: null,
  pacePerWeekKg: pace,
  targetDate: null,
  createdAt: "2026-10-01T00:00:00Z",
});

function card(date: string, tssPlanned: number | null, cancelled = false): PlanCard {
  return {
    id: `c-${date}-${tssPlanned}`,
    date,
    sortOrder: 0,
    name: null,
    typ: "Z2",
    km: null,
    durationMin: 60,
    tssPlanned,
    week: null,
    phase: null,
    details: null,
    workout: null,
    workoutStructure: null,
    pushedExternalId: null,
    createdAt: "",
    updatedAt: "",
    ...(cancelled ? { cancelled: true as const } : {}),
  };
}

const TODAY = "2026-10-14"; // Mittwoch
const FAT = { fatLoss: true, protein: null, carbs: null };
const RIDES = [{ dateISO: "2026-10-13", ctl: 50 }];

describe("buildLoadWarning", () => {
  it("warnt bei Defizit und Wochenlast über der Schwelle", () => {
    const cards = [card("2026-10-14", 200), card("2026-10-16", 200)]; // 400 > 50 x 7,5
    const w = buildLoadWarning({ goals: FAT, goal: lose(0.3), todayISO: TODAY, cards, rides: RIDES });
    expect(w?.text).toBeTruthy();
    expect(w?.weekKey).toBe("2026-10-12");
  });

  it("zählt nur die sieben Tage ab heute und keine abgesagten Karten", () => {
    const cards = [card("2026-10-14", 200), card("2026-10-21", 400), card("2026-10-15", 400, true)];
    expect(buildLoadWarning({ goals: FAT, goal: lose(0.3), todayISO: TODAY, cards, rides: RIDES })).toBeNull();
  });

  it("schweigt ohne Defizit-Ziel, ohne lose-Zeile oder bei Tempo 0", () => {
    const cards = [card("2026-10-14", 500)];
    const base = { todayISO: TODAY, cards, rides: RIDES };
    expect(buildLoadWarning({ ...base, goals: null, goal: lose(0.3) })).toBeNull();
    expect(buildLoadWarning({ ...base, goals: { ...FAT, fatLoss: false }, goal: lose(0.3) })).toBeNull();
    expect(buildLoadWarning({ ...base, goals: FAT, goal: null })).toBeNull();
    expect(buildLoadWarning({ ...base, goals: FAT, goal: lose(0) })).toBeNull();
    expect(buildLoadWarning({ ...base, goals: FAT, goal: { ...lose(0.3), goalType: "maintain" } })).toBeNull();
  });

  it("schweigt ohne CTL", () => {
    const cards = [card("2026-10-14", 500)];
    expect(buildLoadWarning({ goals: FAT, goal: lose(0.3), todayISO: TODAY, cards, rides: [] })).toBeNull();
  });
});

describe("weekKeyOf", () => {
  it("liefert den Montag der Woche", () => {
    expect(weekKeyOf("2026-10-14")).toBe("2026-10-12");
    expect(weekKeyOf("2026-10-12")).toBe("2026-10-12");
    expect(weekKeyOf("2026-10-18")).toBe("2026-10-12");
    expect(weekKeyOf("2026-10-19")).toBe("2026-10-19");
  });
});
