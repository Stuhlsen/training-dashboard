import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

/** Feedback eines eingeloggten Testers — geht unfreigegeben in die
 *  `feedback`-Tabelle (Migration 0001, Fahrplan 15 ID4). `athlete_id` ist
 *  immer der eingeloggte User selbst, kein anonymer Weg. Freigabe/Anzeige
 *  ist Admin-Sache und liegt außerhalb dieser Etappe. */
export async function submitFeedback(athleteId: string, message: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("feedback").insert({ athlete_id: athleteId, message });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
