/* ============================================================
   FEATURES/NUTRITION/NUTRITION-GOAL-MODEL.TS — Ziele → Ernährung
   (Fahrplan 43, E6; reine Funktionen, kein I/O, keine React-Hooks)

   - dayGoalProfileFrom: macht aus den aktiven Zielen (goals) das Profil,
     das buildNutritionDay braucht. Die Zuordnung selbst steht in
     core/goals.js::goalNutritionProfile — hier wird nichts nachgerechnet.
   - buildLoadWarning: ruhiger Hinweis (Idee N), wenn Defizit und hohe
     geplante Wochenlast zusammenkommen. Die Schwelle steht als benannte
     Konstante in core/nutrition.js (deficitLoadWarning).
   ============================================================ */

import { goalNutritionProfile } from "../../core/goals.js";
import { deficitLoadWarning } from "../../core/nutrition.js";
import { addDaysISO } from "../../core/format.js";
import type { Goal, NutritionGoal, PlanCard } from "../../api/types";
import type { DayGoalProfile } from "./nutrition-day-model";

const FAT_LOSS_KEY = "fett_verlieren";

/** Fahrt mit Datum und CTL. CTL steht an den Fahrten (rides.json), nicht an den Wellness-Tagen. */
export interface LoadRide {
  date?: string;
  dateISO?: string;
  ctl?: number | null;
}

/** Profil der aktiven Ziele für die Ernährung. `null`, wenn kein Ziel auf die Ernährung wirkt
 *  (dann rechnet alles wie vor Fahrplan 43 E6). Altziele ohne Katalogschlüssel zählen nicht. */
export function dayGoalProfileFrom(goals: readonly Goal[]): DayGoalProfile | null {
  const main = goals.find((g) => g.role === "main") ?? null;
  const side = goals.find((g) => g.role === "side") ?? null;
  const asKey = (g: Goal | null) => (g?.goalKey ? { goalKey: g.goalKey } : null);
  const profile = goalNutritionProfile(asKey(main), asKey(side));

  const fatLoss = main?.goalKey === FAT_LOSS_KEY || side?.goalKey === FAT_LOSS_KEY;
  if (!fatLoss && !profile.protein && !profile.carbs) return null;
  return { fatLoss, protein: profile.protein, carbs: profile.carbs };
}

/** localStorage-Schlüssel für „Hinweis in dieser Woche geschlossen“. */
export const loadWarningStorageKey = (userId: string, weekKey: string) =>
  `nutrition-load-warning-dismissed:${userId}:${weekKey}`;

/** Montag der Woche (ISO) als Schlüssel zum Wegklicken des Hinweises. */
export function weekKeyOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const sinceMonday = (d.getDay() + 6) % 7;
  return addDaysISO(dateISO, -sinceMonday) as string;
}

/** CTL der neuesten Fahrt bis einschließlich `dateISO`. */
function latestCtl(rides: readonly LoadRide[], dateISO: string): number | null {
  let best: { date: string; ctl: number } | null = null;
  for (const r of rides) {
    const date = r.dateISO || r.date;
    if (!date || date > dateISO || typeof r.ctl !== "number" || !(r.ctl > 0)) continue;
    if (!best || date > best.date) best = { date, ctl: r.ctl };
  }
  return best ? best.ctl : null;
}

export interface LoadWarning {
  text: string;
  /** Montag der Woche: je Woche lässt sich der Hinweis einmal schließen */
  weekKey: string;
}

/** Hinweis, wenn ein Defizit läuft (Ziel „Fett verlieren“ + lose-Zeile mit Tempo) und die
 *  geplante Last der nächsten sieben Tage hoch ist. Sonst `null`. */
export function buildLoadWarning(input: {
  goals: DayGoalProfile | null | undefined;
  goal: NutritionGoal | null;
  todayISO: string;
  cards: readonly PlanCard[];
  rides: readonly LoadRide[];
}): LoadWarning | null {
  const { goals, goal, todayISO, cards, rides } = input;
  const deficitActive = !!goals?.fatLoss && goal?.goalType === "lose" && (goal.pacePerWeekKg ?? 0) > 0;
  if (!deficitActive) return null;

  const lastDay = addDaysISO(todayISO, 6) as string;
  const weekPlannedTss = cards
    .filter((c) => !c.cancelled && c.date >= todayISO && c.date <= lastDay)
    .reduce((sum, c) => sum + (c.tssPlanned ?? 0), 0);

  const result = deficitLoadWarning({
    deficitActive,
    weekPlannedTss,
    ctl: latestCtl(rides, todayISO),
  });
  return result.warn ? { text: result.text, weekKey: weekKeyOf(todayISO) } : null;
}
