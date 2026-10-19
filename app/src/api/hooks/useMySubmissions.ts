/* ============================================================
   API/HOOKS/USEMYSUBMISSIONS.TS — eigene Rezept-Einreichungen
   (Fahrplan 25, S2b; Tabelle recipes, gelesen über den Supabase-Adapter)

   Alle Status (pending/approved/rejected) des eingeloggten Profils. Der Key
   beginnt mit "recipes", deshalb invalidiert jede Einreichen-/Ändern-/
   Zurückziehen-Mutation die Liste mit.
   ============================================================ */

import { useQuery } from "@tanstack/react-query";
import { listMySubmissions } from "../supabase/recipes";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import { unwrap } from "../result";
import type { Recipe } from "../types";

/** Stabile Referenz für "noch nichts geladen" (s. useFtpHistory.ts). */
const EMPTY_SUBMISSIONS: Recipe[] = [];

export function useMySubmissions() {
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.mySubmissions(userId ?? "anonymous"),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => unwrap(await listMySubmissions(userId!)).recipes,
  });
  return {
    recipes: query.data ?? EMPTY_SUBMISSIONS,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
