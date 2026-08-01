import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

function toFormat(row) {
  return {
    id: row.id,
    label: row.label,
    targetSystem: row.target_system,
    currency: row.currency,
    evidenceGrade: row.evidence_grade,
    blockTargets: row.block_targets ?? [],
    axes: row.axes,
  };
}

function toAthleteFormat(row) {
  return { id: row.id, formatId: row.format_id, active: row.active };
}

/** Formatkatalog (D4, Migration 0014) — öffentlich lesbar, kein Login nötig.
 *  @returns {Promise<import("../../types.js").Result & {formats?: Array}>} */
export async function getSessionFormats() {
  if (!supabase) return { ok: true, formats: [] };
  const { data, error } = await supabase.from("session_formats").select("id, label, target_system, currency, evidence_grade, block_targets, axes");
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, formats: data.map(toFormat) };
}

/** Welche Formate für ein Profil aktiv/inaktiv gesetzt sind (D2, L1.1).
 *  @param {string} profileId
 *  @returns {Promise<import("../../types.js").Result & {athleteFormats?: Array}>} */
export async function getAthleteFormats(profileId) {
  if (!supabase) return { ok: true, athleteFormats: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client.from("athlete_formats").select("id, format_id, active").eq("profile_id", profileId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, athleteFormats: data.map(toAthleteFormat) };
}

/** Setzt/upsertet den Aktiv-Status eines Formats für ein Profil.
 *  @param {string} profileId @param {string} formatId @param {boolean} active
 *  @returns {Promise<import("../../types.js").Result>} */
export async function setAthleteFormatActive(profileId, formatId, active) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client
    .from("athlete_formats")
    .upsert({ profile_id: profileId, format_id: formatId, active }, { onConflict: "profile_id,format_id" });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
