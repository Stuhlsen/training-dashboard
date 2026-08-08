import { supabase, getAuthedClient } from "./client";
import type { Goal, GoalInput, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface GoalRow {
  id: string;
  kind: string;
  target_value: number | null;
  target_date: string | null;
  note: string | null;
  is_active: boolean;
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    kind: row.kind,
    targetValue: row.target_value,
    targetDate: row.target_date,
    note: row.note,
    isActive: row.is_active,
  };
}

/** Aktive Ziele eines Athleten, älteste zuerst (Port von
 *  data-access/supabase/goals.js::getGoals()). */
export async function getGoals(athleteId: string): Promise<Result<{ goals: Goal[] }>> {
  if (!supabase) return { ok: true, goals: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("goals")
    .select("id, kind, target_value, target_date, note, is_active")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, goals: (data as GoalRow[]).map(toGoal) };
}

export async function saveGoal(athleteId: string, goal: GoalInput): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("goals")
    .insert({
      athlete_id: athleteId,
      kind: goal.kind,
      target_value: goal.targetValue ?? null,
      target_date: goal.targetDate ?? null,
      note: goal.note ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}

/** Ziele werden nie gelöscht, nur deaktiviert — wie im Vanilla-Original. */
export async function deactivateGoal(goalId: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("goals").update({ is_active: false }).eq("id", goalId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
