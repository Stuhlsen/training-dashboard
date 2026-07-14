import {
  getGoals as getGoalsAdapter,
  saveGoal as saveGoalAdapter,
  deactivateGoal as deactivateGoalAdapter,
} from "../data-access/supabase/goals.js";
import { getSession } from "./session.js";

/** Aktive Ziele des eingeloggten Athleten */
export async function getGoals() {
  const user = getSession();
  if (!user) return [];
  return getGoalsAdapter(user.id);
}

/** Legt ein neues Ziel für den eingeloggten Athleten an */
export async function saveGoal(goal) {
  const user = getSession();
  if (!user) return { id: null, error: "Nicht eingeloggt" };
  return saveGoalAdapter(user.id, goal);
}

export async function deactivateGoal(goalId) {
  return deactivateGoalAdapter(goalId);
}
