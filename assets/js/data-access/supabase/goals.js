import { supabase } from "./client.js";

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
  const { data, error } = await supabase
    .from("goals")
    .select("id, kind, target_value, target_date, note, is_active")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return [];
  return data.map(toGoal);
}

export async function saveGoal(athleteId, goal) {
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
  if (error) return { id: null, error: error.message };
  return { id: data.id, error: null };
}

export async function deactivateGoal(goalId) {
  const { error } = await supabase.from("goals").update({ is_active: false }).eq("id", goalId);
  if (error) return { error: error.message };
  return { error: null };
}
