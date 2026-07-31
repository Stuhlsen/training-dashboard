import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };
const SELECT_COLS = "id, title, event_date, type, priority, ftp_goal, note, created_at, updated_at";

function toEvent(row) {
  return {
    id: row.id,
    title: row.title,
    eventDate: row.event_date,
    type: row.type,
    priority: row.priority,
    ftpGoal: row.ftp_goal,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEvents(athleteId) {
  if (!supabase) return { ok: true, events: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("events")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("event_date", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, events: data.map(toEvent) };
}

/** Nächstes zukünftige Event ab `todayIso` (>=), gefiltert auf `type`
 *  (Default "race" — Countdown/"Nächste Einheit"-Karte interessieren sich
 *  nur für Rennen/Touren, s. docs/phase-2-konzept-event-verwaltung.md Abschnitt 6).
 *  `type: null` explizit übergeben, um den Typ-Filter aufzuheben (nächstes
 *  Event egal welcher Art) — ein einfaches `.eq("type", null)` würde in
 *  Supabase/PostgREST "type IS NULL" statt "kein Filter" bedeuten.
 *  `todayIso` wird vom Aufrufer übergeben statt hier berechnet, analog zu
 *  wellbeing.js::getToday. */
export async function getNextEvent(athleteId, todayIso, type = "race") {
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
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: data ? toEvent(data) : null };
}

export async function createEvent(athleteId, event) {
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
      note: event.note ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: toEvent(data) };
}

export async function updateEvent(id, patch) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const updates = {};
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.eventDate !== undefined) updates.event_date = patch.eventDate;
  if (patch.type !== undefined) updates.type = patch.type;
  if (patch.priority !== undefined) updates.priority = patch.priority;
  if (patch.ftpGoal !== undefined) updates.ftp_goal = patch.ftpGoal;
  if (patch.note !== undefined) updates.note = patch.note;

  // type -> "other" macht priority/ftp_goal ungültig (Check-Constraint
  // events_priority_only_for_race) — hier erzwingen statt dem Aufrufer
  // zu überlassen, sonst schlägt ein Patch wie { type: "other" } ohne
  // explizites priority/ftpGoal:null am Constraint mit einem generischen
  // Fehler fehl.
  if (updates.type === "other") {
    updates.priority = null;
    updates.ftp_goal = null;
  }

  const { data, error } = await client
    .from("events")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, event: toEvent(data) };
}

export async function removeEvent(id) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
