/* ============================================================
   FEATURES/PLANNING/USERECOMPUTEPLANGROUP.TS — Schreibpfad für „Plan anpassen"
   bei verknüpften Plänen (Fahrplan 44 E6)

   Dünner React-Hook um `writeGroupRecompute` (group-recompute-write.ts): holt
   das Profil, übergibt NUR die betroffenen Pläne, prüft den Login und lädt die
   Caches neu — auch nach einem Fehler, weil dann evtl. Karten fehlen oder
   wiederhergestellt wurden. Der Ablauf (Sicherung, Schreiben, Wiederherstellen)
   steht im Schreibweg; hier ist keine zweite Logik.

   Der Einzelplan-Weg (useRecomputeRemainingPlan) bleibt unverändert für Pläne
   ohne Gruppe.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useAuthUserId } from "../../api/hooks/useSession";
import { qk } from "../../api/keys";
import { catchResult, ResultError_ } from "../../api/result";
import type { Result } from "../../api/types";
import { writeGroupRecompute, type GroupWriteJob, type GroupWriteResult } from "./group-recompute-write";
import type { GroupBuild } from "./group-recompute-view-model";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};
const SPORTS = ["ride", "run", "swim"] as const;

export function useRecomputePlanGroup(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const invalidate = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }),
        ...SPORTS.map((s) => queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId, s) })),
        queryClient.invalidateQueries({ queryKey: ["plan-group", athleteId] }),
      ]),
    [queryClient, athleteId],
  );

  const mutation = useMutation({
    mutationFn: async (build: GroupBuild): Promise<GroupWriteResult> => {
      // Ein Rechenfehler schreibt nie etwas.
      if (!build.ok) throw new ResultError_({ code: "VALIDATION", message: build.reason });
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);

      const jobs: GroupWriteJob[] = build.items.flatMap((i) =>
        i.affected && i.generated && i.patch
          ? [{ sport: i.sport, plan: i.plan, generated: i.generated, patch: i.patch, replaceFrom: build.replaceFrom }]
          : [],
      );
      try {
        const result = await writeGroupRecompute(profileId, jobs);
        await invalidate();
        return result;
      } catch (err) {
        await invalidate().catch(() => {});
        throw err;
      }
    },
  });

  const recomputeGroup = useCallback(
    async (build: GroupBuild): Promise<Result<GroupWriteResult>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(build));
    },
    [mutation, userId],
  );

  return { recomputeGroup, isPending: mutation.isPending };
}
