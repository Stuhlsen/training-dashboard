import { supabase, getAuthedClient } from "./client";
import type { Goal, GoalInput, GoalKey, GoalRole, Result } from "../types";

const NOT_CONFIGURED = { code: "UNKNOWN" as const, message: "Supabase nicht konfiguriert" };

interface GoalRow {
  id: string;
  kind: string;
  target_value: number | null;
  target_date: string | null;
  note: string | null;
  is_active: boolean;
  goal_key: GoalKey | null;
  role: GoalRole | null;
}

function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    kind: row.kind,
    targetValue: row.target_value,
    targetDate: row.target_date,
    note: row.note,
    isActive: row.is_active,
    goalKey: row.goal_key ?? null,
    role: row.role ?? null,
  };
}

/** Aktive Ziele eines Athleten, älteste zuerst (Port von
 *  data-access/supabase/goals.js::getGoals()). */
export async function getGoals(athleteId: string): Promise<Result<{ goals: Goal[] }>> {
  if (!supabase) return { ok: true, goals: [] };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("goals")
    .select("id, kind, target_value, target_date, note, is_active, goal_key, role")
    .eq("athlete_id", athleteId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, goals: (data as GoalRow[]).map(toGoal) };
}

export async function saveGoal(athleteId: string, goal: GoalInput): Promise<Result<{ id: string }>> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { data, error } = await client
    .from("goals")
    .insert({
      athlete_id: athleteId,
      kind: goal.kind,
      target_value: goal.targetValue ?? null,
      target_date: goal.targetDate ?? null,
      note: goal.note ?? null,
      goal_key: goal.goalKey ?? null,
      role: goal.role ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true, id: data.id };
}

async function setGoalActive(goalId: string, isActive: boolean): Promise<Result> {
  if (!supabase) return { ok: false, error: NOT_CONFIGURED };
  const client = (await getAuthedClient()) ?? supabase;
  const { error } = await client.from("goals").update({ is_active: isActive }).eq("id", goalId);
  if (error) return { ok: false, error: { code: "UNKNOWN", message: error.message } };
  return { ok: true };
}

/** Ziele werden nie gelöscht, nur deaktiviert — wie im Vanilla-Original. */
export function deactivateGoal(goalId: string): Promise<Result> {
  return setGoalActive(goalId, false);
}

/** Ersetzt das aktive Ziel einer Rolle (Fahrplan 43 E4). Der partielle
 *  Unique-Index (0084) erlaubt je Athlet nur ein aktives main und ein aktives
 *  side — das neue Ziel kann also erst nach dem Deaktivieren des alten
 *  gespeichert werden. Scheitert das Speichern, wird das alte Ziel wieder
 *  aktiviert und der Speicherfehler gemeldet. Ohne `oldGoalId` (Rolle frei)
 *  wird nur gespeichert. Kein echter Transaktionsschutz (zwei Requests):
 *  scheitert auch das Reaktivieren, sagt die Meldung das offen. */
export async function replaceGoal(
  athleteId: string,
  oldGoalId: string | null,
  goal: GoalInput,
): Promise<Result<{ id: string }>> {
  if (!oldGoalId) return saveGoal(athleteId, goal);

  const deactivated = await setGoalActive(oldGoalId, false);
  if (!deactivated.ok) return deactivated;

  const saved = await saveGoal(athleteId, goal);
  if (saved.ok) return saved;

  const restored = await setGoalActive(oldGoalId, true);
  if (restored.ok) return saved;
  return {
    ok: false,
    error: {
      code: saved.error.code,
      message: `${saved.error.message} — das bisherige Ziel blieb inaktiv (${restored.error.message}).`,
    },
  };
}
