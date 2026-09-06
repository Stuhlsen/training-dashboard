import { supabase, getAuthedClient } from "./client";
import type { CoachExchange, CoachExchangePreset, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS = "id, athlete_id, created_by, preset, raw_response, proposal_group_id, created_at";

interface CoachExchangeRow {
  id: string;
  athlete_id: string;
  created_by: string;
  preset: CoachExchangePreset;
  raw_response: string;
  proposal_group_id: string | null;
  created_at: string;
}

/** Row-Mapping snake_case -> camelCase. Bewusst OHNE `outcome`: der Join auf
 *  die proposals derselben Gruppe passiert erst im Hook (Etappe B), nicht in
 *  der Zugriffsschicht. */
function toCoachExchange(row: CoachExchangeRow): CoachExchange {
  return {
    id: row.id,
    athleteId: row.athlete_id,
    createdBy: row.created_by,
    preset: row.preset,
    rawResponse: row.raw_response,
    proposalGroupId: row.proposal_group_id,
    createdAt: row.created_at,
  };
}

/** Verlauf der KI-Coach-Runden eines Athleten, neueste zuerst (Migration
 *  0034). RLS lässt nur den Athleten selbst und dessen Trainer durch. */
export async function listCoachExchanges(
  athleteId: string,
): Promise<Result<{ exchanges: CoachExchange[] }>> {
  if (!supabase) return { ok: true, exchanges: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("coach_exchanges")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false })
    .returns<CoachExchangeRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, exchanges: data.map(toCoachExchange) };
}

/** Legt eine Verlaufszeile an — eine je abgeschlossener Copy-Paste-Runde,
 *  beim "Importieren"-Klick (auch bei 0 Vorschlägen, dann
 *  `proposalGroupId: null`). RLS: nur der Athlet selbst für sich
 *  (`created_by = athlete_id = auth.uid()`). */
export async function insertCoachExchange(
  athleteId: string,
  createdBy: string,
  input: { preset: CoachExchangePreset; rawResponse: string; proposalGroupId: string | null },
): Promise<Result<{ exchange: CoachExchange }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("coach_exchanges")
    .insert({
      athlete_id: athleteId,
      created_by: createdBy,
      preset: input.preset,
      raw_response: input.rawResponse,
      proposal_group_id: input.proposalGroupId,
    })
    .select(SELECT_COLS)
    .single<CoachExchangeRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, exchange: toCoachExchange(data) };
}

/** Entfernt eine Verlaufszeile. RLS lässt nur den Athleten selbst seine
 *  eigenen Zeilen löschen (kein Trainer, kein anon). */
export async function deleteCoachExchange(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("coach_exchanges").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
