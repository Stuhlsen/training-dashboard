/* ============================================================
   API/HOOKS/USERECIPERATINGS.TS — Sterne für freigegebene Rezepte
   (Fahrplan 30 B3; Schicht: UI → Hook → api/supabase/recipe-ratings.ts)

   - useRecipeRatingStats: Schnitt + Anzahl je Rezept (für alle Angemeldeten)
   - useMyRatings:         die eigenen Sterne, je Rezept-ID
   - useRateRecipe:        eigene Bewertung setzen oder zurücknehmen

   Eine Bewertung lädt ["recipes"] neu — damit ändern sich Schnitt, Anzahl und
   die Sortierung "Beste Bewertung" sofort.
   ============================================================ */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteMyRating, listMyRatings, listRatingStats, setMyRating } from "../supabase/recipe-ratings";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { catchResult, unwrap } from "../result";
import { isValidStars } from "../../core/recipe-rating.js";
import type { RecipeRatingStat, Result } from "../types";

/** Stabile Referenzen für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_STATS: RecipeRatingStat[] = [];
const EMPTY_MINE: ReadonlyMap<string, number> = new Map();

/** Schnitt + Anzahl der freigegebenen Rezepte. Schlägt das Laden fehl, bleibt die
 *  Liste leer — die Rezepte selbst werden davon nicht blockiert. */
export function useRecipeRatingStats() {
  const query = useQuery({
    queryKey: qk.recipeRatingStats(),
    staleTime: 60_000,
    queryFn: async () => unwrap(await listRatingStats()).stats,
  });
  return { stats: query.data ?? EMPTY_STATS, isLoading: query.isLoading, isError: query.isError };
}

/** Eigene Sterne als Map Rezept-ID → Sterne. Ohne Anmeldung leer. */
export function useMyRatings() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.myRecipeRatings(userId ?? "anonymous"),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => unwrap(await listMyRatings(userId!)).ratings,
  });
  const data = query.data;
  const mine = useMemo(() => (data ? new Map(data.map((r) => [r.recipeId, r.stars])) : EMPTY_MINE), [data]);
  return { mine, isLoading: !!userId && query.isLoading, isError: query.isError };
}

type RateVars = { recipeId: string; stars: number | null };

/** Eigene Bewertung setzen (`stars` 1–5) oder zurücknehmen (`null`). */
export function useRateRecipe() {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async ({ recipeId, stars }: RateVars) => {
      if (stars === null) return unwrap(await deleteMyRating(recipeId, userId!));
      return unwrap(await setMyRating(recipeId, userId!, stars));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
  });

  const run = useCallback(
    async (vars: RateVars): Promise<Result> => {
      if (!userId) return { ok: false, error: { code: "TOKEN_INVALID", message: "Nicht eingeloggt" } };
      if (vars.stars !== null && !isValidStars(vars.stars)) {
        return { ok: false, error: { code: "SCHEMA", message: "Sterne müssen zwischen 1 und 5 liegen." } };
      }
      return catchResult(() => mutation.mutateAsync(vars));
    },
    [mutation, userId],
  );

  const rate = useCallback((recipeId: string, stars: number) => run({ recipeId, stars }), [run]);
  const unrate = useCallback((recipeId: string) => run({ recipeId, stars: null }), [run]);

  return { rate, unrate, isPending: mutation.isPending };
}
