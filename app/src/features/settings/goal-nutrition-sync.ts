/* ============================================================
   FEATURES/SETTINGS/GOAL-NUTRITION-SYNC.TS — Ziel → nutrition_goals
   (Fahrplan 43, E6)

   Richtung nur `goals` → `nutrition_goals`, nie umgekehrt. Die Tabelle
   bleibt append-only: ein neues Ziel schreibt eine neue Zeile.
   - Setzt ein Ziel das Profil „Defizit“ (goalNutritionProfile: energy.mode
     = lose), kommt NACH dem Ziel eine lose-Zeile mit Tempo.
   - Endet ein Defizit-Ziel oder wird es ersetzt, kommt VOR dem Ziel eine
     maintain-Zeile. Scheitert danach etwas, bleibt maintain stehen — die
     sichere Richtung. Sonst liefe das Defizit still weiter.
   - Ein lose-Ziel ohne Eintrag in `goals` wird nie angefasst: geplant wird
     nur aus dem Wechsel des Profils, den ein Ziel auslöst.

   Reine Logik ohne React; die Schreibzugriffe kommen als `deps` herein.
   Texte sachlich: keine Wertung, kein Druck.
   ============================================================ */

import { goalNutritionProfile, MAX_WEEKLY_LOSS_PCT } from "../../core/goals.js";
import { maxPacePerWeekKg } from "../../core/nutrition.js";
import type { Goal, GoalInput, GoalKey, GoalRole, NutritionGoalInput, Result } from "../../api/types";
import type { GoalGroups } from "./goals-view-model";

type Slot = Pick<Goal, "goalKey"> | null;

/** Was neben dem Ziel in `nutrition_goals` geschrieben wird. */
export interface NutritionWritePlan {
  /** maintain-Zeile VOR dem Ziel-Schreibzugriff (Defizit-Ziel endet oder wird ersetzt) */
  maintainFirst: boolean;
  /** lose-Zeile NACH dem Ziel (das neue Profil sagt „Defizit“) */
  loseAfter: NutritionGoalInput | null;
}

const NO_WRITES: NutritionWritePlan = { maintainFirst: false, loseAfter: null };

function energyMode(main: Slot, side: Slot): "lose" | "maintain" | null {
  const asKey = (g: Slot) => (g?.goalKey ? { goalKey: g.goalKey } : null);
  return goalNutritionProfile(asKey(main), asKey(side)).energy?.mode ?? null;
}

function energyModeAfter(groups: GoalGroups, draft: { goalKey: GoalKey; role: GoalRole }) {
  const next: Slot = { goalKey: draft.goalKey };
  return draft.role === "main" ? energyMode(next, groups.side) : energyMode(groups.main, next);
}

/** Setzt der Entwurf (mit dem Ziel der anderen Rolle zusammen) ein Defizit? Nur dann fragt
 *  das Formular nach Tempo und Zielgewicht. */
export function setsDeficit(groups: GoalGroups, draft: { goalKey: GoalKey; role: GoalRole }): boolean {
  return energyModeAfter(groups, draft) === "lose";
}

/** Plan fürs Speichern: `draft` ersetzt das Ziel seiner Rolle. `lose` ist die fertig
 *  geprüfte lose-Zeile (null, wenn der Entwurf kein Defizit setzt). */
export function planOnSave(
  groups: GoalGroups,
  draft: { goalKey: GoalKey; role: GoalRole },
  lose: NutritionGoalInput | null,
): NutritionWritePlan {
  const before = energyMode(groups.main, groups.side);
  const after = energyModeAfter(groups, draft);
  return {
    maintainFirst: before === "lose" && after !== "lose",
    loseAfter: after === "lose" ? lose : null,
  };
}

/** Plan fürs Beenden. Ein Altziel ohne Rolle (oder eine unbekannte ID) ändert nichts. */
export function planOnEnd(groups: GoalGroups, goalId: string): NutritionWritePlan {
  const before = energyMode(groups.main, groups.side);
  const main = groups.main?.id === goalId ? null : groups.main;
  const side = groups.side?.id === goalId ? null : groups.side;
  const after = energyMode(main, side);
  return before === "lose" && after !== "lose" ? { maintainFirst: true, loseAfter: null } : NO_WRITES;
}

/* ── Schreiben ─────────────────────────────────────────────────── */

export interface SyncDeps {
  replace: (oldGoalId: string | null, goal: GoalInput) => Promise<Result<{ id: string }>>;
  deactivate: (goalId: string) => Promise<Result<{ goalId: string }>>;
  addNutritionGoal: (input: NutritionGoalInput) => Promise<Result<{ id: string }>>;
}

export type SyncOutcome =
  | { ok: true }
  | { ok: false; stage: "maintain" | "goal" | "nutrition"; message: string };

const MAINTAIN_INPUT: NutritionGoalInput = { goalType: "maintain" };

const MSG_MAINTAIN =
  "Das Ernährungsziel konnte nicht zurückgesetzt werden. Dein Ziel bleibt unverändert, bitte versuche es noch einmal.";
const MSG_NUTRITION =
  "Das Ziel ist gespeichert, aber das Tempo nicht. Die Ernährung rechnet vorerst ohne Defizit. Bitte speichere das Ziel noch einmal.";

/** Ziel speichern/ersetzen und die Ernährung nachziehen. Reihenfolge siehe Kopfkommentar. */
export async function saveGoalWithNutrition(
  deps: SyncDeps,
  args: { oldGoalId: string | null; goalInput: GoalInput; plan: NutritionWritePlan },
): Promise<SyncOutcome> {
  const { oldGoalId, goalInput, plan } = args;
  if (plan.maintainFirst) {
    const m = await deps.addNutritionGoal(MAINTAIN_INPUT);
    if (!m.ok) return { ok: false, stage: "maintain", message: MSG_MAINTAIN };
  }
  const saved = await deps.replace(oldGoalId, goalInput);
  if (!saved.ok) return { ok: false, stage: "goal", message: saved.error.message };
  if (plan.loseAfter) {
    const n = await deps.addNutritionGoal(plan.loseAfter);
    if (!n.ok) return { ok: false, stage: "nutrition", message: MSG_NUTRITION };
  }
  return { ok: true };
}

/** Ziel beenden; endet ein Defizit-Ziel, steht die maintain-Zeile schon davor. */
export async function endGoalWithNutrition(
  deps: SyncDeps,
  args: { goalId: string; plan: NutritionWritePlan },
): Promise<SyncOutcome> {
  if (args.plan.maintainFirst) {
    const m = await deps.addNutritionGoal(MAINTAIN_INPUT);
    if (!m.ok) return { ok: false, stage: "maintain", message: MSG_MAINTAIN };
  }
  const ended = await deps.deactivate(args.goalId);
  if (!ended.ok) return { ok: false, stage: "goal", message: ended.error.message };
  return { ok: true };
}

/* ── Tempo-Feld ────────────────────────────────────────────────── */

const fmtKg = (x: number): string => String(Math.round(x * 100) / 100).replace(".", ",");

export type PaceField =
  | { kind: "ok"; max: number; text: string }
  | { kind: "no-weight"; text: string };

/** Die Obergrenze steht VOR dem Speichern im Feld-Hinweis. Ohne aktuelles Gewicht gibt es
 *  kein Tempo, und der Text sagt warum. */
export function paceFieldFor(weightKg: number | null | undefined): PaceField {
  const max = maxPacePerWeekKg(weightKg ?? null);
  if (max == null) {
    return {
      kind: "no-weight",
      text: "Für ein Tempo braucht das Dashboard dein aktuelles Gewicht. Trag es in den Einstellungen ein, dann erscheint das Feld.",
    };
  }
  const pct = String(MAX_WEEKLY_LOSS_PCT).replace(".", ",");
  return {
    kind: "ok",
    max,
    text: `Höchstens ${fmtKg(max)} kg pro Woche (${pct} % deines Gewichts). Das ist eine eigene Festlegung, keine ärztliche Empfehlung.`,
  };
}

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export type BuildLoseResult = { ok: true; input: NutritionGoalInput } | { ok: false; message: string };

/** Prüft Tempo und Zielgewicht und baut die lose-Zeile. Ein zu hoher Wert wird abgelehnt,
 *  nie still geändert. */
export function buildLoseInput(form: {
  pace: string;
  targetWeight: string;
  targetDate: string;
  weightKg: number | null;
}): BuildLoseResult {
  const field = paceFieldFor(form.weightKg);
  if (field.kind === "no-weight") return { ok: false, message: field.text };

  const pace = parseNumber(form.pace);
  if (pace == null || pace <= 0) return { ok: false, message: "Bitte ein Tempo in kg pro Woche eingeben." };
  if (pace > field.max) {
    return { ok: false, message: `Das Tempo darf höchstens ${fmtKg(field.max)} kg pro Woche betragen.` };
  }

  let targetWeightKg: number | null = null;
  if (form.targetWeight.trim() !== "") {
    targetWeightKg = parseNumber(form.targetWeight);
    if (targetWeightKg == null || targetWeightKg <= 0) {
      return { ok: false, message: "Das Zielgewicht muss größer als 0 sein." };
    }
  }

  return {
    ok: true,
    input: {
      goalType: "lose",
      pacePerWeekKg: pace,
      targetWeightKg,
      targetDate: form.targetDate || null,
    },
  };
}
