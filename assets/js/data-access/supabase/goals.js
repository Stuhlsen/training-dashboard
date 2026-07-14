import { supabase } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

function toGoal(row) {
  return {
    id: row.id,
    kind: row.kind,
    targetValue: row.target_value,
    targetDate: row.target_date,
    note: row.note,
    isActive: row.is_active,
  };
}

export async function getGoals(athleteId) {
  if (!supabase) return { ok: true, goals: [] };
  const { data, error } = await supabase
    .from("goals")
    .select("id, kind, target_value, target_date, note, is_active")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, goals: data.map(toGoal) };
}

export async function saveGoal(athleteId, goal) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("goals")
    .insert({
      athlete_id: athleteId,
      kind: goal.kind,
      target_value: goal.targetValue,
      target_date: goal.targetDate,
      note: goal.note,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}

export async function deactivateGoal(goalId) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase.from("goals").update({ is_active: false }).eq("id", goalId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
