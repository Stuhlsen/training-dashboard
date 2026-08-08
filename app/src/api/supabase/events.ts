import { supabase, getAuthedClient } from "./client";
import type { EventInput, EventItem, EventPatch, EventPriority, EventType, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, title, event_date, type, priority, ftp_goal, is_test, note, created_at, updated_at";

interface EventRow {
  id: string;
  title: string;
  event_date: string;
  type: EventType;
  priority: EventPriority | null;
  ftp_goal: number | null;
  is_test: boolean;
  note: string | null;
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
  const { data, error } = await client
    .from("events")
    .insert({
      athlete_id: athleteId,
      title: event.title,
      event_date: event.eventDate,
      type: event.type,
      priority: event.priority ?? null,
      ftp_goal: event.ftpGoal ?? null,
      is_test: event.isTest ?? false,
      note: event.note ?? null,
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

  // type -> "other" macht priority/ftp_goal/is_test ungültig (Check-Constraint
  // events_priority_only_for_race) — hier erzwingen statt dem Aufrufer zu
  // überlassen, sonst schlägt ein Patch wie { type: "other" } ohne explizites
  // priority/ftpGoal/isTest:null am Constraint mit einem generischen Fehler fehl.
  if (updates.type === "other") {
    updates.priority = null;
    updates.ftp_goal = null;
    updates.is_test = false;
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
