/* ============================================================
   FEATURES/PLANNING/USERECOMPUTEREMAININGPLAN.TS — Schreibpfad für „Rest neu
   berechnen" (Fahrplan 8 E13).

   Anders als „Plan neu erzeugen" (E6, `useCreateTrainingPlan`) bleibt hier
   DIESELBE `training_plans`-Zeile bestehen: nur ihre künftigen Karten werden
   ersetzt und `week_model` / `params` ziehen auf den frisch gerechneten
   Schwanz nach. Kein neues Event, kein `is_active`-Flip, kein neuer
   Zeilen-Rollback.

   REIHENFOLGE:
     1. Zukunfts-Karten des Plans ab `regenerateFrom` löschen (nur noch
        geplante — Vergangenes / Ausgefallenes bleibt, s.
        deleteFuturePlanCardsForPlan).
     2. die neu gerechneten Tail-Karten schreiben (eingefrorene Wochen tragen
        `cards: []` → flattenPlanCards liefert nur den Schwanz).
     3. `training_plans.week_model` + `params` aktualisieren.
     4. Caches invalidieren.
   Löschen VOR Einfügen: gleiche Daten unter derselben `plan_id` lägen sonst
   doppelt, und der Zukunfts-Delete träfe die frisch eingefügten Karten.

   FEHLERBEHANDLUNG: Schlägt Schritt 2/3 fehl, sind die alten Zukunfts-Karten
   schon weg (nicht rückholbar — der Nutzer hat dem im Dialog zugestimmt).
   Ein erneuter Anlauf baut sie neu. Wie in E6 kein echtes Transaktions-
   Rollback (bräuchte eine Postgres-RPC).
   ============================================================ */

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createPlanCards,
  deleteFuturePlanCardsForPlan,
} from "../../api/supabase/plan-cards";
import { updateTrainingPlan } from "../../api/supabase/training-plans";
import { fetchAthleteProfileId } from "../../api/hooks/useAthleteProfileId";
import { useAuthUserId } from "../../api/hooks/useSession";
import { qk } from "../../api/keys";
import { catchResult, ResultError_, toResultError, unwrap } from "../../api/result";
import { localISODate } from "../../core/format.js";
import { flattenPlanCards } from "./plan-persist";
import type { GeneratedPlan, PlanGeneratorInput } from "./new-plan-dialog-view-model";
import type { Result, TrainingPlan, WeekModelEntry } from "../../api/types";

const NOT_LOGGED_IN = { code: "UNKNOWN" as const, message: "Nicht eingeloggt" };
const NO_ACCOUNT = {
  code: "NO_DATA" as const,
  message: "Athlet hat (noch) keinen Supabase-Account",
};
const NO_REGEN_DATE = {
  code: "UNKNOWN" as const,
  message: "Startwoche der Neuberechnung fehlt",
};

export interface RecomputeRemainingPlanArgs {
  /** Die aktive `training_plans`-Zeile (liefert `id` + bisherige `params`). */
  plan: TrainingPlan;
  /** Ausgabe von `generatePlan()` mit `regenerateFrom` (die gezeigte Vorschau). */
  generated: GeneratedPlan;
  /** Der an `generatePlan()` übergebene V2-Input (trägt `regenerateFrom`/`history`). */
  input: PlanGeneratorInput;
}

export function useRecomputeRemainingPlan(athleteId: string) {
  const queryClient = useQueryClient();
  const userId = useAuthUserId();

  const mutation = useMutation({
    mutationFn: async (args: RecomputeRemainingPlanArgs): Promise<{ planId: string }> => {
      const profileId = await fetchAthleteProfileId(queryClient, athleteId);
      if (!profileId) throw new ResultError_(NO_ACCOUNT);
      const regenerateFrom = args.input.regenerateFrom;
      if (!regenerateFrom) throw new ResultError_(NO_REGEN_DATE);
      const planId = args.plan.id;

      let deletedFuture = false;
      try {
        unwrap(await deleteFuturePlanCardsForPlan(planId, regenerateFrom));
        deletedFuture = true;

        unwrap(await createPlanCards(profileId, planId, flattenPlanCards(args.generated)));

        const params = {
          ...(args.plan.params ?? {}),
          history: (args.input.history as unknown) ?? null,
          warnings: args.generated.warnings,
          recomputedAt: localISODate(),
          recomputedFrom: regenerateFrom,
        };
        unwrap(
          await updateTrainingPlan(planId, {
            weekModel: (args.generated.weekModel ?? []) as WeekModelEntry[],
            params,
          }),
        );

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.planCards(athleteId) }),
          queryClient.invalidateQueries({ queryKey: qk.activeTrainingPlan(athleteId) }),
        ]);

        return { planId };
      } catch (err) {
        await queryClient
          .invalidateQueries({ queryKey: qk.planCards(athleteId) })
          .catch(() => {});
        if (deletedFuture) {
          throw new ResultError_({
            code: "UNKNOWN",
            message: `${toResultError(err).message} — die alten künftigen Karten sind evtl. schon entfernt. Bitte den Plan prüfen und „Rest neu berechnen" erneut ausführen.`,
          });
        }
        throw err;
      }
    },
  });

  const recompute = useCallback(
    async (args: RecomputeRemainingPlanArgs): Promise<Result<{ planId: string }>> => {
      if (!userId) return { ok: false, error: NOT_LOGGED_IN };
      return catchResult(() => mutation.mutateAsync(args));
    },
    [mutation, userId],
  );

  return { recompute, isPending: mutation.isPending };
}
