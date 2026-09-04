import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, getAuthedClient } from "./client";
import type { PlanCard, PlanCardInput, PlanCardPatch, Result, WorkoutJson } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };
const SELECT_COLS =
  "id, planned_date, sort_order, title, workout_type, km, duration_min, tss_planned, " +
  "status, note, workout, workout_structure, cancel_reason, moved_from_date, previous_date, move_reason, week, phase, " +
  "pushed_external_id, created_at, updated_at";

interface PlanCardRow {
  id: string;
  planned_date: string;
  sort_order: number;
  title: string | null;
  workout_type: string | null;
  km: number | null;
  duration_min: number | null;
  tss_planned: number | null;
  status: string | null;
  note: string | null;
  workout: WorkoutJson;
  workout_structure: WorkoutJson;
  cancel_reason: string | null;
  moved_from_date: string | null;
  previous_date: string | null;
  move_reason: string | null;
  week: string | null;
  phase: string | null;
  pushed_external_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Mapped eine plan_cards-Zeile auf exakt die Session-Shape, die in der
 *  Vanilla-Version core/planning.js::applyAdjustment() produziert hat — die
 *  Feldnamen bleiben, damit die portierte core-Schicht (Etappe 2a) und die
 *  Karten-UI (Etappe 6) unverändert darauf rechnen können. */
function toPlanCard(row: PlanCardRow): PlanCard {
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
    workoutStructure: row.workout_structure,
    originalDate: row.moved_from_date || undefined,
    previousDate: row.previous_date || undefined,
    movedReason: row.move_reason || undefined,
    cancelled: row.status === "ausgefallen" || undefined,
    cancelReason: row.cancel_reason || undefined,
    pushedExternalId: row.pushed_external_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPlanCards(athleteId: string): Promise<Result<{ cards: PlanCard[] }>> {
  if (!supabase) return { ok: true, cards: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .select(SELECT_COLS)
    .eq("athlete_id", athleteId)
    .order("planned_date", { ascending: true })
    .order("sort_order", { ascending: true })
    .returns<PlanCardRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, cards: data.map(toPlanCard) };
}

/** Patch-Update für Move/Cancel/Undo/Karten-Bearbeitung/Push — alle Aufrufer
 *  schicken nur die Felder, die sie tatsächlich ändern (ein Move z.B. nie
 *  title/workout), das `!== undefined`-Muster hält das entkoppelt. */
export async function updatePlanCard(
  id: string,
  patch: PlanCardPatch,
): Promise<Result<{ card: PlanCard }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const updates: Record<string, unknown> = {};
  if (patch.plannedDate !== undefined) updates.planned_date = patch.plannedDate;
  if (patch.sortOrder !== undefined) updates.sort_order = patch.sortOrder;
  if (patch.movedFromDate !== undefined) updates.moved_from_date = patch.movedFromDate;
  if (patch.previousDate !== undefined) updates.previous_date = patch.previousDate;
  if (patch.moveReason !== undefined) updates.move_reason = patch.moveReason;
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.cancelReason !== undefined) updates.cancel_reason = patch.cancelReason;
  if (patch.title !== undefined) updates.title = patch.title;
  if (patch.typ !== undefined) updates.workout_type = patch.typ;
  if (patch.tssPlanned !== undefined) updates.tss_planned = patch.tssPlanned;
  if (patch.km !== undefined) updates.km = patch.km;
  if (patch.details !== undefined) updates.note = patch.details;
  if (patch.workout !== undefined) updates.workout = patch.workout;
  if (patch.workoutStructure !== undefined) updates.workout_structure = patch.workoutStructure;
  if (patch.pushedExternalId !== undefined) updates.pushed_external_id = patch.pushedExternalId;
  if (patch.week !== undefined) updates.week = patch.week;
  if (patch.phase !== undefined) updates.phase = patch.phase;

  const { data, error } = await client
    .from("plan_cards")
    .update(updates)
    .eq("id", id)
    .select(SELECT_COLS)
    .single<PlanCardRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toPlanCard(data) };
}

/** Legt eine neue Karte an. `sortOrder` berechnet der Aufrufer (der Hook)
 *  aus den bereits geladenen Karten desselben Tages, damit diese Schicht
 *  keine Kenntnis vom übrigen Zustand braucht. */
export async function createPlanCard(
  athleteId: string,
  card: PlanCardInput,
): Promise<Result<{ card: PlanCard }>> {
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
      workout_structure: card.workoutStructure ?? null,
    })
    .select(SELECT_COLS)
    .single<PlanCardRow>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, card: toPlanCard(data) };
}

/** Eine Tageskarte für den Bulk-Insert eines erzeugten Plans (Fahrplan 8 E6).
 *  Feldnamen wie `PlanCardInput`, plus `week`/`phase`/`sortOrder` (die der
 *  Generator liefert) — `plan_id` hängt `createPlanCards()` an. */
export interface PlanCardBulkDraft {
  date: string;
  name: string;
  typ: string;
  phase: string | null;
  week: string | null;
  tssPlanned: number | null;
  durationMin: number | null;
  km: number | null;
  workout: WorkoutJson;
  workoutStructure: WorkoutJson;
  sortOrder: number;
}

/** Schreibt alle Karten eines erzeugten Plans in einem `insert` — mit
 *  `plan_id`-Rückverweis, `week`/`phase` und `sort_order`. Leere Liste ist
 *  ein erfolgreicher No-Op. Gibt die angelegten Karten in derselben
 *  Session-Shape zurück wie `listPlanCards()`. */
export async function createPlanCards(
  athleteId: string,
  planId: string,
  cards: PlanCardBulkDraft[],
): Promise<Result<{ cards: PlanCard[] }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  if (!cards.length) return { ok: true, cards: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .insert(
      cards.map((c) => ({
        athlete_id: athleteId,
        plan_id: planId,
        planned_date: c.date,
        sort_order: c.sortOrder,
        title: c.name,
        workout_type: c.typ,
        tss_planned: c.tssPlanned ?? null,
        duration_min: c.durationMin ?? null,
        km: c.km ?? null,
        week: c.week ?? null,
        phase: c.phase ?? null,
        workout: c.workout ?? null,
        workout_structure: c.workoutStructure ?? null,
      })),
    )
    .select(SELECT_COLS)
    .returns<PlanCardRow[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, cards: data.map(toPlanCard) };
}

/** „Noch geplant" = eine Karte, die „Plan (neu) erzeugen" ersetzen darf:
 *  Status leer oder `"geplant"`. Ausgefallene (`"ausgefallen"`) und alles
 *  mit eigenem Status bleiben stehen (Entscheidung 16) — genau wie
 *  Vergangenes. */
function isReplaceablePlanCard(status: string | null): boolean {
  return status == null || status === "geplant";
}

const DELETE_ID_CHUNK = 100;

/** Löscht Karten in Blöcken von `DELETE_ID_CHUNK` IDs. Ein 40-Wochen-Plan
 *  hat ~160 Karten; ein einziges `id=in.(<160 UUIDs>)` bläht die URL auf
 *  ~6 kB und läuft am Self-Host-Stack (nginx/Caddy, ~8 kB URI-Limit) in
 *  ein 414. */
async function deleteCardsByIds(
  client: SupabaseClient,
  ids: string[],
): Promise<Result<{ deleted: number }>> {
  for (let i = 0; i < ids.length; i += DELETE_ID_CHUNK) {
    const { error } = await client
      .from("plan_cards")
      .delete()
      .in("id", ids.slice(i, i + DELETE_ID_CHUNK));
    if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  }
  return { ok: true, deleted: ids.length };
}

/** Zukünftige (`planned_date >= fromDateISO`), noch geplante Karten EINES
 *  Plans löschen — für „Plan neu erzeugen" (Entscheidung 16). Zwei Schritte
 *  (IDs holen, dann chunk-weise `.in()` löschen), weil „ersetzbar" (Status
 *  null ODER `"geplant"`) sich in JS sauberer prüfen lässt als über eine
 *  PostgREST-Negation. */
export async function deleteFuturePlanCardsForPlan(
  planId: string,
  fromDateISO: string,
): Promise<Result<{ deleted: number }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .select("id, status")
    .eq("plan_id", planId)
    .gte("planned_date", fromDateISO)
    .returns<{ id: string; status: string | null }[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const ids = data.filter((r) => isReplaceablePlanCard(r.status)).map((r) => r.id);
  if (!ids.length) return { ok: true, deleted: 0 };
  return deleteCardsByIds(client, ids);
}

/** Zukünftige, noch geplante Karten OHNE Plan-Zuordnung (`plan_id IS NULL`)
 *  eines Athleten löschen — die eingefrorenen Code-Vorlagen-Karten, damit
 *  der erste selbst gebaute Plan nicht doppelt im Raster steht.
 *
 *  Übergangslösung bis E8: der Sync schreibt die Vorlagen-Karten beim
 *  nächsten Lauf sonst wieder; ab E8 überspringt er die Vorlage für Athleten
 *  mit aktivem Plan und das hier wird zum reinen Erstlauf-Aufräumer. */
export async function deleteFuturePlanlessPlanCards(
  athleteId: string,
  fromDateISO: string,
): Promise<Result<{ deleted: number }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("plan_cards")
    .select("id, status")
    .eq("athlete_id", athleteId)
    .is("plan_id", null)
    .gte("planned_date", fromDateISO)
    .returns<{ id: string; status: string | null }[]>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  const ids = data.filter((r) => isReplaceablePlanCard(r.status)).map((r) => r.id);
  if (!ids.length) return { ok: true, deleted: 0 };
  return deleteCardsByIds(client, ids);
}

/** ALLE Karten eines Plans löschen — Rollback-Pfad, wenn ein mehrstufiges
 *  „Plan übernehmen" nach dem Karten-Insert scheitert. */
export async function deletePlanCardsForPlan(planId: string): Promise<Result<{ deleted: number }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("plan_cards").delete().eq("plan_id", planId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, deleted: 0 };
}

export async function removePlanCard(id: string): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("plan_cards").delete().eq("id", id);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}
