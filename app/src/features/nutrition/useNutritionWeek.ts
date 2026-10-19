/* ============================================================
   FEATURES/NUTRITION/USENUTRITIONWEEK.TS — Daten der Wochenansicht
   (Fahrplan 23, E6 PR B)

   Orchestrierung: holt die Daten WIE useNutritionDay (Profil, Wellness,
   Ernährungsziel, Plan-Karten, FTP) genau einmal und rechnet
   `buildNutritionDay` für jeden der 7 Tage ab heute. Dazu der
   Essensplan der Woche, der genehmigte Rezept-Pool und die Banner.
   Hooks dürfen nicht in einer Schleife laufen — deshalb ein Hook für
   die ganze Woche statt sieben Aufrufe von useNutritionDay.
   ============================================================ */

import { useMemo } from "react";
import { useProfileBasics } from "../../api/hooks/useProfile";
import { useRides } from "../../api/hooks/useRides";
import { useActiveNutritionGoal } from "../../api/hooks/useNutritionGoals";
import { usePlanCards } from "../../api/hooks/usePlanCards";
import { useFtpHistory } from "../../api/hooks/useFtpHistory";
import { useMealPlan } from "../../api/hooks/useMealPlan";
import { useRecipes } from "../../api/hooks/useRecipes";
import { athleteConfig } from "../../config";
import { currentFtpEntry } from "../../core/ftp-history.js";
import { effectiveSex } from "../../core/profile-sex.js";
import type { PlanCard } from "../../api/types";
import { buildNutritionDay, type NutritionDay, type NutritionWellnessDay } from "./nutrition-day-model";
import { buildBanners, weekDates } from "./nutrition-week-model";

const EMPTY_WELLNESS: readonly NutritionWellnessDay[] = [];
const EMPTY_CARDS: readonly PlanCard[] = [];
const NO_INTOLERANCES: readonly string[] = [];

export function useNutritionWeek(athleteId: string, todayISO: string) {
  const dates = useMemo(() => weekDates(todayISO), [todayISO]);
  const basics = useProfileBasics();
  const rides = useRides(athleteId);
  const { goal, isLoading: goalLoading } = useActiveNutritionGoal();
  const cards = usePlanCards(athleteId, { allSports: true });
  const { entries: ftpEntries } = useFtpHistory();
  const plan = useMealPlan(dates[0], dates[dates.length - 1]);
  const { recipes, isLoading: recipesLoading } = useRecipes();

  const wellness = (rides.data?.wellness as NutritionWellnessDay[] | undefined) ?? EMPTY_WELLNESS;
  const planCards = cards.data ?? EMPTY_CARDS;
  const basicsData = basics.data;

  const ftpWatts = useMemo(() => {
    // Wie der Hero: Ramp-Test-Eintrag aus ftp_history, sonst der Wert aus config.ts
    const entry = currentFtpEntry(ftpEntries, todayISO, "ramp-test") as { ftpWatt: number } | null;
    return entry?.ftpWatt ?? athleteConfig(athleteId)?.ftpMeasured ?? null;
  }, [ftpEntries, todayISO, athleteId]);

  const days: NutritionDay[] = useMemo(() => {
    if (!basicsData) return [];
    return dates.map((dateISO) =>
      buildNutritionDay({
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
      }),
    );
  }, [basicsData, dates, wellness, goal, planCards, ftpWatts]);

  const banners = useMemo(() => {
    const first = days[0];
    return buildBanners({
      todayISO,
      wellness,
      cards: planCards,
      ftpWatts,
      target: first?.ok ? first.target : null,
    });
  }, [days, todayISO, wellness, planCards, ftpWatts]);

  const recipesById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  return {
    dates,
    days,
    entries: plan.entries,
    recipes,
    recipesById,
    intolerances: basicsData?.intolerances ?? NO_INTOLERANCES,
    banners,
    isLoading: basics.isLoading || rides.isLoading || cards.isLoading || goalLoading || plan.isLoading || recipesLoading,
  };
}
