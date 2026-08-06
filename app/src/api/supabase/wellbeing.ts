import { supabase, getAuthedClient } from "./client";
import type { Checkin, CheckinInput, Result, SharedCheckin } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS = "id, date, energy, muscle_feel, mood, note, updated_at";
const SHARED_SELECT_COLS = "date, energy, muscle_feel, mood";

interface CheckinRow {
  id: string;
  date: string;
  energy: number;
  muscle_feel: number;
  mood: number;
  note: string | null;
  updated_at: string;
}

interface SharedCheckinRow {
  date: string;
  energy: number;
  muscle_feel: number;
  mood: number;
}

function toCheckin(row: CheckinRow): Checkin {
  return {
    id: row.id,
    date: row.date,
    energy: row.energy,
    muscleFeel: row.muscle_feel,
    mood: row.mood,
    note: row.note,
    updatedAt: row.updated_at,
  };
}

function toSharedCheckin(row: SharedCheckinRow): SharedCheckin {
  return { date: row.date, energy: row.energy, muscleFeel: row.muscle_feel, mood: row.mood };
}

export async function upsertToday(
  athleteId: string,
  isoDate: string,
  { energy, muscleFeel, mood, note }: CheckinInput,
): Promise<Result<{ checkin: Checkin }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("wellbeing")
    .upsert(
      {
        athlete_id: athleteId,
        date: isoDate,
        energy,
        muscle_feel: muscleFeel,
        mood,
        note: note ?? null,
      },
      { onConflict: "athlete_id,date" },
    )
    .select(SELECT_COLS)
    .single<CheckinRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, checkin: toCheckin(data) };
}

export async function getRange(
  athleteId: string,
  fromIso: string,
  toIso: string,
): Promise<Result<{ checkins: Checkin[] }>> {
  if (!supabase) return { ok: true, checkins: [] };
  const client = await getAuthedClient();
  if (!client) return { ok: true, checkins: [] };
  const { data, error } = await client
    .from("wellbeing")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .gte("date", fromIso)
    .lte("date", toIso)
    .order("date", { ascending: true })
    .returns<CheckinRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, checkins: data.map(toCheckin) };
}

/** Liest `wellbeing_shared` für einen BELIEBIGEN Athleten — die öffentliche,
 *  security-definer-View aus 0003_wellbeing.sql (kein `note`, serverseitig
 *  über `wellbeing_is_public()` gefiltert). Anders als getRange() (Basis-
 *  tabelle, nur für den Athleten selbst oder dessen Coach lesbar) für
 *  Betrachter gedacht, die weder das eine noch das andere sind — deshalb
 *  ohne getAuthedClient(), der Singleton-Client reicht. Ein Athlet ohne
 *  aktiven `wellbeing_public`-Toggle liefert schlicht eine leere Liste, von
 *  "kein Eintrag" nicht unterscheidbar. */
export async function getSharedRange(
  athleteId: string,
  fromIso: string,
  toIso: string,
): Promise<Result<{ checkins: SharedCheckin[] }>> {
  if (!supabase) return { ok: true, checkins: [] };
  const { data, error } = await supabase
    .from("wellbeing_shared")
    .select(SHARED_SELECT_COLS)
    .eq("athlete_id", athleteId)
    .gte("date", fromIso)
    .lte("date", toIso)
    .order("date", { ascending: true })
    .returns<SharedCheckinRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, checkins: data.map(toSharedCheckin) };
}
