/* ============================================================
   API/HOOKS/USERECIPES.TS — genehmigter Rezept-Pool
   (Tabelle recipes, Fahrplan 23 E6 PR A)

   Gemeinsame Bibliothek, nicht profilgebunden: `listRecipes()` liefert
   standardmäßig nur `status = approved`. Der Intoleranz-Filter
   (core/nutrition.js::filterByIntolerances) läuft NICHT hier, sondern
   beim Aufrufer — der Hook liefert den ungefilterten Pool.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { listRecipes } from "../supabase/recipes";
import { qk } from "../keys";
import { unwrap } from "../result";
import type { Recipe } from "../types";

/** Stabile Referenz für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_RECIPES: Recipe[] = [];

/** Alle genehmigten Rezepte. Die Bibliothek ändert sich selten → 10 Minuten
 *  frisch genug. */
export function useRecipes() {
  const query = useQuery({
    queryKey: qk.recipes("approved"),
    staleTime: 10 * 60_000,
    queryFn: async () => unwrap(await listRecipes()).recipes,
  });
  return {
    recipes: query.data ?? EMPTY_RECIPES,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
