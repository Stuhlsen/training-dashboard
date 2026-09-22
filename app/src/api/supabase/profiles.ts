import { supabase, getAuthedClient } from "./client";
import type { Profile, ProfileOwnFields, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, display_name, role, coach_id, wellbeing_public, ftp_public, is_admin, ladder_progression_enabled, units_preference, plan_offset_weeks, sports";

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
  plan_offset_weeks: number;
  sports: Profile["sports"];
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
    planOffsetWeeks: row.plan_offset_weeks ?? 0,
    sports: row.sports ?? ["ride"],
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

/** Migration 0026 — Ganzwochen-Verschiebung des Trainingsplans gegenüber der
 *  Code-Vorlage (Punkt 1 der 6-Punkte-Liste). Spalten-restriktives
 *  UPDATE-Grant wie units_preference (0020), RLS lässt nur die eigene Zeile
 *  zu. CHECK `between -8 and 12` in der Migration — der Aufrufer
 *  (useShiftPlan) begrenzt zusätzlich. */
/** Migration 0052 (Fahrplan 21, E3) — self-service Sportart-Auswahl wie
 *  ftp_public/units_preference, über die Basistabelle `profiles` (nicht
 *  `profiles_own`, Q5 verlangt Trainer-Sichtbarkeit über `profiles_visible`).
 *  Spalten-restriktives UPDATE-Grant wie die übrigen Self-Service-Felder, RLS
 *  lässt nur die eigene Zeile zu. Der Wert ist auf ` ride,run,swim ` und
 *  mindestens eine Sportart begrenzt (CHECK in Migration 0052) — der Aufrufer
 *  (SportsSection) verhindert schon im UI, dass weniger als eine Sportart
 *  abgewählt wird, damit kein rohes Constraint-Fail in die UI trägt. */
export async function updateSports(userId: string, value: readonly Profile["sports"][number][]): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ sports: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updatePlanOffsetWeeks(userId: string, value: number): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("profiles")
    .update({ plan_offset_weeks: value })
    .eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

interface ProfileOwnRow {
  id: string;
  has_password: boolean;
  birthdate: string | null;
  resting_hr: number | null;
  gender: ProfileOwnFields["gender"];
  height_cm: number | null;
  weight_kg: number | string | null;
  hr_max: number | null;
  updated_at: string;
}

function toProfileOwnFields(row: ProfileOwnRow): ProfileOwnFields {
  return {
    hasPassword: row.has_password,
    birthdate: row.birthdate,
    restingHr: row.resting_hr,
    gender: row.gender,
    heightCm: row.height_cm,
    // numeric(5,1) kommt je nach PostgREST-Antwort als Zahl oder String.
    weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
    hrMax: row.hr_max,
    updatedAt: row.updated_at,
  };
}

/** Die eigene Profil-Zeile (Geburtsdatum, Ruhepuls, Geschlecht, Größe,
 *  Gewicht, hrMax) über die self-only View `profiles_own` (Migration 0039,
 *  Fahrplan 17 E1/E2) — RLS filtert dort serverseitig auf `id = auth.uid()`,
 *  ein fremder Aufruf (anderer Athlet) liefert nie eine Zeile. Deshalb ohne
 *  `.eq("id", userId)`: die View kennt "die eigene Zeile" schon selbst. */
export async function getProfileBasics(): Promise<Result<{ basics: ProfileOwnFields }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("profiles_own")
    .select("id, has_password, birthdate, resting_hr, gender, height_cm, weight_kg, hr_max, updated_at")
    .single<ProfileOwnRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, basics: toProfileOwnFields(data) };
}

/** Migration 0039 (Fahrplan 17 E3) — sechs spaltenrestriktive UPDATE-Grants
 *  wie ftp_public/units_preference, RLS lässt jeweils nur die eigene Zeile
 *  zu. Schreiben bleibt auf der Basistabelle `profiles` (die View
 *  `profiles_own` ist reiner Lesepfad, kein UPDATE-Grant darauf). */
export async function updateBirthdate(userId: string, value: string | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ birthdate: value }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateRestingHr(userId: string, value: number | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ resting_hr: value }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateGender(userId: string, value: ProfileOwnFields["gender"]): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ gender: value }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateHeightCm(userId: string, value: number | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ height_cm: value }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateWeightKg(userId: string, value: number | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ weight_kg: value }).eq("id", userId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

export async function updateHrMax(userId: string, value: number | null): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("profiles").update({ hr_max: value }).eq("id", userId);
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
