/* ============================================================
   API/HOOKS/USERECIPEVOTES.TS — Rezepte in Prüfung mit Daumen
   (Fahrplan 30 B4; Schicht: UI → Hook → api/supabase/recipes.ts + recipe-votes.ts)

   - usePendingRecipes: Rezepte mit status = pending, mit Daumen-Zahlen
   - useMyVotes:        die eigenen Daumen, je Rezept-ID
   - useVoteRecipe:     eigenen Daumen setzen oder ändern (kein Zurücknehmen)

   Ein Daumen lädt ["recipes"] neu — damit ändern sich die Zahlen sofort.
   Daumen sind nur eine Meinung für den Admin; hier steht keine Freigabe-Logik.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listRecipes } from "../supabase/recipes";
import { listMyVotes, listVoteStats, setMyVote } from "../supabase/recipe-votes";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import { isValidVote, withVoteStats } from "../../core/recipe-votes.js";
import type { MyRecipeVote, Recipe, RecipeVote, RecipeVoteStat, Result } from "../types";

/** Stabile Referenzen für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_RECIPES: Recipe[] = [];
const EMPTY_STATS: RecipeVoteStat[] = [];
const EMPTY_MINE: ReadonlyMap<string, RecipeVote> = new Map();

/** Rezepte in Prüfung, mit Daumen-Zahlen. Die Zahlen laden getrennt und blockieren die
 *  Liste nicht: fehlen sie, stehen dort "noch keine Daumen". */
export function usePendingRecipes() {
  const recipesQuery = useQuery({
    queryKey: qk.recipes("pending"),
    staleTime: 60_000,
    queryFn: async () => unwrap(await listRecipes({ status: "pending" })).recipes,
  });
  const statsQuery = useQuery({
    queryKey: qk.recipeVoteStats(),
    staleTime: 60_000,
    queryFn: async () => unwrap(await listVoteStats()).stats,
  });
  const base = recipesQuery.data;
  const stats = statsQuery.data ?? EMPTY_STATS;
  const recipes = useMemo(
    () => (base && base.length > 0 ? (withVoteStats(base, stats) as Recipe[]) : EMPTY_RECIPES),
    [base, stats],
  );
  return {
    recipes,
    isLoading: recipesQuery.isLoading,
    isError: recipesQuery.isError,
    statsFailed: statsQuery.isError,
    refetch: recipesQuery.refetch,
  };
}

/** Eigene Daumen als Map Rezept-ID → Daumen. Ohne Anmeldung leer. */
export function useMyVotes() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.myRecipeVotes(userId ?? "anonymous"),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => unwrap(await listMyVotes(userId!)).votes,
  });
  const data: MyRecipeVote[] | undefined = query.data;
  const mine = useMemo(() => (data ? new Map(data.map((v) => [v.recipeId, v.vote])) : EMPTY_MINE), [data]);
  return { mine, isLoading: !!userId && query.isLoading, isError: query.isError };
}

type VoteVars = { recipeId: string; vote: RecipeVote };

/** Eigenen Daumen setzen oder ändern. */
export function useVoteRecipe() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async ({ recipeId, vote }: VoteVars) => unwrap(await setMyVote(recipeId, userId!, vote)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const vote = useCallback(
    async (recipeId: string, value: RecipeVote): Promise<Result> => {
      if (!userId) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
      if (!isValidVote(value)) {
        return { ok: false, error: { code: "SCHEMA", message: "Der Daumen muss hoch oder runter sein." } };
      }
      return catchResult(() => mutation.mutateAsync({ recipeId, vote: value }));
    },
    [mutation, userId],
  );

  return { vote, isPending: mutation.isPending };
}
