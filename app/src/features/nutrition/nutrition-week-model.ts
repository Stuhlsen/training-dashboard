/* ============================================================
   FEATURES/NUTRITION/NUTRITION-WEEK-MODEL.TS — Wochenansicht (rein)
   (Fahrplan 23, E6 PR B; Entscheidungen E12, E31, E32)

   Reine Funktionen ohne I/O und ohne React: Wochen-Daten, Tages-
   Zusammenfassung aus gespeicherten Plan-Einträgen (Summe, Ampel,
   Eiweiß-Hinweis je Hauptmahlzeit) und die Texte der Banner.
   ============================================================ */

import { addDaysISO, fmtDate } from "../../core/format.js";
import { dayAmpel, proteinMinFor } from "../../core/nutrition-plan.js";
import { dayProgress } from "../../core/nutrition-progress.js";
import { trainingNutritionHint, weightMissingHint } from "../../core/nutrition.js";
import type { MealPlanEntry, MealSlot, PlanCard, Recipe } from "../../api/types";
import { sessionForDay, type NutritionDay, type NutritionWellnessDay } from "./nutrition-day-model";

/** Die Wochenansicht zeigt bis zu 7 Tage ab heute (E5). */
export const WEEK_DAYS = 7;

export const SLOT_ORDER: readonly MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: "Frühstück",
  lunch: "Mittagessen",
  dinner: "Abendessen",
  snack: "Snack",
};

/** Eiweißbereich gilt nur für Hauptmahlzeiten, nicht für den Snack (E31). */
const MAIN_SLOTS: ReadonlySet<MealSlot> = new Set<MealSlot>(["breakfast", "lunch", "dinner"]);

export type Ampel = "red" | "yellow" | "green";

export const AMPEL_TEXT: Record<Ampel, string> = {
  green: "im Rahmen",
  yellow: "abweichend",
  red: "unter der Mindestzufuhr",
};

/** Farb-Token je Stufe (L3): --ok / --warn / --danger, nie Zonenfarben */
export const AMPEL_TOKEN: Record<Ampel, string> = { green: "--ok", yellow: "--warn", red: "--danger" };

export const AMPEL_TOOLTIP = "grob so genau wie die Rechnung selbst, keine medizinische Schwelle";

/** ISO-Daten der Woche, beginnend mit `todayISO`. */
export function weekDates(todayISO: string, count: number = WEEK_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDaysISO(todayISO, i) as string);
}

/** Rezept-IDs der zwei Tage vor `dateISO` — Eingabe der Rotation in composeDay. */
export function recentRecipeIds(entries: readonly MealPlanEntry[], dateISO: string): string[] {
  const recent = new Set([addDaysISO(dateISO, -1), addDaysISO(dateISO, -2)]);
  return entries.filter((e) => recent.has(e.date)).map((e) => e.recipeId);
}

export interface SlotView {
  slot: MealSlot;
  entry: MealPlanEntry | null;
  /** null, wenn kein Eintrag ODER das Rezept nicht (mehr) im Pool ist */
  recipe: Recipe | null;
  /** kcal / Eiweiß (g) × Portionen, null ohne Rezept */
  kcal: number | null;
  protein: number | null;
  /** Hauptmahlzeit unter dem bevorzugten Eiweißbereich */
  proteinLow: boolean;
}

export interface DaySummary {
  slots: SlotView[];
  totalKcal: number;
  /** Anzahl Slots mit auflösbarem Rezept */
  filled: number;
  /** null, solange der Tag leer ist */
  ampel: Ampel | null;
  /** Untergrenze Eiweiß je Hauptmahlzeit (g) */
  proteinMin: number;
}

export function summarizeDay(params: {
  dateISO: string;
  entries: readonly MealPlanEntry[];
  recipesById: ReadonlyMap<string, Recipe>;
  target: number;
  floor: number;
  weightKg: number;
}): DaySummary {
  const { dateISO, entries, recipesById, target, floor, weightKg } = params;
  const proteinMin = proteinMinFor(weightKg) as number;
  let totalKcal = 0;
  let filled = 0;

  const slots = SLOT_ORDER.map((slot): SlotView => {
    const entry = entries.find((e) => e.date === dateISO && e.mealSlot === slot) ?? null;
    const recipe = entry ? (recipesById.get(entry.recipeId) ?? null) : null;
    const nutrition = recipe?.nutrition ?? null;
    if (!entry || !recipe || !nutrition) {
      return { slot, entry, recipe: null, kcal: null, protein: null, proteinLow: false };
    }
    const kcal = nutrition.kcal * entry.servings;
    const protein = nutrition.protein * entry.servings;
    totalKcal += kcal;
    filled += 1;
    return { slot, entry, recipe, kcal, protein, proteinLow: MAIN_SLOTS.has(slot) && protein < proteinMin };
  });

  totalKcal = Math.round(totalKcal);
  const ampel = filled > 0 ? (dayAmpel(totalKcal, target, floor) as Ampel) : null;
  return { slots, totalKcal, filled, ampel, proteinMin };
}

/* ── Wochenleiste (Fahrplan 25, R1) ─────────────────────── */

const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** "2026-10-14" → "Mi" (kalendarisch, unabhängig von Zeitzone und Sommerzeit). */
export function weekdayShort(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : WEEKDAYS_SHORT[d.getUTCDay()];
}

export interface WeekStripDay {
  dateISO: string;
  isToday: boolean;
  weekday: string;
  /** "14.10" */
  dateLabel: string;
  /** Anzahl Slots mit auflösbarem Rezept */
  filled: number;
  totalKcal: number;
  /** null, wenn für den Tag kein Ziel berechenbar ist */
  target: number | null;
  /** 0…1 für den kleinen Fortschrittsbalken */
  ratio: number;
  /** null, solange der Tag leer ist */
  ampel: Ampel | null;
}

/** Eine Zeile pro Tag der Leiste: Datum, Fortschritt, Ampel. */
export function buildWeekStrip(params: {
  dates: readonly string[];
  todayISO: string;
  days: readonly NutritionDay[];
  entries: readonly MealPlanEntry[];
  recipesById: ReadonlyMap<string, Recipe>;
}): WeekStripDay[] {
  const { dates, todayISO, days, entries, recipesById } = params;
  return dates.map((dateISO, i): WeekStripDay => {
    const base = {
      dateISO,
      isToday: dateISO === todayISO,
      weekday: weekdayShort(dateISO),
      dateLabel: fmtDate(dateISO) as string,
    };
    const day = days[i];
    if (!day?.ok) return { ...base, filled: 0, totalKcal: 0, target: null, ratio: 0, ampel: null };
    const s = summarizeDay({ dateISO, entries, recipesById, target: day.target, floor: day.floor, weightKg: day.weightKg });
    return {
      ...base,
      filled: s.filled,
      totalKcal: s.totalKcal,
      target: day.target,
      ratio: dayProgress(s.totalKcal, day.target).ratio as number,
      ampel: s.ampel,
    };
  });
}

export interface Banner {
  /** stabiler Schlüssel je Hinweisart (für das Wegklicken) */
  key: "weight" | "training";
  text: string;
}

/** Banner nach E12: Gewicht fehlt (> 7 Tage) und Trainings-Abgleich für morgen.
 *  Ohne `kcalConsumed` des Tages gibt es keinen Trainings-Hinweis — kein Raten. */
export function buildBanners(params: {
  todayISO: string;
  wellness: readonly NutritionWellnessDay[];
  cards: readonly PlanCard[];
  ftpWatts: number | null;
  target: number | null;
}): Banner[] {
  const { todayISO, wellness, cards, ftpWatts, target } = params;
  const banners: Banner[] = [];

  const weightHint = weightMissingHint(wellness as NutritionWellnessDay[], todayISO) as string | null;
  if (weightHint) banners.push({ key: "weight", text: weightHint });

  const today = wellness.find((w) => (w.dateISO || w.date) === todayISO);
  const intake = today?.kcalConsumed;
  if (target != null && typeof intake === "number" && Number.isFinite(intake) && intake > 0) {
    const { session } = sessionForDay(cards, addDaysISO(todayISO, 1), ftpWatts);
    const trainingHint = trainingNutritionHint({
      target,
      actualIntake: intake,
      tomorrowSession: session ?? undefined,
    }) as string | null;
    if (trainingHint) banners.push({ key: "training", text: trainingHint });
  }
  return banners;
}
