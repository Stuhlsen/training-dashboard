import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

/** Fahrplan 26: `training_profile_data` (Migration 0078) — eine Zeile je
 *  Profil mit dem kleinen Rest der Payload. */

export interface TrainingProfileDataRow {
  powerCurves: unknown;
  forecast: unknown;
  athleteWeight: unknown;
  wellnessMeta: unknown;
  /** updated, source, count, ftp, ftpPublic, ftpGoal, dataSources, hrMax, … */
  meta: Record<string, unknown>;
  /** ftpHistory, plannedSessions, adjustments, powerCurveBlocks */
  extra: Record<string, unknown>;
}

interface Row {
  power_curves: unknown;
  forecast: unknown;
  athlete_weight: unknown;
  wellness_meta: unknown;
  meta: Record<string, unknown> | null;
  extra: Record<string, unknown> | null;
}

/** Die Profil-Zeile oder `row: null`, wenn der Sync für dieses Profil noch nie
 *  gelaufen ist (oder RLS sie dem Betrachter nicht zeigt — beides liefert
 *  keine Zeile; ein echter Lesefehler kommt als `ok: false`). */
export async function getTrainingProfileData(
  profileId: string,
): Promise<Result<{ row: TrainingProfileDataRow | null }>> {
  if (!supabase) return { ok: true, row: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_profile_data")
    .select("power_curves, forecast, athlete_weight, wellness_meta, meta, extra")
    .eq("profile_id", profileId)
    .maybeSingle<Row>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  if (!data) return { ok: true, row: null };
  return {
    ok: true,
    row: {
      powerCurves: data.power_curves,
      forecast: data.forecast,
      athleteWeight: data.athlete_weight,
      wellnessMeta: data.wellness_meta,
      meta: data.meta ?? {},
      extra: data.extra ?? {},
    },
  };
}

/** Nur der `meta`-Block — für die Stammdaten (`useAthleteConfig`), ohne
 *  Power-Kurven und Prognose mitzuziehen. */
export async function getTrainingMeta(
  profileId: string,
): Promise<Result<{ meta: Record<string, unknown> | null }>> {
  if (!supabase) return { ok: true, meta: null };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("training_profile_data")
    .select("meta")
    .eq("profile_id", profileId)
    .maybeSingle<{ meta: Record<string, unknown> | null }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, meta: data?.meta ?? null };
}
