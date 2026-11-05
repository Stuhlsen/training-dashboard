/* ============================================================
   FEATURES/PLANNING/USEGOALPLANCONTEXT.TS — Ziele für den Plan (Fahrplan 43 E5)

   Bündelt, was Planungsseite und „Plan anpassen" gemeinsam brauchen: die Ziele
   des eingeloggten Athleten (nur wenn der angezeigte Athlet er selbst ist —
   `goals` ist session-gebunden und owner-only) und das Zwischenziel aus dem
   Ziel-Check als Ziel-FTP-Vorschlag. Rechnen tut core/, Regeln stehen in
   goal-plan-view-model.ts.
   ============================================================ */

import { useMemo } from "react";
import { useGoals } from "../../api/hooks/useGoals";
import { useAthleteConfig } from "../../api/hooks/useAthleteConfig";
import { useRides } from "../../api/hooks/useRides";
import { useIsSelfAthlete } from "../../api/hooks/useWriteAuthorization";
import { localISODate } from "../../core/format.js";
import { mergedEftpHistory } from "../settings/goals-view-model";
import { ftpTargetSuggestion } from "./goal-plan-view-model";
import { resolveMeasuredFtp } from "./new-plan-dialog-view-model";
import { useFtpHistoryEntries } from "./useFtpHistoryEntries";
import type { Goal, Sport } from "../../api/types";
import type { Ride, WellnessDay } from "../../types.js";

const NO_GOALS: readonly Goal[] = [];

export interface GoalPlanContext {
  /** Aktive Ziele; leer, wenn der angezeigte Athlet nicht der eingeloggte ist. */
  goals: readonly Goal[];
  /** Zwischenziel (W) aus assessFtpGoal() — nur Rad, nur bei ok, sonst null. */
  interimFtp: number | null;
  isLoading: boolean;
}

export function useGoalPlanContext(athleteId: string, sport: Sport): GoalPlanContext {
  const { goals: ownGoals, isLoading: goalsLoading } = useGoals();
  const { isSelf, isLoading: selfLoading } = useIsSelfAthlete(athleteId);
  const cfg = useAthleteConfig(athleteId);
  const { data: rideData } = useRides(athleteId);
  const ftpHistoryEntries = useFtpHistoryEntries(athleteId);

  const goals = isSelf ? ownGoals : NO_GOALS;
  const rides = rideData?.rides as Ride[] | undefined;
  const wellness = rideData?.wellness as WellnessDay[] | undefined;
  const todayISO = localISODate();
  const current = resolveMeasuredFtp(cfg, ftpHistoryEntries, todayISO).ftpMeasured;

  const interimFtp = useMemo(
    () =>
      ftpTargetSuggestion({
        goals,
        sport,
        current,
        history: mergedEftpHistory(rides ?? [], wellness ?? []),
        todayISO,
      }),
    [goals, sport, current, rides, wellness, todayISO],
  );

  return { goals, interimFtp, isLoading: goalsLoading || selfLoading };
}
