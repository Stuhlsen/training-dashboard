import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };

function toEntry(row) {
  return {
    id: row.id,
    formatId: row.format_id,
    step: row.step,
    validFrom: row.valid_from,
    reason: row.reason,
    sourceRideId: row.source_ride_id,
  };
}

/** Leiterhistorie eines Profils, alle Formate gemeinsam (D2, Migration 0015).
 *  @param {string} profileId @returns {Promise<import("../../types.js").Result & {history?: Array}>} */
export async function getLadderHistory(profileId) {
  if (!supabase) return { ok: true, history: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("ladder_history")
    .select("id, format_id, step, valid_from, reason, source_ride_id")
    .eq("profile_id", profileId)
    .order("valid_from", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, history: data.map(toEntry) };
}

/** Neuer Leiterstand-Eintrag. In diesem Fenster (D2/D3) nur mit
 *  `reason: "manual"|"block-start"` aus UI-Code aufgerufen — die
 *  compliance-getriebenen `reason`-Werte (`compliance-green`/`-red`)
 *  bleiben dem lokalen Trockenlauf (scripts/backtest-ladder.js) vorbehalten,
 *  der NICHT über diesen Adapter schreibt (C3.1: kein Live-Schreibweg an
 *  plan_cards vorbei).
 *  @param {string} profileId
 *  @param {{formatId:string, step:number, reason:string, sourceRideId?:string|null, validFrom:string}} entry
 *  `validFrom` ist Pflicht (kein Default hier — data-access/ importiert nur
 *  Typen aus core/, s. Schichtenregel; das "heute"-Datum liefert der
 *  Aufrufer in state/ladder.js über core/format.js::localISODate()).
 *  @returns {Promise<import("../../types.js").Result & {id?:string}>} */
export async function recordLadderStep(profileId, entry) {
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
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}
