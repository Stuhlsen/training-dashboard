/* ============================================================
   API/HOOKS/USERECIPES.TS — genehmigter Rezept-Pool
   (Tabelle recipes, Fahrplan 23 E6 PR A)

   Gemeinsame Bibliothek, nicht profilgebunden: `listRecipes()` liefert
   standardmäßig nur `status = approved`. Der Intoleranz-Filter
   (core/nutrition.js::filterByIntolerances) läuft NICHT hier, sondern
   beim Aufrufer — der Hook liefert den ungefilterten Pool.
   ============================================================ */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listRecipes } from "../supabase/recipes";
import { qk } from "../keys";
import { unwrap } from "../result";
import { withRatingStats } from "../../core/recipe-rating.js";
import { useRecipeRatingStats } from "./useRecipeRatings";
import type { Recipe } from "../types";

/** Stabile Referenz für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_RECIPES: Recipe[] = [];

/** Alle genehmigten Rezepte, mit Schnitt und Anzahl der Sterne (Fahrplan 30 B3).
 *  Die Bibliothek ändert sich selten → 10 Minuten frisch genug. Die Sterne laden
 *  getrennt und blockieren die Liste nicht: fehlen sie, steht dort "noch nicht
 *  bewertet". */
export function useRecipes() {
  const query = useQuery({
    queryKey: qk.recipes("approved"),
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(await listRecipes()).recipes,
  });
  const { stats } = useRecipeRatingStats();
  const base = query.data;
  const recipes = useMemo(
    () => (base && base.length > 0 ? (withRatingStats(base, stats) as Recipe[]) : EMPTY_RECIPES),
    [base, stats],
  );
  return {
    recipes,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
