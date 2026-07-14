import { supabase } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

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
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, coach_id, wellbeing_public, is_admin")
    .eq("id", userId)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, profile: toProfile(data) };
}

export async function updateDisplayName(userId, name) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateWellbeingPublic(userId, value) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await supabase
    .from("profiles")
    .update({ wellbeing_public: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
