import { supabase } from "./client.js";

function toProfile(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    coachId: row.coach_id,
    wellbeingPublic: row.wellbeing_public,
    isAdmin: row.is_admin,
  };
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, coach_id, wellbeing_public, is_admin")
    .eq("id", userId)
    .single();
  if (error) return { error: error.message };
  return toProfile(data);
}

export async function updateDisplayName(userId, name) {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { error: null };
}

export async function updateWellbeingPublic(userId, value) {
  const { error } = await supabase
    .from("profiles")
    .update({ wellbeing_public: value })
    .eq("id", userId);
  if (error) return { error: error.message };
  return { error: null };
}
