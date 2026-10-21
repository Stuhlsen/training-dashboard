import { supabase, getAuthedClient } from "./client";
import type { Result } from "../types";

/** Fahrplan 26: `training_rides` (Migration 0078) — eine Zeile je Fahrt, die
 *  komplette Fahrt in der Payload-Form liegt in `data`. */

const PAGE = 1000;

interface RideRow {
  data: unknown;
}

/** Alle Fahrten eines Profils in Payload-Form, älteste zuerst (wie der Sync
 *  sie in `rides*.json` schreibt: nach Datum, Gleichstand nach Startzeit).
 *  PostgREST kappt Antworten bei 1000 Zeilen → seitenweise lesen. Ein RLS-
 *  Verbot liefert KEINEN Fehler, sondern leere Zeilen — die Unterscheidung
 *  „keine Daten" vs. „nicht erlaubt" trifft darum der Aufrufer über die
 *  Profil-Zeile (`getTrainingProfileData`), die dieselbe Regel trägt. */
export async function getTrainingRides(profileId: string): Promise<Result<{ rides: unknown[] }>> {
  if (!supabase) return { ok: true, rides: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const rides: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("training_rides")
      .select("data")
      .eq("profile_id", profileId)
      .order("ride_date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("ride_key", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<RideRow[]>();
    if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
    const rows = data ?? [];
    rides.push(...rows.map((r) => r.data));
    if (rows.length < PAGE) return { ok: true, rides };
  }
}
