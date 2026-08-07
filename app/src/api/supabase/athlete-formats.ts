import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export interface AthleteFormat {
  id: string;
  formatId: string;
  active: boolean;
}

interface AthleteFormatRow {
  id: string;
  format_id: string;
  active: boolean;
}

function toAthleteFormat(row: AthleteFormatRow): AthleteFormat {
  return { id: row.id, formatId: row.format_id, active: row.active };
}

/** Welche Formate für ein Profil aktiv/inaktiv gesetzt sind (D2, L1.1). */
export async function getAthleteFormats(
  profileId: string,
): Promise<Result<{ athleteFormats: AthleteFormat[] }>> {
  if (!supabase) return { ok: true, athleteFormats: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("athlete_formats")
    .select("id, format_id, active")
    .eq("profile_id", profileId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, athleteFormats: (data as AthleteFormatRow[]).map(toAthleteFormat) };
}

/** Setzt/upsertet den Aktiv-Status eines Formats für ein Profil. */
export async function setAthleteFormatActive(
  profileId: string,
  formatId: string,
  active: boolean,
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("athlete_formats")
    .upsert({ profile_id: profileId, format_id: formatId, active }, { onConflict: "profile_id,format_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
