import {
  getGoals as getGoalsAdapter,
  saveGoal as saveGoalAdapter,
  deactivateGoal as deactivateGoalAdapter,
} from "../data-access/supabase/goals.js";
import { getSession } from "./session.js";

/** Aktive Ziele des eingeloggten Athleten → { ok, goals, error } */
export async function getGoals() {
  const user = getSession();
  if (!user) return { ok: true, goals: [] };
  return getGoalsAdapter(user.id);
}

/** Legt ein neues Ziel für den eingeloggten Athleten an */
export async function saveGoal(goal) {
  const user = getSession();
  if (!user) return { id: null, error: "Nicht eingeloggt" };
  return saveGoalAdapter(user.id, goal);
}

export async function deactivateGoal(goalId) {
  const user = getSession();
  if (!user) return { error: "Nicht eingeloggt" };
  return deactivateGoalAdapter(goalId);
}
