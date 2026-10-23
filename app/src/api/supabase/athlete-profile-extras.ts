import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

/** Fahrplan 26: `athlete_profile_extras` (Migration 0078) — Stammdaten, die
 *  bisher in `config.ts` standen. Name, Sportarten, HFmax und Ruhepuls liegen
 *  weiter in `profiles`. Heute schreibt noch niemand diese Tabelle (E4:
 *  Einstellungen) — eine fehlende Zeile ist der Normalfall. */

export interface AthleteProfileExtras {
  ftpMeasured: number | null;
  ftpMeasuredDate: string | null;
  eFTP: number | null;
  ftpGoal: number | null;
  seasonStartFtp: number | null;
  dataSources: string[];
  bmr: { heightCm: number; age: number; sex: string; weightKg: number } | null;
  generatedPlan: boolean;
}

interface Row {
  ftp_measured: number | null;
  ftp_measured_date: string | null;
  e_ftp: number | null;
  ftp_goal: number | null;
  season_start_ftp: number | null;
  data_sources: string[] | null;
  bmr: AthleteProfileExtras["bmr"];
  generated_plan: boolean | null;
}

export async function getAthleteProfileExtras(
  profileId: string,
): Promise<Result<{ extras: AthleteProfileExtras | null }>> {
  if (!supabase) return { ok: true, extras: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("athlete_profile_extras")
    .select(
      "ftp_measured, ftp_measured_date, e_ftp, ftp_goal, season_start_ftp, data_sources, bmr, generated_plan",
    )
    .eq("profile_id", profileId)
    .maybeSingle<Row>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  if (!data) return { ok: true, extras: null };
  return {
    ok: true,
    extras: {
      ftpMeasured: data.ftp_measured,
      ftpMeasuredDate: data.ftp_measured_date,
      eFTP: data.e_ftp,
      ftpGoal: data.ftp_goal,
      seasonStartFtp: data.season_start_ftp,
      dataSources: data.data_sources ?? [],
      bmr: data.bmr,
      generatedPlan: data.generated_plan === true,
    },
  };
}
