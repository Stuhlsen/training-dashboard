import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

export interface FtpHistoryEntry {
  id: string;
  ftpWatt: number;
  validFrom: string;
  source: string;
  note: string | null;
}

interface FtpHistoryRow {
  id: string;
  ftp_watt: number;
  valid_from: string;
  source: string;
  note: string | null;
}

function toEntry(row: FtpHistoryRow): FtpHistoryEntry {
  return { id: row.id, ftpWatt: row.ftp_watt, validFrom: row.valid_from, source: row.source, note: row.note };
}

/** FTP-Historie eines Profils, älteste zuerst (Migration 0009). */
export async function getFtpHistory(
  profileId: string,
): Promise<Result<{ entries: FtpHistoryEntry[] }>> {
  if (!supabase) return { ok: true, entries: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ftp_history")
    .select("id, ftp_watt, valid_from, source, note")
    .eq("profile_id", profileId)
    .order("valid_from", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, entries: (data as FtpHistoryRow[]).map(toEntry) };
}

/** Legt einen neuen FTP-Historie-Eintrag an (v1: nur anlegen, kein Bearbeiten
 *  bestehender Einträge — RLS lässt ohnehin nur den Athleten selbst zu). */
export async function saveFtpEntry(
  profileId: string,
  entry: { ftpWatt: number; validFrom: string; source?: string; note?: string | null },
): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ftp_history")
    .insert({
      profile_id: profileId,
      ftp_watt: entry.ftpWatt,
      valid_from: entry.validFrom,
      source: entry.source || "ramp-test",
      note: entry.note || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}
