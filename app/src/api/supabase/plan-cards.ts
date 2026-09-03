import { supabase, getAuthedClient } from "./client";
import type { PlanCard, PlanCardInput, PlanCardPatch, Result, WorkoutJson } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, planned_date, sort_order, title, workout_type, km, duration_min, tss_planned, " +
  "status, note, workout, workout_structure, cancel_reason, moved_from_date, move_reason, week, phase, " +
  "pushed_external_id, created_at, updated_at";

interface PlanCardRow {
  id: string;
  planned_date: string;
  sort_order: number;
  title: string | null;
  workout_type: string | null;
  km: number | null;
  duration_min: number | null;
  tss_planned: number | null;
  status: string | null;
  note: string | null;
  workout: WorkoutJson;
  workout_structure: WorkoutJson;
  cancel_reason: string | null;
  moved_from_date: string | null;
  move_reason: string | null;
  week: string | null;
  phase: string | null;
  pushed_external_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Mapped eine plan_cards-Zeile auf exakt die Session-Shape, die in der
 *  Vanilla-Version core/planning.js::applyAdjustment() produziert hat — die
 *  Feldnamen bleiben, damit die portierte core-Schicht (Etappe 2a) und die
 *  Karten-UI (Etappe 6) unverändert darauf rechnen können. */
function toPlanCard(row: PlanCardRow): PlanCard {
  return {
    id: row.id,
    date: row.planned_date,
    sortOrder: row.sort_order,
    name: row.title,
    typ: row.workout_type,
    km: row.km,
    durationMin: row.duration_min,
    tssPlanned: row.tss_planned,
    week: row.week,
    phase: row.phase,
    details: row.note,
    workout: row.workout,
    workoutStructure: row.workout_structure,
    originalDate: row.moved_from_date || undefined,
    movedReason: row.move_reason || undefined,
    cancelled: row.status === "ausgefallen" || undefined,
    cancelReason: row.cancel_reason || undefined,
    pushedExternalId: row.pushed_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPlanCards(athleteId: string): Promise<Result<{ cards: PlanCard[] }>> {
  if (!supabase) return { ok: true, cards: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("planned_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<PlanCardRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, cards: data.map(toPlanCard) };
}

/** Patch-Update für Move/Cancel/Undo/Karten-Bearbeitung/Push — alle Aufrufer
 *  schicken nur die Felder, die sie tatsächlich ändern (ein Move z.B. nie
 *  title/workout), das `!== undefined`-Muster hält das entkoppelt. */
export async function updatePlanCard(
  id: string,
  patch: PlanCardPatch,
): Promise<Result<{ card: PlanCard }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const updates: Record<string, unknown> = {};
  if (patch.plannedDate !== undefined) updates.planned_date = patch.plannedDate;
  if (patch.sortOrder !== undefined) updates.sort_order = patch.sortOrder;
  if (patch.movedFromDate !== undefined) updates.moved_from_date = patch.movedFromDate;
  if (patch.moveReason !== undefined) updates.move_reason = patch.moveReason;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.cancelReason !== undefined) updates.cancel_reason = patch.cancelReason;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.typ !== undefined) updates.workout_type = patch.typ;
  if (patch.tssPlanned !== undefined) updates.tss_planned = patch.tssPlanned;
  if (patch.km !== undefined) updates.km = patch.km;
  if (patch.details !== undefined) updates.note = patch.details;
  if (patch.workout !== undefined) updates.workout = patch.workout;
  if (patch.workoutStructure !== undefined) updates.workout_structure = patch.workoutStructure;
  if (patch.pushedExternalId !== undefined) updates.pushed_external_id = patch.pushedExternalId;
  if (patch.week !== undefined) updates.week = patch.week;
  if (patch.phase !== undefined) updates.phase = patch.phase;

  const { data, error } = await client
    .from("plan_cards")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single<PlanCardRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toPlanCard(data) };
}

/** Legt eine neue Karte an. `sortOrder` berechnet der Aufrufer (der Hook)
 *  aus den bereits geladenen Karten desselben Tages, damit diese Schicht
 *  keine Kenntnis vom übrigen Zustand braucht. */
export async function createPlanCard(
  athleteId: string,
  card: PlanCardInput,
): Promise<Result<{ card: PlanCard }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .insert({
      athlete_id: athleteId,
      planned_date: card.date,
      sort_order: card.sortOrder ?? 0,
      title: card.name,
      workout_type: card.typ,
      tss_planned: card.tssPlanned ?? null,
      km: card.km ?? null,
      note: card.details ?? null,
      workout: card.workout ?? null,
      workout_structure: card.workoutStructure ?? null,
    })
    .select(SELECT_COLS)
    .single<PlanCardRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toPlanCard(data) };
}

export async function removePlanCard(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("plan_cards").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
