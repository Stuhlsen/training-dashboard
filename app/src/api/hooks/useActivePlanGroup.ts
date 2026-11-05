/* ============================================================
   API/HOOKS/USEACTIVEPLANGROUP.TS — alle aktiven Pläne einer Plan-Gruppe
   (Fahrplan 44 E6, „Plan anpassen" für verknüpfte Pläne)

   `planGroupId` fehlt → kein Read, leere Liste (Pläne ohne Gruppe verhalten
   sich wie bisher). Wie `useActiveTrainingPlan`: ohne Login gesperrt, weil
   `training_plans` keinen anon-GRANT hat.
   ============================================================ */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listPlanGroup } from "../supabase/training-plans";
import { fetchAthleteProfileId } from "./useAthleteProfileId";
import { useAuthUserId } from "./useSession";
import { qk } from "../keys";
import type { TrainingPlan } from "../types";

const NO_PLANS: TrainingPlan[] = [];

export function useActivePlanGroup(athleteId: string, planGroupId: string | null | undefined) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();
  const query = useQuery({
    queryKey: qk.planGroup(athleteId, planGroupId ?? ""),
    enabled: !!userId && !!planGroupId,
    queryFn: async (): Promise<TrainingPlan[]> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId || !planGroupId) return NO_PLANS;
      const res = await listPlanGroup(profileId, planGroupId);
      return res.ok ? res.plans : NO_PLANS;
    },
  });
  return { plans: query.data ?? NO_PLANS, isLoading: !!planGroupId && query.isLoading };
}
