/* ============================================================
   FEATURES/PLANNING/GOAL-PLAN-VIEW-MODEL.TS — Ziele → Plan-Vorschlag
   (Fahrplan 43 E5)

   Reine Logik ohne React/I/O. Rechnen tun core/goals.js (Katalog, Profil,
   Sportfilter), core/goal-check.js (Zwischenziel) und der Generator. Hier:
   - welche Ziele für die Sportart des Plans zählen,
   - was ein Ziel am Plan ändert (und was NOCH NICHT wirkt),
   - der ruhige Hinweis „Ziele und Plan passen nicht ganz zusammen",
   - Vorbelegung für „Neuer Plan",
   - Ziel-FTP-Vorschlag aus dem Zwischenziel.

   Es ändert sich nie etwas ohne Bestätigung im Dialog. Texte sachlich: kein
   Druck, keine Dringlichkeit.
   ============================================================ */

import { goalPlanProfile, goalsForSport } from "../../core/goals.js";
import { assessFtpGoal } from "../../core/goal-check.js";
import { LOW_START_VOLUME_FACTOR } from "../../core/plan-generator.js";
import { groupGoals, pickCheckGoal } from "../settings/goals-view-model";
import type { Goal, PlanFocus, PlanLevel, Sport, TrainingPlan } from "../../api/types";
import type { NewPlanFormState } from "./new-plan-dialog-view-model";

export type GoalPlanProfile = ReturnType<typeof goalPlanProfile>;

/* ── Sportfilter ────────────────────────────────────────────────── */

/** Haupt- und Nebenziel, gefiltert auf die Sportart des Plans. Altziele ohne
 *  Rolle zählen nie. */
export function activeGoalsForPlan(
  goals: readonly Goal[],
  sport: Sport,
): { main: Goal | null; side: Goal | null } {
  const { main, side } = groupGoals(goals);
  return goalsForSport({ main, side }, sport);
}

export function planGoalProfile(goals: readonly Goal[], sport: Sport): GoalPlanProfile {
  const { main, side } = activeGoalsForPlan(goals, sport);
  return goalPlanProfile(main, side);
}

/* ── Was ändert sich? ───────────────────────────────────────────── */

const STARTUMFANG_PCT = Math.round((1 - LOW_START_VOLUME_FACTOR) * 100);

export interface GoalPlanChanges {
  /** Wirkt im Plan. */
  changes: string[];
  /** Hat das Ziel, wirkt aber noch nicht — offen gesagt statt versprochen. */
  notYet: string[];
  hasEffect: boolean;
}

export function goalPlanChanges(profile: GoalPlanProfile): GoalPlanChanges {
  const changes: string[] = [];
  const notYet: string[] = [];

  if (profile.ramp) {
    changes.push("Der Aufbau steigt flacher an (wöchentlich etwa +4 % statt +8 %).");
  }
  if (profile.lowStartVolume) {
    changes.push(`Der Start ist niedriger (erste Woche etwa ${STARTUMFANG_PCT} % weniger Umfang).`);
  }
  if (profile.keepHardStimuli) {
    changes.push("Harte Einheiten bleiben erhalten: Es fällt kein Trainingstag weg.");
  }

  if (profile.moreEasyVolume) notYet.push("Mehr lockerer Umfang");
  if (profile.intensityFocus) notYet.push("Schwerpunkt Schwelle und VO2max");
  if (profile.sweetSpot) notYet.push("Sweet Spot als Ergänzung");

  return { changes, notYet, hasEffect: changes.length > 0 };
}

/* ── Hinweis auf der Planungsseite ──────────────────────────────── */

export type HintDifference = "focus" | "level" | "ftpTarget";

export interface GoalPlanHint {
  /** Ändert sich, sobald sich Ziele oder Abweichungen ändern: Schlüssel fürs
   *  „Später" (localStorage). */
  signature: string;
  differences: HintDifference[];
  text: string;
}

const DIFF_LABEL: Record<HintDifference, string> = {
  focus: "Fokus",
  level: "Level",
  ftpTarget: "Ziel-FTP",
};

/**
 * Vergleicht aktive Ziele mit dem aktiven Plan (Fokus, Level, Ziel-FTP).
 * `null` = kein Hinweis. `interimFtp`: das Zwischenziel — wer es schon als
 * Ziel-FTP übernommen hat, bekommt dafür keinen Hinweis mehr.
 */
export function goalPlanHint(
  goals: readonly Goal[],
  plan: Pick<TrainingPlan, "focus" | "level" | "ftpTarget" | "sport">,
  interimFtp: number | null,
): GoalPlanHint | null {
  const sport: Sport = plan.sport ?? "ride";
  const { main, side } = activeGoalsForPlan(goals, sport);
  const profile = goalPlanProfile(main, side);
  const differences: HintDifference[] = [];

  if (profile.focus && profile.focus !== plan.focus) differences.push("focus");
  if (profile.level && profile.level !== plan.level) differences.push("level");

  if (sport === "ride") {
    const ftpGoal = [main, side].find((g) => g?.goalKey === "ftp" && g.targetValue != null && g.targetValue > 0);
    const wanted = ftpGoal?.targetValue ?? null;
    if (wanted != null && plan.ftpTarget !== wanted && plan.ftpTarget !== interimFtp) {
      differences.push("ftpTarget");
    }
  }

  if (differences.length === 0) return null;

  const names = differences.map((d) => DIFF_LABEL[d]).join(", ");
  return {
    signature: [sport, main?.id ?? "-", side?.id ?? "-", differences.join("+")].join("|"),
    differences,
    text: `Deine Ziele und dein Plan passen nicht ganz zusammen (${names}). Du kannst dir ansehen, was sich ändern würde. Es ändert sich nichts, solange du nicht bestätigst.`,
  };
}

/* ── „Neuer Plan": Vorbelegung ──────────────────────────────────── */

export interface NewPlanPresets {
  focus?: PlanFocus;
  level?: PlanLevel;
  /** Nur gesetzt, wenn das Event-Ziel ein Datum hat (heute oder später). */
  eventDate?: string;
}

export function newPlanPresets(goals: readonly Goal[], sport: Sport, todayISO: string): NewPlanPresets {
  const { main, side } = activeGoalsForPlan(goals, sport);
  const profile = goalPlanProfile(main, side);
  const out: NewPlanPresets = {};
  if (profile.focus) out.focus = profile.focus;
  if (profile.level) out.level = profile.level;
  if (profile.eventMode) {
    const eventGoal = [main, side].find((g) => g?.goalKey === "event");
    const date = eventGoal?.targetDate ?? null;
    if (date && date >= todayISO) out.eventDate = date;
  }
  return out;
}

/** Formular-Patch aus der Vorbelegung. Mit Event-Datum: ein vorhandenes Event
 *  am Tag wählen, sonst den Renntag als neues Event vorbelegen. */
export function newPlanFormPatch(
  presets: NewPlanPresets,
  events: ReadonlyArray<{ id: string; eventDate: string }>,
): Partial<NewPlanFormState> {
  const patch: Partial<NewPlanFormState> = {};
  if (presets.focus) patch.focus = presets.focus;
  if (presets.level) patch.level = presets.level;
  if (presets.eventDate) {
    patch.mode = "event";
    const existing = events.find((e) => e.eventDate === presets.eventDate);
    if (existing) {
      patch.eventId = existing.id;
    } else {
      patch.eventId = "";
      patch.newEventDate = presets.eventDate;
    }
  }
  return patch;
}

/* ── Ziel-FTP-Vorschlag ─────────────────────────────────────────── */

/** Zwischenziel aus assessFtpGoal() — nur Rad, nur bei ok, nur mit aktueller FTP. */
export function ftpTargetSuggestion(input: {
  goals: readonly Goal[];
  sport: Sport;
  current: number | null;
  history: Array<{ date: string; eftp: number }>;
  todayISO: string;
}): number | null {
  const { goals, sport, current, history, todayISO } = input;
  if (sport !== "ride" || current == null) return null;
  const { main, side } = activeGoalsForPlan(goals, sport);
  const goal = pickCheckGoal({ main, side, legacy: [] });
  if (!goal || goal.targetValue == null) return null;
  const r = assessFtpGoal({ current, target: goal.targetValue, targetDate: goal.targetDate, history, todayISO });
  return r.ok && r.interimTarget ? r.interimTarget.watts : null;
}
