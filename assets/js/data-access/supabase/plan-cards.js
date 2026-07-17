import { supabase, getAuthedClient } from "./client.js";

const NOT_CONFIGURED = { code: "UNKNOWN", message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, planned_date, sort_order, title, workout_type, km, duration_min, tss_planned, " +
  "status, note, workout, cancel_reason, moved_from_date, move_reason, week, phase, " +
  "pushed_external_id, created_at, updated_at";

/** Mapped eine plan_cards-Zeile auf exakt die Session-Shape, die bisher
 *  core/planning.js::applyAdjustment() produziert hat — ui/planned.js's
 *  bestehende Render-/Filter-/Sortierlogik (sessions/doneSessions/
 *  missedSessions/cancelledSessions, Wochen-Gruppierung, _renderCard/
 *  _renderDoneCard) bleibt dadurch unverändert, nur die Datenquelle
 *  wechselt. */
function toSession(row) {
  return {
    id: row.id,
    date: row.planned_date,
    sortOrder: row.sort_order,
    name: row.title,
    typ: row.workout_type,
    km: row.km,
    durationMin: row.duration_min,
    tssPlanned: row.tss_planned,
    week: row.week,
    phase: row.phase,
    details: row.note,
    workout: row.workout,
    originalDate: row.moved_from_date || undefined,
    movedReason: row.move_reason || undefined,
    cancelled: row.status === "ausgefallen" || undefined,
    cancelReason: row.cancel_reason || undefined,
    pushedExternalId: row.pushed_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPlanCards(athleteId) {
  if (!supabase) return { ok: true, cards: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("planned_date", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, cards: data.map(toSession) };
}

/** Patch-Update für Move/Cancel/Undo/Karten-Bearbeitung/Push — alle Aufrufer
 *  schicken nur die Felder, die sie tatsächlich ändern (movePlanCard z.B.
 *  nie title/workout), das `!== undefined`-Muster hält das entkoppelt. */
export async function updatePlanCard(id, patch) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const updates = {};
  if (patch.plannedDate !== undefined) updates.planned_date = patch.plannedDate;
  if (patch.movedFromDate !== undefined) updates.moved_from_date = patch.movedFromDate;
  if (patch.moveReason !== undefined) updates.move_reason = patch.moveReason;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.cancelReason !== undefined) updates.cancel_reason = patch.cancelReason;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.typ !== undefined) updates.workout_type = patch.typ;
  if (patch.tssPlanned !== undefined) updates.tss_planned = patch.tssPlanned;
  if (patch.km !== undefined) updates.km = patch.km;
  if (patch.details !== undefined) updates.note = patch.details;
  if (patch.workout !== undefined) updates.workout = patch.workout;
  if (patch.pushedExternalId !== undefined) updates.pushed_external_id = patch.pushedExternalId;
  if (patch.week !== undefined) updates.week = patch.week;
  if (patch.phase !== undefined) updates.phase = patch.phase;

  const { data, error } = await client
    .from("plan_cards")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toSession(data) };
}

/** Legt eine neue Karte an — `card` in der Session-Shape (s. toSession()),
 *  `sortOrder` wird vom Aufrufer (state/plan-cards.js) berechnet, damit die
 *  data-access-Schicht keine Kenntnis vom übrigen geladenen State braucht. */
export async function createPlanCard(athleteId, card) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .insert({
      athlete_id: athleteId,
      planned_date: card.date,
      sort_order: card.sortOrder ?? 0,
      title: card.name,
      workout_type: card.typ,
      tss_planned: card.tssPlanned ?? null,
      km: card.km ?? null,
      note: card.details ?? null,
      workout: card.workout ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toSession(data) };
}

export async function removePlanCard(id) {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("plan_cards").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
