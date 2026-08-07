import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export interface LadderHistoryEntry {
  id: string;
  formatId: string;
  step: number;
  validFrom: string;
  reason: string;
  sourceRideId: string | null;
  lockedUntil: string | null;
}

interface LadderHistoryRow {
  id: string;
  format_id: string;
  step: number;
  valid_from: string;
  reason: string;
  source_ride_id: string | null;
  locked_until: string | null;
}

function toEntry(row: LadderHistoryRow): LadderHistoryEntry {
  return {
    id: row.id,
    formatId: row.format_id,
    step: row.step,
    validFrom: row.valid_from,
    reason: row.reason,
    sourceRideId: row.source_ride_id,
    lockedUntil: row.locked_until,
  };
}

/** Leiterhistorie eines Profils, alle Formate gemeinsam (D2, Migration 0015). */
export async function getLadderHistory(
  profileId: string,
): Promise<Result<{ history: LadderHistoryEntry[] }>> {
  if (!supabase) return { ok: true, history: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ladder_history")
    .select("id, format_id, step, valid_from, reason, source_ride_id, locked_until")
    .eq("profile_id", profileId)
    .order("valid_from", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, history: (data as LadderHistoryRow[]).map(toEntry) };
}

/** Neuer Leiterstand-Eintrag. `validFrom` ist Pflicht (kein Default hier —
 *  api/supabase/ importiert nur Typen aus core/, s. Schichtenregel; das
 *  "heute"-Datum liefert der Aufrufer über core/format.js::localISODate()). */
export async function recordLadderStep(
  profileId: string,
  entry: {
    formatId: string;
    step: number;
    reason: string;
    sourceRideId?: string | null;
    validFrom: string;
    lockedUntil?: string | null;
  },
): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ladder_history")
    .insert({
      profile_id: profileId,
      format_id: entry.formatId,
      step: entry.step,
      valid_from: entry.validFrom,
      reason: entry.reason,
      source_ride_id: entry.sourceRideId || null,
      locked_until: entry.lockedUntil || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}
