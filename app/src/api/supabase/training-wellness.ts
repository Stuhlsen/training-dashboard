import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

/** Fahrplan 26: `training_wellness` (Migration 0078) — eine Zeile je Tag, der
 *  komplette Tag in Payload-Form liegt in `data`. */

const PAGE = 1000;

interface WellnessRow {
  data: unknown;
}

/** Alle Wellness-Tage eines Profils in Payload-Form, ältester zuerst.
 *  Seitenweise, weil PostgREST bei 1000 Zeilen kappt. */
export async function getTrainingWellness(
  profileId: string,
): Promise<Result<{ wellness: unknown[] }>> {
  if (!supabase) return { ok: true, wellness: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const wellness: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("training_wellness")
      .select("data")
      .eq("profile_id", profileId)
      .order("day", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<WellnessRow[]>();
    if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
    const rows = data ?? [];
    wellness.push(...rows.map((r) => r.data));
    if (rows.length < PAGE) return { ok: true, wellness };
  }
}
