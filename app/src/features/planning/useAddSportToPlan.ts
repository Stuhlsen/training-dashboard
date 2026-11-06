/* ============================================================
   FEATURES/PLANNING/USEADDSPORTTOPLAN.TS — Schreibpfad „Sportart hinzufügen"
   (Fahrplan 44 E5)

   Legt EINEN neuen Plan neben den laufenden an. Dieselben Phasen wie „Neuer
   Plan" (plan-write-phases.ts), aber im Modus „nur Neues":
     Phase 1 — neue Plan-Zeile (inaktiv) + Karten. Läuft für die Sportart schon
       ein Plan, bricht sie ab (kein Ersetzen).
     Gruppe  — laufende Pläne ohne Gruppe bekommen die Gruppe des neuen Plans.
       Das ist die EINZIGE Änderung an einem laufenden Plan. Hat er schon eine
       Gruppe, nimmt der neue sie und der laufende Plan wird gar nicht angefasst.
     Phase 2 — neuen Plan scharf schalten (plan-lose Vorlagenkarten der NEUEN
       Sportart werden wie heute aufgeräumt).
   Scheitert etwas, nimmt `rollbackRun` alles zurück, auch die gesetzte Gruppe
   (wieder auf null). Karten, Tage, Ziele und Wochenmodell des laufenden Plans
   bleiben in jedem Fall unberührt.
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useAuthUserId } from "../../api/hooks/useSession";
import { qk } from "../../api/keys";
import { catchResult, ResultError_, toResultError } from "../../api/result";
import { localISODate } from "../../core/format.js";
import {
  activatePlans,
  attachPlanGroup,
  newAddSportRun,
  preparePlans,
  rollbackRun,
  type PlanWriteItem,
} from "./plan-write-phases";
import type { Result, TrainingPlan } from "../../api/types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};

export interface AddSportArgs {
  /** Die laufenden Pläne (nur gelesen; höchstens ihre Gruppe wird gesetzt). */
  runningPlans: ReadonlyArray<Pick<TrainingPlan, "id" | "sport" | "planGroupId">>;
  /** Der neue Plan: gezeigte Vorschau + Input + Formular. */
  item: PlanWriteItem;
}

export function useAddSportToPlan(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async ({ runningPlans, item }: AddSportArgs): Promise<{ planId: string }> => {
      if (runningPlans.length === 0) {
        throw new ResultError_({ code: "VALIDATION", message: "Es gibt keinen laufenden Plan." });
      }
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);

      const run = newAddSportRun(
        profileId,
        localISODate(),
        item,
        runningPlans.map((p) => ({ id: p.id, planGroupId: p.planGroupId ?? null })),
      );

      const invalidate = () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }),
          queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId, run.plans[0].sport) }),
          // Die Gruppe der laufenden Pläne kann sich geändert haben; „Plan anpassen" liest sie aus diesem Cache.
          queryClient.invalidateQueries({ queryKey: qk.planGroups(athleteId) }),
          ...runningPlans.map((p) =>
            queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId, p.sport ?? "ride") }),
          ),
        ]);

      try {
        const [planId] = await preparePlans(run);
        await attachPlanGroup(run);
        await activatePlans(run);
        await invalidate();
        return { planId };
      } catch (err) {
        const rollback = await rollbackRun(run);
        await invalidate().catch(() => {});
        if (!rollback.complete) {
          throw new ResultError_({
            code: "UNKNOWN",
            message: `${toResultError(err).message} — Das Zurücknehmen ist nicht vollständig gelungen. Bitte prüfe deine Pläne und den Kalender.`,
          });
        }
        if (run.touchedExisting) {
          throw new ResultError_({
            code: "UNKNOWN",
            message: `${toResultError(err).message} — Der neue Plan wurde zurückgenommen. Der laufende Plan ist unverändert.`,
          });
        }
        throw err;
      }
    },
  });

  const addSport = useCallback(
    async (args: AddSportArgs): Promise<Result<{ planId: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(args));
    },
    [mutation, userId],
  );

  return { addSport, isPending: mutation.isPending };
}
