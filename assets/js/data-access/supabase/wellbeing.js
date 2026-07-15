import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };
const SELECT_COLS = "id, date, energy, muscle_feel, mood, note, updated_at";

function toCheckin(row) {
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

export async function upsertToday(athleteId, isoDate, { energy, muscleFeel, mood, note }) {
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
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, checkin: toCheckin(data) };
}

export async function getRange(athleteId, fromIso, toIso) {
  if (!supabase) return { ok: true, checkins: [] };
  const client = await getAuthedClient();
  if (!client) return { ok: true, checkins: [] };
  const { data, error } = await client
    .from("wellbeing")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .gte("date", fromIso)
    .lte("date", toIso)
    .order("date", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, checkins: data.map(toCheckin) };
}
