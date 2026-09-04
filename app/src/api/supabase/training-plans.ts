/* ============================================================
   API/SUPABASE/TRAINING-PLANS.TS — Adapter für `training_plans`
   (Migration 0028, Fahrplan 8 E1/E6).

   Ein selbst gebauter Trainingsplan lebt komplett in der DB: diese Tabelle
   hält die Rahmenbedingungen + die materialisierte Wochenstruktur
   (`week_model`), die Tageskarten liegen in `plan_cards` mit `plan_id`.

   `createTrainingPlan()` legt die Zeile bewusst mit `is_active = false` an —
   der Orchestrator (useCreateTrainingPlan) schaltet sie erst scharf, wenn
   die Karten geschrieben sind und ein evtl. vorhandener alter Plan
   deaktiviert ist (partieller Unique-Index „ein aktiver Plan je Athlet").
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type {
  PlanFocus,
  PlanLevel,
  PlanMode,
  PlanModel,
  Result,
  TrainingPlan,
  TrainingPlanDraft,
  WeekModelEntry,
} from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

const SELECT_COLS =
  "id, athlete_id, created_by, is_active, mode, goal_event_id, start_date, end_date, " +
  "weeks, model, focus, level, training_weekdays, weekly_hours, indoor_share, " +
  "ftp_at_creation, ftp_target, params, week_model, created_at, updated_at";

interface TrainingPlanRow {
  id: string;
  athlete_id: string;
  created_by: string;
  is_active: boolean;
  mode: string;
  goal_event_id: string | null;
  start_date: string;
  end_date: string;
  weeks: number;
  model: string;
  focus: string;
  level: string;
  training_weekdays: number[] | null;
  weekly_hours: number | null;
  indoor_share: number | null;
  ftp_at_creation: number | null;
  ftp_target: number | null;
  params: Record<string, unknown> | null;
  week_model: unknown[] | null;
  created_at: string;
  updated_at: string;
}

export function toTrainingPlan(row: TrainingPlanRow): TrainingPlan {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    createdBy: row.created_by,
    isActive: row.is_active,
    mode: row.mode as PlanMode,
    goalEventId: row.goal_event_id,
    startDate: row.start_date,
    endDate: row.end_date,
    weeks: row.weeks,
    model: row.model as PlanModel,
    focus: row.focus as PlanFocus,
    level: row.level as PlanLevel,
    trainingWeekdays: row.training_weekdays ?? [],
    weeklyHours: row.weekly_hours,
    indoorShare: row.indoor_share,
    ftpAtCreation: row.ftp_at_creation,
    ftpTarget: row.ftp_target,
    params: row.params ?? {},
    weekModel: (row.week_model ?? []) as WeekModelEntry[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Die aktive Zeile des Athleten, `null` wenn keine existiert. Ohne
 *  Supabase-Konfig ist das kein Fehler (wie `listPlanCards`), sondern
 *  schlicht „kein Plan". `training_plans` hat keinen anon-GRANT — ein
 *  ausgeloggter Betrachter bekommt hier einen Fehler zurück, den der Hook
 *  auf `null` abbildet (der „Neuer Plan"-Dialog ist ohnehin nur für
 *  eingeloggte, schreibberechtigte Nutzer sichtbar). */
export async function listActiveTrainingPlan(
  athleteProfileId: string,
): Promise<Result<{ plan: TrainingPlan | null }>> {
  if (!supabase) return { ok: true, plan: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_plans")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteProfileId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<TrainingPlanRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, plan: data.length ? toTrainingPlan(data[0]) : null };
}

/** Legt die Plan-Zeile an — `is_active = false` (s. Modulkopf). */
export async function createTrainingPlan(
  athleteProfileId: string,
  createdBy: string,
  draft: TrainingPlanDraft,
): Promise<Result<{ plan: TrainingPlan }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_plans")
    .insert({
      athlete_id: athleteProfileId,
      created_by: createdBy,
      is_active: false,
      mode: draft.mode,
      goal_event_id: draft.goalEventId,
      start_date: draft.startDate,
      end_date: draft.endDate,
      weeks: draft.weeks,
      model: draft.model,
      focus: draft.focus,
      level: draft.level,
      training_weekdays: draft.trainingWeekdays,
      weekly_hours: draft.weeklyHours,
      indoor_share: draft.indoorShare,
      ftp_at_creation: draft.ftpAtCreation,
      ftp_target: draft.ftpTarget,
      params: draft.params,
      week_model: draft.weekModel,
    })
    .select(SELECT_COLS)
    .single<TrainingPlanRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, plan: toTrainingPlan(data) };
}

/** `is_active` einer Zeile setzen — scharf schalten (neuer Plan) oder
 *  deaktivieren (alter Plan, „eingefrorene Vergangenheit"). */
export async function setTrainingPlanActive(
  id: string,
  isActive: boolean,
): Promise<Result<{ plan: TrainingPlan }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_plans")
    .update({ is_active: isActive })
    .eq("id", id)
    .select(SELECT_COLS)
    .single<TrainingPlanRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, plan: toTrainingPlan(data) };
}

/** Blockstruktur + Momentaufnahme einer bestehenden Plan-Zeile aktualisieren —
 *  „Rest neu berechnen" (Fahrplan 8 E13): `id` / `is_active` / `start_date`
 *  bleiben, nur `week_model` (frischer Schwanz) + `params` (frische Historie/
 *  Warnungen) ziehen nach. Kein neuer Plan, kein `is_active`-Flip. */
export async function updateTrainingPlan(
  id: string,
  patch: { weekModel: WeekModelEntry[]; params: Record<string, unknown> },
): Promise<Result<{ plan: TrainingPlan }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_plans")
    .update({ week_model: patch.weekModel, params: patch.params })
    .eq("id", id)
    .select(SELECT_COLS)
    .single<TrainingPlanRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, plan: toTrainingPlan(data) };
}

/** Eine Plan-Zeile hart löschen — Rollback-Pfad, wenn „Plan übernehmen" nach
 *  dem Anlegen der (noch inaktiven) Zeile scheitert. `plan_cards.plan_id` ist
 *  `on delete set null`, verwaiste Karten bleiben also lesbar; der Aufrufer
 *  räumt sie über `deletePlanCardsForPlan()` separat weg. */
export async function deleteTrainingPlan(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("training_plans").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
