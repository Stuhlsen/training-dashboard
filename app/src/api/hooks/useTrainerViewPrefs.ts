/* ============================================================
   API/HOOKS/USETRAINERVIEWPREFS.TS — Kacheln-Auswahl der Trainer-Leiste
   (Etappe 7a)

   Port von state/trainer-view.js::loadCategories()/saveCategories()
   (Vanilla). `setCategories` schreibt optimistisch: der Cache wird VOR dem
   `await setViewPrefs(...)` gesetzt, bewusst OHNE Rollback bei Fehler — ein
   Speicherfehler ist kein Grund, die gerade gewählte Ansicht wieder
   zurückzudrehen (Vanilla-Kommentar 1:1 übernommen). Persistenz ist hier
   ein Komfort-Detail (nächster Besuch zeigt dieselbe Auswahl), kein
   sicherheitsrelevanter Zustand.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getViewPrefs, setViewPrefs } from "../supabase/trainer-view-prefs";
import { qk } from "../keys";
import { unwrap } from "../result";

/** @param trainerId auth.uid() des eingeloggten Trainers
 *  @param athleteProfileId Supabase-Profil-UUID des betrachteten Athleten
 *    (aus useTrainerContext()) */
export function useTrainerViewPrefs(trainerId: string | null, athleteProfileId: string | null) {
  const queryClient = useQueryClient();
  const enabled = !!trainerId && !!athleteProfileId;
  const key = qk.trainerViewPrefs(trainerId ?? "anonymous", athleteProfileId ?? "none");

  const query = useQuery({
    queryKey: key,
    enabled,
    queryFn: async (): Promise<string[]> =>
      unwrap(await getViewPrefs(trainerId!, athleteProfileId!)).categories ?? [],
  });

  const mutation = useMutation({
    mutationFn: async (next: string[]) => {
      queryClient.setQueryData<string[]>(key, next);
      return unwrap(await setViewPrefs(trainerId!, athleteProfileId!, next));
    },
  });

  const setCategories = useCallback(
    (next: string[]) => {
      if (!enabled) return;
      mutation.mutate(next);
    },
    [enabled, mutation],
  );

  return { categories: query.data ?? [], setCategories, isLoading: query.isLoading };
}
