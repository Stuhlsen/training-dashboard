/* ============================================================
   API/HOOKS/USENUTRITIONGOALS.TS — Ernährungsziele
   (nutrition_goals, append-only) — Fahrplan 23 E5

   Muster wie useGoals.ts, aber für die append-only Tabelle
   nutrition_goals. Die aktuell gültige Zeile ist die mit der
   neuesten created_at.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getActiveNutritionGoal as getActiveNutritionGoalAdapter,
  addNutritionGoal as addNutritionGoalAdapter,
} from "../supabase/nutrition-goals";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { NutritionGoalInput, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** Das aktuell gültige Ernährungsziel des eingeloggten Profils. */
export function useActiveNutritionGoal() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.nutritionGoals(userId ?? "anonymous"),
    enabled: !!userId,
    queryFn: async () => unwrap(await getActiveNutritionGoalAdapter(userId!)).goal,
  });
  return { goal: query.data ?? null, isLoading: query.isLoading };
}

/** Legt ein neues Ernährungsziel an (append-only). */
export function useAddNutritionGoal() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const key = qk.nutritionGoals(userId ?? "anonymous");

  const mutation = useMutation({
    mutationFn: async (input: NutritionGoalInput) =>
      unwrap(await addNutritionGoalAdapter(userId!, input)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const add = useCallback(
    async (input: NutritionGoalInput): Promise<Result<{ id: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(input));
    },
    [mutation, userId],
  );

  return { add, isPending: mutation.isPending };
}