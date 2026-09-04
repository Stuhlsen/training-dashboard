/* ============================================================
   FEATURES/PLANNING/PLAN-PERSIST.TS — reiner Übersetzer: erzeugter Plan
   (`GeneratedPlan`, E2) → das, was E6 in die DB schreibt.

   Kein React, kein Fetch. Zwei Funktionen:
   - `flattenPlanCards()` — Wochen → flache Kartenliste mit `sortOrder`
     je Tag (mehrere Karten am selben Datum behalten ihre Generator-
     Reihenfolge).
   - `trainingPlanDraft()` — Formular + Input + erzeugter Plan →
     `TrainingPlanDraft` (V1 `training_plans`). `athlete_id`/`created_by`/
     `is_active` setzt der Adapter, nicht dieser Draft.

   Der Schreibpfad selbst (Adapter + Orchestrierung inkl. „alten Plan
   ersetzen") liegt in useCreateTrainingPlan.ts.
   ============================================================ */

import { addDaysISO } from "../../core/format.js";
import type { TrainingPlanDraft } from "../../api/types";
import type { PlanCardBulkDraft } from "../../api/supabase/plan-cards";
import type {
  GeneratedPlan,
  NewPlanFormState,
  PlanGeneratorInput,
} from "./new-plan-dialog-view-model";

/**
 * Wochen des erzeugten Plans → flache Kartenliste für `createPlanCards()`.
 * `sortOrder` ist der 0-basierte Index der Karte unter allen Karten desselben
 * Tages (der Generator legt Qualitäts- vor lockeren Tagen ab, diese
 * Reihenfolge bleibt erhalten) — dasselbe Feld, das die Karten-UI im Raster
 * sortiert.
 */
export function flattenPlanCards(plan: GeneratedPlan): PlanCardBulkDraft[] {
  const out: PlanCardBulkDraft[] = [];
  const perDay = new Map<string, number>();
  for (const week of plan.weeks) {
    for (const c of week.cards) {
      const n = perDay.get(c.date) ?? 0;
      perDay.set(c.date, n + 1);
      out.push({
        date: c.date,
        name: c.name,
        typ: c.typ,
        phase: c.phase || null,
        week: c.isoWeek || null,
        tssPlanned: Number.isFinite(c.tssPlanned) ? c.tssPlanned : null,
        durationMin: Number.isFinite(c.durationMin) ? c.durationMin : null,
        km: c.km ?? null,
        workout: c.workout ?? null,
        workoutStructure: c.workoutStructure ?? null,
        sortOrder: n,
      });
    }
  }
  return out;
}

/** Formularzustand serialisierbar machen (nur Primitive/Arrays — reicht für
 *  das `params`-jsonb, das rein der Reproduzierbarkeit dient). */
function serialiseForm(form: NewPlanFormState): Record<string, unknown> {
  return { ...form, trainingWeekdays: [...form.trainingWeekdays] };
}

/**
 * `TrainingPlanDraft` (V1) aus dem, was der Dialog schon hat. `endDate`
 * kommt aus der letzten erzeugten Woche (der Generator kann eine zu kurze
 * Planlänge auf 3 Wochen anheben — dann ist das Ende später als aus dem
 * Formular gerechnet); Fallback nur, falls `plan.weeks` leer wäre.
 *
 * @param input     der an `generatePlan()` übergebene V2-Input
 * @param form      Roh-Formularzustand (für `params`)
 * @param plan      Ausgabe von `generatePlan()`
 * @param goalEventId  ID des Ziel-Events (bestehend oder frisch angelegt),
 *                     sonst null
 */
export function trainingPlanDraft(
  input: PlanGeneratorInput,
  form: NewPlanFormState,
  plan: GeneratedPlan,
  goalEventId: string | null,
): TrainingPlanDraft {
  const weeks = plan.weeks.length;
  const lastEnd = plan.weeks[weeks - 1]?.end;
  const endDate =
    lastEnd ??
    input.eventDate ??
    addDaysISO(input.startDate, Math.max(1, weeks) * 7 - 1);

  // Die tatsächlich bespielten Wochentage stehen im weekModel des Generators
  // (`effectiveWeekdays`) — bei schwacher Planerfüllung wirft der Generator
  // einen Trainingstag raus, dann weicht das vom Formularwert ab. Die
  // Spalte muss zum weekModel passen, nicht zum Rohformular (E7 leitet
  // Slots aus dem weekModel ab). Rohformular nur als Fallback.
  const wm0 = plan.weekModel[0] as { trainingWeekdays?: number[] } | undefined;
  const trainingWeekdays = wm0?.trainingWeekdays?.length
    ? [...wm0.trainingWeekdays]
    : [...input.trainingWeekdays];

  return {
    mode: input.mode,
    goalEventId,
    startDate: input.startDate,
    endDate,
    weeks,
    model: input.model,
    focus: input.focus,
    level: input.level,
    trainingWeekdays,
    weeklyHours: Number.isFinite(input.weeklyHours) ? input.weeklyHours : null,
    indoorShare: Number.isFinite(input.indoorShare) ? input.indoorShare : null,
    ftpAtCreation: input.currentFtp ?? null,
    ftpTarget: plan.ftpTarget ?? null,
    params: {
      form: serialiseForm(form),
      history: (input.history as unknown) ?? null,
      warnings: plan.warnings,
    },
    weekModel: plan.weekModel ?? [],
  };
}
