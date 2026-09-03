import { supabase, getAuthedClient } from "./client";
import type { EventInput, EventItem, EventPatch, EventPriority, EventType, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, title, event_date, type, priority, ftp_goal, is_test, note, " +
  "result_time_s, result_avg_watts, result_place_ag, result_place_overall, " +
  "created_at, updated_at";

interface EventRow {
  id: string;
  title: string;
  event_date: string;
  type: EventType;
  priority: EventPriority | null;
  ftp_goal: number | null;
  is_test: boolean;
  note: string | null;
  result_time_s: number | null;
  result_avg_watts: number | null;
  result_place_ag: number | null;
  result_place_overall: number | null;
  created_at: string;
  updated_at: string;
}

function toEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    type: row.type,
    priority: row.priority,
    ftpGoal: row.ftp_goal,
    isTest: row.is_test,
    note: row.note,
    resultTimeS: row.result_time_s,
    resultAvgWatts: row.result_avg_watts,
    resultPlaceAg: row.result_place_ag,
    resultPlaceOverall: row.result_place_overall,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEvents(athleteId: string): Promise<Result<{ events: EventItem[] }>> {
  if (!supabase) return { ok: true, events: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("events")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("event_date", { ascending: true })
    .returns<EventRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, events: data.map(toEvent) };
}

/** Nächstes zukünftige Event ab `todayIso` (>=), gefiltert auf `type`
 *  (Default "race"). `type: null` explizit übergeben, um den Typ-Filter
 *  aufzuheben — ein `.eq("type", null)` würde in PostgREST "type IS NULL"
 *  statt "kein Filter" bedeuten. */
export async function getNextEvent(
  athleteId: string,
  todayIso: string,
  type: EventType | null = "race",
): Promise<Result<{ event: EventItem | null }>> {
  if (!supabase) return { ok: true, event: null };
  const client = (await getAuthedClient()) ?? supabase;
  let query = client
    .from("events")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(1);
  if (type !== null) query = query.eq("type", type);
  const { data, error } = await query.maybeSingle<EventRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: data ? toEvent(data) : null };
}

export async function createEvent(
  athleteId: string,
  event: EventInput,
): Promise<Result<{ event: EventItem }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  // type='other' verträgt weder priority/ftp_goal/is_test noch die
  // result_*-Felder (CHECK events_priority_only_for_race /
  // events_result_only_for_race) — hier im Adapter nullen, damit JEDER
  // Aufrufer (nicht nur der useCreateEvent-Hook) sauber durchkommt, genau
  // wie updateEvent() es tut.
  const isRace = event.type === "race";
  const { data, error } = await client
    .from("events")
    .insert({
      athlete_id: athleteId,
      title: event.title,
      event_date: event.eventDate,
      type: event.type,
      priority: isRace ? (event.priority ?? null) : null,
      ftp_goal: isRace ? (event.ftpGoal ?? null) : null,
      is_test: isRace ? (event.isTest ?? false) : false,
      note: event.note ?? null,
      result_time_s: isRace ? (event.resultTimeS ?? null) : null,
      result_avg_watts: isRace ? (event.resultAvgWatts ?? null) : null,
      result_place_ag: isRace ? (event.resultPlaceAg ?? null) : null,
      result_place_overall: isRace ? (event.resultPlaceOverall ?? null) : null,
    })
    .select(SELECT_COLS)
    .single<EventRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: toEvent(data) };
}

export async function updateEvent(
  id: string,
  patch: EventPatch,
): Promise<Result<{ event: EventItem }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const updates: Record<string, unknown> = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.eventDate !== undefined) updates.event_date = patch.eventDate;
  if (patch.type !== undefined) updates.type = patch.type;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.ftpGoal !== undefined) updates.ftp_goal = patch.ftpGoal;
  if (patch.isTest !== undefined) updates.is_test = patch.isTest;
  if (patch.note !== undefined) updates.note = patch.note;
  if (patch.resultTimeS !== undefined) updates.result_time_s = patch.resultTimeS;
  if (patch.resultAvgWatts !== undefined) updates.result_avg_watts = patch.resultAvgWatts;
  if (patch.resultPlaceAg !== undefined) updates.result_place_ag = patch.resultPlaceAg;
  if (patch.resultPlaceOverall !== undefined) updates.result_place_overall = patch.resultPlaceOverall;

  // type -> "other" macht priority/ftp_goal/is_test UND die Ergebnisfelder
  // ungültig (Check-Constraints events_priority_only_for_race /
  // events_result_only_for_race) — hier erzwingen statt dem Aufrufer zu
  // überlassen, sonst schlägt ein Patch wie { type: "other" } ohne explizites
  // Nullen am Constraint mit einem generischen Fehler fehl.
  if (updates.type === "other") {
    updates.priority = null;
    updates.ftp_goal = null;
    updates.is_test = false;
    updates.result_time_s = null;
    updates.result_avg_watts = null;
    updates.result_place_ag = null;
    updates.result_place_overall = null;
  }

  const { data, error } = await client
    .from("events")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single<EventRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: toEvent(data) };
}

export async function removeEvent(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
