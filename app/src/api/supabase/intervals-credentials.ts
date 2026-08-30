/* ============================================================
   API/SUPABASE/INTERVALS-CREDENTIALS.TS — intervals.icu-Zugangsdaten des
   eingeloggten Users.

   Seit Fahrplan 7 CRED3 in der Tabelle `athlete_sync_config` (Migration
   0023) statt der Alt-Tabelle `intervals_credentials` (0019) — dieselbe
   Owner-only-RLS, kein anon-Grant. Grund: der Sync liest die Zugangsdaten
   ab CRED3 aus `athlete_sync_config`; ein Key-Wechsel muss dort landen,
   sonst erreicht er den Sync nicht mehr.

   Geteilte Tabelle mit `athlete-sync-config.ts` (grober Standort), aber je
   eigene Spalten: hier `intervals_api_key` / `intervals_athlete_id`, dort
   `weather_lat` / `weather_lon`. Beide Upserts nutzen
   `onConflict: "profile_id"` und fassen nur ihre eigenen Spalten an — eine
   bestehende Zeile behält die jeweils anderen Werte.
   ============================================================ */

import { supabase, getAuthedClient } from "./client";
import type { IntervalsCredentials, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface CredentialsRow {
  intervals_api_key: string | null;
  intervals_athlete_id: string | null;
}

/** `credentials: null`, wenn (noch) keine Zeile existiert ODER die Zeile nur
 *  den Standort trägt (kein `intervals_api_key`) — kein Fehler, das ist der
 *  normale Zustand vor dem ersten Eintragen in den Settings. */
export async function getIntervalsCredentials(
  userId: string,
): Promise<Result<{ credentials: IntervalsCredentials | null }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("athlete_sync_config")
    .select("intervals_api_key, intervals_athlete_id")
    .eq("profile_id", userId)
    .maybeSingle<CredentialsRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return {
    ok: true,
    credentials:
      data && data.intervals_api_key && data.intervals_athlete_id
        ? { apiKey: data.intervals_api_key, athleteId: data.intervals_athlete_id }
        : null,
  };
}

export async function updateIntervalsCredentials(
  userId: string,
  credentials: IntervalsCredentials,
): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("athlete_sync_config").upsert(
    {
      profile_id: userId,
      intervals_api_key: credentials.apiKey,
      intervals_athlete_id: credentials.athleteId,
    },
    { onConflict: "profile_id" },
  );
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
