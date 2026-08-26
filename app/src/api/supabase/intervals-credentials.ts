/* ============================================================
   API/SUPABASE/INTERVALS-CREDENTIALS.TS — intervals.icu-Zugangsdaten des
   eingeloggten Users (Migration 0019). Eigene Tabelle statt Spalten auf
   profiles — profiles ist öffentlich lesbar (0002_grants.sql), der Key
   darf da nicht landen. RLS lässt ausschließlich die eigene Zeile zu.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { IntervalsCredentials, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface CredentialsRow {
  api_key: string;
  intervals_athlete_id: string;
}

/** `credentials: null`, wenn (noch) keine Zeile existiert — kein Fehler,
 *  das ist der normale Zustand vor dem ersten Eintragen in den Settings. */
export async function getIntervalsCredentials(
  userId: string,
): Promise<Result<{ credentials: IntervalsCredentials | null }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("intervals_credentials")
    .select("api_key, intervals_athlete_id")
    .eq("profile_id", userId)
    .maybeSingle<CredentialsRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return {
    ok: true,
    credentials: data ? { apiKey: data.api_key, athleteId: data.intervals_athlete_id } : null,
  };
}

export async function updateIntervalsCredentials(
  userId: string,
  credentials: IntervalsCredentials,
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("intervals_credentials").upsert({
    profile_id: userId,
    api_key: credentials.apiKey,
    intervals_athlete_id: credentials.athleteId,
  });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
