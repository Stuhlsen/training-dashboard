import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

function toEntry(row) {
  return {
    id: row.id,
    ftpWatt: row.ftp_watt,
    validFrom: row.valid_from,
    source: row.source,
    note: row.note,
  };
}

/** FTP-Historie eines Profils, älteste zuerst (Migration 0009).
 *  @param {string} profileId @returns {Promise<import("../../types.js").Result & {entries?: Array}>} */
export async function getFtpHistory(profileId) {
  if (!supabase) return { ok: true, entries: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ftp_history")
    .select("id, ftp_watt, valid_from, source, note")
    .eq("profile_id", profileId)
    .order("valid_from", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, entries: data.map(toEntry) };
}

/** Legt einen neuen FTP-Historie-Eintrag an (v1: nur anlegen, kein Bearbeiten
 *  bestehender Einträge — RLS lässt ohnehin nur den Athleten selbst zu).
 *  @param {string} profileId
 *  @param {{ftpWatt:number, validFrom:string, source?:string, note?:string|null}} entry
 *  @returns {Promise<import("../../types.js").Result & {id?:string}>} */
export async function saveFtpEntry(profileId, entry) {
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
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}
