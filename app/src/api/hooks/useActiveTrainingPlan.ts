/* ============================================================
   API/HOOKS/USEACTIVETRAININGPLAN.TS — die aktive `training_plans`-Zeile
   des angezeigten Athleten (Fahrplan 8 E6; von E7 für das dynamische
   plan-week-model weitergenutzt).

   `null`, wenn kein aktiver Plan existiert, der Athlet keinen Account hat
   oder die Zeile für den aktuellen Betrachter nicht lesbar ist
   (`training_plans` hat keinen anon-GRANT). Der „Neuer Plan"-Dialog braucht
   sie nur, um vor dem Ersetzen eines bestehenden Plans zu warnen.
   ============================================================ */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listActiveTrainingPlan } from "../supabase/training-plans";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { qk } from "../keys";
import type { TrainingPlan } from "../types";

export function useActiveTrainingPlan(athleteId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: qk.activeTrainingPlan(athleteId),
    queryFn: async (): Promise<TrainingPlan | null> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) return null;
      const res = await listActiveTrainingPlan(profileId);
      return res.ok ? res.plan : null;
    },
  });
}
