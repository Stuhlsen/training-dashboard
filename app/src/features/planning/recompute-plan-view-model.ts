/* ============================================================
   FEATURES/PLANNING/RECOMPUTE-PLAN-VIEW-MODEL.TS — reine Eingabe-Logik für
   „Rest neu berechnen" (Fahrplan 8 E13).

   Kein React, kein Fetch: aus der aktiven `training_plans`-Zeile + einem
   frischen Historie-Aggregat (V3) + heute einen `PlanGeneratorInput` (V2)
   bauen, der `regenerateFrom` (= Montag der laufenden KW) und `baseWeekModel`
   (= die eingefrorene Blockstruktur des Ur-Plans) trägt. `generatePlan()`
   rechnet damit nur die Wochen ab `regenerateFrom` neu, die Vergangenheit +
   Blockfolge bleiben unangetastet.

   Die Rahmenbedingungen kommen aus den `training_plans`-Spalten (bei der
   Erstellung validiert); nur die aktuelle FTP / das Messdatum reicht der
   Aufrufer frisch aus `config.ts` durch (die Spalte `ftp_at_creation` ist der
   Stand von damals).
   ============================================================ */

import { mondayOf } from "./new-plan-dialog-view-model";
import type { PlanGeneratorInput, AthleteDefaults } from "./new-plan-dialog-view-model";
import type { TrainingPlan, WeekModelEntry } from "../../api/types";

export interface RecomputeArgs {
  plan: TrainingPlan;
  /** Frisches V3-Aggregat aus `usePlanHistoryAggregate` (durchgereicht). */
  history?: unknown;
  /** Heute (lokal, ISO). */
  todayISO: string;
  /** Aktuelle FTP / Messdatum aus `athleteConfig()` — nicht der Erstell-Stand. */
  athleteDefaults: AthleteDefaults | null;
}

export type RecomputeInput =
  | {
      ok: true;
      input: PlanGeneratorInput;
      regenerateFromISO: string;
      /** Zahl der neu zu rechnenden Wochen (für den Dialog-Hinweis). */
      affectedWeeks: number;
    }
  | { ok: false; reason: string };

/**
 * `PlanGeneratorInput` (V2) für eine Restberechnung des aktiven Plans.
 * `regenerateFrom` = Montag der laufenden Kalenderwoche (deckt sich mit E6
 * „ab heute"). Gibt `{ ok:false, reason }` zurück, wenn nichts mehr zu
 * rechnen ist.
 */
export function buildRecomputeInput(args: RecomputeArgs): RecomputeInput {
  const { plan, history, todayISO, athleteDefaults } = args;

  const base = (plan.weekModel ?? []) as WeekModelEntry[];
  if (!base.length) {
    return { ok: false, reason: "Dieser Plan hat kein Wochenmodell — bitte den Plan neu erzeugen." };
  }

  const regenerateFromISO = mondayOf(todayISO);
  const cut = base.findIndex((w) => w.start >= regenerateFromISO);
  if (cut < 0) {
    return {
      ok: false,
      reason: "Der Plan endet vor der laufenden Woche — es gibt keine Restwochen zum Neuberechnen.",
    };
  }
  const affectedWeeks = base.length - cut;

  // Die bespielten Wochentage der ersten neu zu rechnenden Woche sind der
  // maßgebliche Wert; Fallback auf die Plan-Spalte.
  const tailWeekdays = base[cut]?.trainingWeekdays?.length
    ? [...base[cut].trainingWeekdays]
    : [...(plan.trainingWeekdays ?? [])];

  const input: PlanGeneratorInput = {
    startDate: base[0].start,
    mode: plan.mode,
    ...(plan.mode === "event" && plan.endDate ? { eventDate: plan.endDate } : {}),
    weeks: plan.weeks,
    trainingWeekdays: tailWeekdays,
    weeklyHours: plan.weeklyHours ?? 6,
    // Aktuelle FTP zuerst; erst dahinter der (u. U. veraltete) Erstell-Stand.
    currentFtp:
      athleteDefaults?.ftpMeasured ?? athleteDefaults?.eFTP ?? plan.ftpAtCreation ?? null,
    ftpMeasuredDate: athleteDefaults?.ftpMeasuredDate ?? null,
    // Ziel-FTP des Ur-Plans beibehalten — eine Restberechnung verschiebt nicht
    // das Saisonziel (deriveFtpTarget übernimmt einen gesetzten Wert 1:1).
    ftpTarget: plan.ftpTarget ?? null,
    indoorShare: plan.indoorShare ?? 0,
    focus: plan.focus,
    level: plan.level,
    model: plan.model,
    history,
    regenerateFrom: regenerateFromISO,
    baseWeekModel: base,
  };

  return { ok: true, input, regenerateFromISO, affectedWeeks };
}
