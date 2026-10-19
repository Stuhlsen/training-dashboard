/* ============================================================
   FEATURES/NUTRITION/USENUTRITIONDAY.TS — Tagesziel eines Tages
   (Fahrplan 23, E6 PR A)

   Orchestrierung: sammelt Profil-Basisdaten, Wellness, aktives
   Ernährungsziel, Plan-Karten und FTP und reicht sie an die reine
   Funktion `buildNutritionDay` weiter (nutrition-day-model.ts). Die
   Regeln (Gewichtsquelle, Körperfett nur gemessen, Ruhetag) leben dort
   und sind dort getestet.
   ============================================================ */

import { useMemo } from "react";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { useRides } from "../../api/hooks/useRides";
import { useActiveNutritionGoal } from "../../api/hooks/useNutritionGoals";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { athleteConfig } from "../../config";
import { currentFtpEntry } from "../../core/ftp-history.js";
import { effectiveSex } from "../../core/profile-sex.js";
import type { PlanCard } from "../../api/types";
import {
  buildNutritionDay,
  type NutritionDay,
  type NutritionWellnessDay,
} from "./nutrition-day-model";

const EMPTY_WELLNESS: readonly NutritionWellnessDay[] = [];
const EMPTY_CARDS: readonly PlanCard[] = [];

/** Tagesziel für `dateISO` des angezeigten Athleten. `day` ist `null`, solange
 *  die Profil-Basisdaten noch laden. */
export function useNutritionDay(athleteId: string, dateISO: string) {
  const basics = useProfileBasics();
  const rides = useRides(athleteId);
  const { goal, isLoading: goalLoading } = useActiveNutritionGoal();
  // allSports: die Rad-Karten sind für die Trainingsenergie nötig, egal welcher
  // Sport im Umschalter steht (die Filterung auf "ride" macht das Modell).
  const cards = usePlanCards(athleteId, { allSports: true });
  const { entries: ftpEntries } = useFtpHistory();

  const wellness = (rides.data?.wellness as NutritionWellnessDay[] | undefined) ?? EMPTY_WELLNESS;
  const planCards = cards.data ?? EMPTY_CARDS;
  const basicsData = basics.data;

  const ftpWatts = useMemo(() => {
    // Wie der Hero: Ramp-Test-Eintrag aus ftp_history, sonst der Wert aus config.ts
    const entry = currentFtpEntry(ftpEntries, dateISO, "ramp-test") as { ftpWatt: number } | null;
    return entry?.ftpWatt ?? athleteConfig(athleteId)?.ftpMeasured ?? null;
  }, [ftpEntries, dateISO, athleteId]);

  const day: NutritionDay | null = useMemo(() => {
    if (!basicsData) return null;
    return buildNutritionDay({
      dateISO,
      profile: {
        heightCm: basicsData.heightCm,
        birthdate: basicsData.birthdate,
        weightKg: basicsData.weightKg,
        sex: effectiveSex(basicsData.gender, basicsData.sex),
      },
      wellness,
      goal,
      cards: planCards,
      ftpWatts,
    });
  }, [basicsData, dateISO, wellness, goal, planCards, ftpWatts]);

  return {
    day,
    isLoading: basics.isLoading || rides.isLoading || cards.isLoading || goalLoading,
  };
}
