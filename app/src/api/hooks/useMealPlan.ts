/* ============================================================
   API/HOOKS/USEMEALPLAN.TS — Essensplan des eingeloggten Profils
   (meal_plan_entries, Migration 0064 — Fahrplan 23 E6 PR A)

   Muster wie useNutritionGoals.ts. Der Essensplan hängt an der
   auth.uid() (E28: Ernährung zeigt nur eigene Daten), nicht am
   Athleten-Toggle — `athlete_id` der Tabelle ist die Profil-UUID.
   Schreiben darf nur der Eigentümer (RLS); jeder Schreibzugriff
   invalidiert alle Zeiträume des Profils.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteMealPlanEntry as deleteMealPlanEntryAdapter,
  listMealPlan,
  upsertMealPlanEntry as upsertMealPlanEntryAdapter,
} from "../supabase/meal-plan";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import type { MealPlanEntry, MealPlanEntryInput, Result } from "../types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };

/** Stabile Referenz für "noch nichts geladen" — `query.data ?? []` lieferte
 *  sonst bei jedem Render ein neues Array (s. useFtpHistory.ts). */
const EMPTY_ENTRIES: MealPlanEntry[] = [];

/** Einträge des eingeloggten Profils im Zeitraum [fromISO, toISO]. */
export function useMealPlan(fromISO: string, toISO: string) {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.mealPlan(userId ?? "anonymous", fromISO, toISO),
    enabled: !!userId,
    queryFn: async () => unwrap(await listMealPlan(userId!, fromISO, toISO)).entries,
  });
  return { entries: query.data ?? EMPTY_ENTRIES, isLoading: query.isLoading };
}

/** Setzt das Rezept eines Slots (Upsert). `athleteId` kommt aus der Session. */
export function useUpsertMealPlanEntry() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (input: Omit<MealPlanEntryInput, "athleteId">) =>
      unwrap(await upsertMealPlanEntryAdapter({ ...input, athleteId: userId! })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.mealPlanAll(userId ?? "anonymous") });
    },
  });

  const upsert = useCallback(
    async (input: Omit<MealPlanEntryInput, "athleteId">): Promise<Result<{ entry: MealPlanEntry }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(input));
    },
    [mutation, userId],
  );

  return { upsert, isPending: mutation.isPending };
}

/** Löscht einen Eintrag. */
export function useDeleteMealPlanEntry() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (id: string) => unwrap(await deleteMealPlanEntryAdapter(id)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.mealPlanAll(userId ?? "anonymous") });
    },
  });

  const remove = useCallback(
    async (id: string): Promise<Result> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(id));
    },
    [mutation, userId],
  );

  return { remove, isPending: mutation.isPending };
}
