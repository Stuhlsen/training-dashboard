/* ============================================================
   API/HOOKS/USEGOALS.TS — Ziele des eingeloggten Athleten (Settings,
   Etappe 9)

   Port von state/goals.js (Vanilla). Wie ftp-history/export-prefs
   session-gebunden, nicht Athleten-Toggle-gebunden — `athlete_id` in der
   goals-Tabelle IST die Profil-UUID des eingeloggten Users (nur Athleten
   sehen diese Sektion, s. SettingsPage-Gate). Ziele werden nie gelöscht,
   nur deaktiviert (deactivateGoal) — dieselbe Result-Konvention wie überall.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGoals, saveGoal as saveGoalAdapter, deactivateGoal as deactivateGoalAdapter } from "../supabase/goals";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { Goal, GoalInput, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** Aktive Ziele des eingeloggten Profils. */
export function useGoals() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.goals(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async () => unwrap(await getGoals(userId!)).goals,
  });
  return { goals: query.data ?? [], isLoading: query.isLoading };
}

export function useSaveGoal() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.goals(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (goal: GoalInput) => unwrap(await saveGoalAdapter(userId!, goal)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const save = useCallback(
    async (goal: GoalInput): Promise<Result<{ id: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(goal));
    },
    [mutation, userId],
  );

  return { save, isPending: mutation.isPending };
}

export function useDeactivateGoal() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.goals(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (goalId: string) => {
      unwrap(await deactivateGoalAdapter(goalId));
      return { goalId };
    },
    onSuccess: ({ goalId }) => {
      queryClient.setQueryData<Goal[]>(key, (goals) => (goals ?? []).filter((g) => g.id !== goalId));
    },
  });

  const deactivate = useCallback(
    async (goalId: string): Promise<Result<{ goalId: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(goalId));
    },
    [mutation, userId],
  );

  return { deactivate, isPending: mutation.isPending };
}
