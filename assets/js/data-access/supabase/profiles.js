import { supabase, getAuthedClient } from "./client.js";

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

/** Löst den Anzeigenamen eines Athleten (CONFIG.athletes[].name, z.B.
 *  "Stuhlsen"/"hc_diZee") auf seine Supabase-Profil-UUID auf. Nötig, weil
 *  `Data.activeAthleteId` intern nur "athlete1"/"athlete2" ist, athleten-
 *  scoped Tabellen (plan_cards, events, goals, …) aber die echte UUID als
 *  `athlete_id` erwarten — ein `.eq("athlete_id", "athlete1")` würde am
 *  uuid-Spaltentyp scheitern. Öffentlicher Read (RLS: "profiles: öffentlich
 *  lesbar"), kein Login nötig. */
export async function findProfileIdByDisplayName(displayName) {
  if (!supabase) return { ok: true, id: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("display_name", displayName)
    .maybeSingle();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data?.id ?? null };
}

export async function getProfile(userId) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("profiles")
    .select("id, display_name, role, coach_id, wellbeing_public, is_admin")
    .eq("id", userId)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, profile: toProfile(data) };
}

export async function updateDisplayName(userId, name) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ display_name: name })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateWellbeingPublic(userId, value) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ wellbeing_public: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
