import { supabase, getAuthedClient } from "./client";
import type { Profile, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS = "id, display_name, role, coach_id, wellbeing_public, is_admin, ladder_progression_enabled";

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: Profile["role"];
  coach_id: string | null;
  wellbeing_public: boolean;
  is_admin: boolean;
  ladder_progression_enabled: boolean;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    coachId: row.coach_id,
    wellbeingPublic: row.wellbeing_public,
    isAdmin: row.is_admin,
    ladderProgressionEnabled: row.ladder_progression_enabled,
  };
}

/** Löst den Anzeigenamen eines Athleten (CONFIG.athletes[].name, z.B.
 *  "Stuhlsen"/"hc_diZee") auf seine Supabase-Profil-UUID auf. Nötig, weil die
 *  interne Kennung nur "athlete1"/"athlete2" ist, athletenscoped Tabellen
 *  (plan_cards, events, proposals, …) aber die echte UUID als `athlete_id`
 *  erwarten — ein `.eq("athlete_id", "athlete1")` würde am uuid-Spaltentyp
 *  scheitern. Öffentlicher Read (RLS: "profiles: öffentlich lesbar"), kein
 *  Login nötig. */
export async function findProfileIdByDisplayName(
  displayName: string,
): Promise<Result<{ id: string | null }>> {
  if (!supabase) return { ok: true, id: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("display_name", displayName)
    .maybeSingle();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data?.id ?? null };
}

/** Wie findProfileIdByDisplayName(), liefert aber das volle Profil (inkl.
 *  coachId) statt nur der ID — gebraucht, um zu prüfen, ob der eingeloggte
 *  Trainer tatsächlich der Trainer des gerade angezeigten Athleten ist. */
export async function getProfileByDisplayName(
  displayName: string,
): Promise<Result<{ profile: Profile | null }>> {
  if (!supabase) return { ok: true, profile: null };
  const { data, error } = await supabase
    .from("profiles")
    .select(SELECT_COLS)
    .eq("display_name", displayName)
    .maybeSingle<ProfileRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, profile: data ? toProfile(data) : null };
}

export async function getProfile(userId: string): Promise<Result<{ profile: Profile }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("profiles")
    .select(SELECT_COLS)
    .eq("id", userId)
    .single<ProfileRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, profile: toProfile(data) };
}

export async function updateDisplayName(userId: string, name: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ display_name: name }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateWellbeingPublic(userId: string, value: boolean): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ wellbeing_public: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
