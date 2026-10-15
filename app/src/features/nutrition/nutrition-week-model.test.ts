/* Tests: nutrition-week-model — Wochen-Daten, Tages-Zusammenfassung aus
 * gespeicherten Einträgen (Summe, Ampel, Eiweiß-Hinweis), Banner (E12). */

import { describe, expect, it } from "vitest";
import type { MealPlanEntry, PlanCard, Recipe } from "../../api/types";
import { buildBanners, recentRecipeIds, summarizeDay, weekDates } from "./nutrition-week-model";

const TODAY = "2026-10-14";

function recipe(id: string, mealType: Recipe["mealType"], kcal: number, protein: number): Recipe {
  return { id, mealType, nutrition: { kcal, protein, carbs: 10, fat: 5 } } as unknown as Recipe;
}

function entry(date: string, mealSlot: MealPlanEntry["mealSlot"], recipeId: string, servings = 1): MealPlanEntry {
  return { id: `${date}-${mealSlot}`, athleteId: "u1", date, mealSlot, recipeId, servings, createdAt: "", updatedAt: "" };
}

const RECIPES = new Map<string, Recipe>(
  [
    recipe("b", ["breakfast"], 500, 25),
    recipe("b-low", ["breakfast"], 400, 8),
    recipe("l", ["lunch"], 800, 35),
    recipe("d", ["dinner"], 800, 35),
    recipe("s", ["snack"], 200, 5),
  ].map((r) => [r.id, r]),
);

const base = { dateISO: TODAY, recipesById: RECIPES, target: 2300, floor: 1700, weightKg: 80 };

describe("weekDates / recentRecipeIds", () => {
  it("liefert 7 aufeinanderfolgende Tage ab heute, auch über den Monatswechsel", () => {
    expect(weekDates("2026-10-29")).toEqual([
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
    ]);
  });

  it("sammelt nur die Rezepte der zwei Vortage", () => {
    const entries = [
      entry("2026-10-13", "lunch", "l"),
      entry("2026-10-12", "dinner", "d"),
      entry("2026-10-11", "snack", "s"),
      entry(TODAY, "breakfast", "b"),
    ];
    expect(recentRecipeIds(entries, TODAY).sort()).toEqual(["d", "l"]);
  });
});

describe("summarizeDay", () => {
  it("leerer Tag: keine Ampel, Summe 0, alle Slots ohne Eintrag", () => {
    const s = summarizeDay({ ...base, entries: [] });
    expect(s.ampel).toBeNull();
    expect(s.filled).toBe(0);
    expect(s.totalKcal).toBe(0);
    expect(s.slots.map((x) => x.entry)).toEqual([null, null, null, null]);
  });

  it("gefüllter Tag: Summe × Portionen und Ampel grün im Band", () => {
    const entries = [
      entry(TODAY, "breakfast", "b", 1),
      entry(TODAY, "lunch", "l", 1),
      entry(TODAY, "dinner", "d", 1),
      entry(TODAY, "snack", "s", 1),
    ];
    const s = summarizeDay({ ...base, entries });
    expect(s.totalKcal).toBe(2300);
    expect(s.ampel).toBe("green");
    expect(s.slots[0].kcal).toBe(500);
  });

  it("Portionen zählen in Summe und Eiweiß", () => {
    const s = summarizeDay({ ...base, entries: [entry(TODAY, "lunch", "l", 1.5)] });
    expect(s.totalKcal).toBe(1200);
    expect(s.slots[1].protein).toBe(52.5);
  });

  it("gelb außerhalb des Bands, rot unter dem Boden", () => {
    const some = [entry(TODAY, "breakfast", "b"), entry(TODAY, "lunch", "l"), entry(TODAY, "dinner", "d")];
    expect(summarizeDay({ ...base, target: 2600, entries: some }).ampel).toBe("yellow"); // 2100 kcal vs 2600 (−19 %)
    expect(summarizeDay({ ...base, entries: [entry(TODAY, "snack", "s")] }).ampel).toBe("red"); // 200 < 1700
  });

  it("markiert Hauptmahlzeiten unter dem Eiweißbereich, den Snack nie", () => {
    const entries = [entry(TODAY, "breakfast", "b-low"), entry(TODAY, "snack", "s")];
    const s = summarizeDay({ ...base, entries });
    expect(s.slots[0].proteinLow).toBe(true);
    expect(s.slots[3].proteinLow).toBe(false);
    expect(s.proteinMin).toBe(20);
  });

  it("Eintrag mit unbekanntem Rezept: Slot bleibt sichtbar (entry), zählt aber nicht in die Summe", () => {
    const s = summarizeDay({ ...base, entries: [entry(TODAY, "lunch", "gone")] });
    expect(s.slots[1].entry).not.toBeNull();
    expect(s.slots[1].recipe).toBeNull();
    expect(s.filled).toBe(0);
    expect(s.ampel).toBeNull();
  });

  it("beachtet nur Einträge des eigenen Datums", () => {
    const s = summarizeDay({ ...base, entries: [entry("2026-10-15", "lunch", "l")] });
    expect(s.filled).toBe(0);
  });
});

function ridingCard(date: string): PlanCard {
  return { id: "c", date, durationMin: 60, tssPlanned: 60, typ: "Z2 Dauer", name: "Rad" } as unknown as PlanCard;
}

describe("buildBanners (E12)", () => {
  const wellnessFresh = [{ dateISO: TODAY, weight: 80, kcalConsumed: 1500 }];

  it("Gewicht länger als 7 Tage nicht eingetragen: Gewichts-Hinweis", () => {
    const banners = buildBanners({
      todayISO: TODAY,
      wellness: [{ dateISO: "2026-10-01", weight: 80 }],
      cards: [],
      ftpWatts: 200,
      target: 2300,
    });
    expect(banners.map((b) => b.key)).toEqual(["weight"]);
  });

  it("aktuelles Gewicht und keine kcalConsumed: kein Banner, kein Raten", () => {
    const banners = buildBanners({
      todayISO: TODAY,
      wellness: [{ dateISO: TODAY, weight: 80 }],
      cards: [ridingCard("2026-10-15")],
      ftpWatts: 200,
      target: 2300,
    });
    expect(banners).toEqual([]);
  });

  it("kcalConsumed vorhanden und morgen eine Einheit: Trainings-Hinweis mit Zielabstand", () => {
    const banners = buildBanners({
      todayISO: TODAY,
      wellness: wellnessFresh,
      cards: [ridingCard("2026-10-15")],
      ftpWatts: 200,
      target: 2300,
    });
    const training = banners.find((b) => b.key === "training");
    expect(training?.text).toMatch(/800 kcal unter dem Ziel/);
    expect(training?.text).toMatch(/Morgen: ca\./);
  });

  it("kcalConsumed vorhanden, aber morgen keine Einheit: kein Trainings-Hinweis", () => {
    const banners = buildBanners({ todayISO: TODAY, wellness: wellnessFresh, cards: [], ftpWatts: 200, target: 2300 });
    expect(banners).toEqual([]);
  });

  it("ohne Tagesziel kein Trainings-Hinweis", () => {
    const banners = buildBanners({
      todayISO: TODAY,
      wellness: wellnessFresh,
      cards: [ridingCard("2026-10-15")],
      ftpWatts: 200,
      target: null,
    });
    expect(banners.find((b) => b.key === "training")).toBeUndefined();
  });
});

/* ── Wochenleiste (Fahrplan 25, R1) ───────────────────────── */

import { buildWeekStrip, weekdayShort } from "./nutrition-week-model";
import type { NutritionDay } from "./nutrition-day-model";

describe("weekdayShort", () => {
  it("liefert den deutschen Kurznamen des Kalendertags", () => {
    expect(weekdayShort("2026-10-12")).toBe("Mo");
    expect(weekdayShort("2026-10-14")).toBe("Mi");
    expect(weekdayShort("2026-10-18")).toBe("So");
  });

  it("bleibt am Wechsel der Sommerzeit beim richtigen Tag", () => {
    expect(weekdayShort("2026-10-25")).toBe("So");
    expect(weekdayShort("2026-10-26")).toBe("Mo");
  });

  it("ungültiges Datum: leer statt Absturz", () => {
    expect(weekdayShort("kein-datum")).toBe("");
  });
});

describe("buildWeekStrip", () => {
  const okDay = (dateISO: string, over: Partial<Extract<NutritionDay, { ok: true }>> = {}) =>
    ({ ok: true, dateISO, target: 2300, floor: 1700, weightKg: 80, ...over }) as unknown as NutritionDay;
  const DATES = [TODAY, "2026-10-15", "2026-10-16"];

  it("eine Zeile je Tag mit Wochentag, Datum und Heute-Markierung", () => {
    const strip = buildWeekStrip({
      dates: DATES,
      todayISO: TODAY,
      days: DATES.map((d) => okDay(d)),
      entries: [],
      recipesById: RECIPES,
    });
    expect(strip.map((d) => [d.weekday, d.dateLabel, d.isToday])).toEqual([
      ["Mi", "14.10", true],
      ["Do", "15.10", false],
      ["Fr", "16.10", false],
    ]);
  });

  it("leerer Tag: nichts geplant, Fortschritt 0, keine Ampel", () => {
    const [day] = buildWeekStrip({
      dates: [TODAY],
      todayISO: TODAY,
      days: [okDay(TODAY)],
      entries: [],
      recipesById: RECIPES,
    });
    expect(day).toMatchObject({ filled: 0, totalKcal: 0, target: 2300, ratio: 0, ampel: null });
  });

  it("gefüllter Tag: Summe, Anteil am Ziel und Ampel aus denselben Regeln wie die Bühne", () => {
    const entries = [entry(TODAY, "breakfast", "b"), entry(TODAY, "lunch", "l"), entry(TODAY, "dinner", "d")];
    const [day] = buildWeekStrip({
      dates: [TODAY],
      todayISO: TODAY,
      days: [okDay(TODAY)],
      entries,
      recipesById: RECIPES,
    });
    // 500 + 800 + 800 = 2100 von 2300: im Rahmen
    expect(day.filled).toBe(3);
    expect(day.totalKcal).toBe(2100);
    expect(day.ratio).toBeCloseTo(2100 / 2300, 6);
    expect(day.ampel).toBe(summarizeDay({ ...base, entries }).ampel);
  });

  it("unter der Mindestzufuhr: rot", () => {
    const [day] = buildWeekStrip({
      dates: [TODAY],
      todayISO: TODAY,
      days: [okDay(TODAY)],
      entries: [entry(TODAY, "snack", "s")],
      recipesById: RECIPES,
    });
    expect(day.ampel).toBe("red");
  });

  it("zählt nur Einträge des eigenen Tages", () => {
    const strip = buildWeekStrip({
      dates: [TODAY, "2026-10-15"],
      todayISO: TODAY,
      days: [okDay(TODAY), okDay("2026-10-15")],
      entries: [entry("2026-10-15", "lunch", "l")],
      recipesById: RECIPES,
    });
    expect(strip[0].filled).toBe(0);
    expect(strip[1].filled).toBe(1);
  });

  it("Tag ohne berechenbares Ziel: kein Ziel, nichts erfunden", () => {
    const [day] = buildWeekStrip({
      dates: [TODAY],
      todayISO: TODAY,
      days: [{ ok: false, missing: ["Gewicht"], hint: null }],
      entries: [entry(TODAY, "lunch", "l")],
      recipesById: RECIPES,
    });
    expect(day).toMatchObject({ target: null, filled: 0, ratio: 0, ampel: null });
  });
});
