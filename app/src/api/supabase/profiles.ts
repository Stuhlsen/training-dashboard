import { supabase, getAuthedClient } from "./client";
import type { Profile, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, display_name, role, coach_id, wellbeing_public, ftp_public, is_admin, ladder_progression_enabled, units_preference";

interface ProfileRow {
  id: string;
  display_name: string | null;
  role: Profile["role"];
  coach_id: string | null;
  wellbeing_public: boolean;
  ftp_public: boolean;
  is_admin: boolean;
  ladder_progression_enabled: boolean;
  units_preference: Profile["unitsPreference"];
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role,
    coachId: row.coach_id,
    wellbeingPublic: row.wellbeing_public,
    ftpPublic: row.ftp_public,
    isAdmin: row.is_admin,
    ladderProgressionEnabled: row.ladder_progression_enabled,
    unitsPreference: row.units_preference,
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
 *  Trainer tatsächlich der Trainer des gerade angezeigten Athleten ist.
 *
 *  Liest über die View `profiles_visible` (Migration 0022, #32): die
 *  sensiblen Spalten coach_id/is_admin sind auf der Basistabelle nicht
 *  gegrantet. Die View zeigt nur die eigene Zeile + Zeilen selbst
 *  gecoachter Athleten — ein Coach findet also die Zeile seines Athleten,
 *  jeder andere bekommt `null` (→ isTrainer: false in resolveTrainerContext). */
export async function getProfileByDisplayName(
  displayName: string,
): Promise<Result<{ profile: Profile | null }>> {
  if (!supabase) return { ok: true, profile: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("profiles_visible")
    .select(SELECT_COLS)
    .eq("display_name", displayName)
    .maybeSingle<ProfileRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, profile: data ? toProfile(data) : null };
}

/** Die eigene Profil-Zeile des eingeloggten Users (Rolle, coachId, isAdmin,
 *  Ladder-/Units-Präferenz). Liest über die View `profiles_visible`
 *  (Migration 0022, #32) — dort filtert `id = auth.uid()` die eigene Zeile,
 *  die sensiblen Spalten coach_id/is_admin sind auf der Basistabelle nicht
 *  mehr gegrantet. */
export async function getProfile(userId: string): Promise<Result<{ profile: Profile }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("profiles_visible")
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

/** Migration 0025 — eigenes spalten-restriktives UPDATE-Grant wie
 *  wellbeing_public, RLS lässt nur die eigene Zeile zu. Steuert, ob der Sync
 *  gemessene FTP + Ramp-Test-Historie in den öffentlichen rides*.json-Payload
 *  schreibt. */
export async function updateFtpPublic(userId: string, value: boolean): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ ftp_public: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Seit Migration 0018 selbstbedienbar (vorher nur per SQL, s. 0016) — Grant
 *  ist spaltenrestriktiv wie display_name/wellbeing_public, RLS lässt nur
 *  die eigene Zeile zu. */
export async function updateLadderProgressionEnabled(userId: string, value: boolean): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ ladder_progression_enabled: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Migration 0020 — eigenes Grant wie ladderProgressionEnabled (0018), s.
 *  Kopfkommentar dort: profiles' UPDATE-Grant ist spaltenrestriktiv. */
export async function updateUnitsPreference(userId: string, value: "km" | "mi"): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ units_preference: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Anzeigename eines beliebigen Profils (Trainer-Verknüpfung, Settings/Daten)
 *  — öffentlicher Read wie findProfileIdByDisplayName(), kein
 *  getAuthedClient() nötig (profiles: "öffentlich lesbar", 0001/0002). */
export async function getCoachDisplayName(coachId: string): Promise<Result<{ name: string | null }>> {
  if (!supabase) return { ok: true, name: null };
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", coachId)
    .maybeSingle<{ display_name: string | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, name: data?.display_name ?? null };
}
