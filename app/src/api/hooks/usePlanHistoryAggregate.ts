/* ============================================================
   API/HOOKS/USEPLANHISTORYAGGREGATE.TS — V3 HistoryAggregate für den
   Trainingsplan-Generator (Fahrplan 8 E4).

   Dünner Hook: lädt die Lesedaten des BETRACHTETEN Athleten (Fahrten +
   Wellness aus `useRides`, Plan-Karten aus `usePlanCards`) und reicht sie
   zusammen mit Alter/eFTP-Fallback aus `config.ts` an die reine
   `core/plan-history.js::buildHistoryAggregate()` weiter. Keine Logik hier.

   Liefert immer ein vollständiges Aggregat — solange die Quellen laden,
   `emptyHistory()` mit bekanntem Alter/eFTP-Fallback (nie `undefined`),
   damit der E5-Dialog keinen Ladezustand behandeln muss. `isLoading` sagt
   nur, ob die Zahlen noch dünn sind.
   ============================================================ */

import { useMemo } from "react";
import { useRides } from "./useRides";
import { usePlanCards } from "./usePlanCards";
import { athleteConfig } from "../../config";
import { localISODate } from "../../core/format.js";
import { buildHistoryAggregate } from "../../core/plan-history.js";

type Ride = import("../../types.js").Ride;
type WellnessDay = import("../../types.js").WellnessDay;

export function usePlanHistoryAggregate(athleteId: string) {
  const { data: athleteData, isLoading: ridesLoading } = useRides(athleteId);
  const { data: planCards, isLoading: cardsLoading } = usePlanCards(athleteId);
  const cfg = athleteConfig(athleteId);
  const ageYears = cfg?.bmr?.age ?? null;
  const eftpFallback = cfg?.eFTP ?? null;

  const aggregate = useMemo(
    () =>
      buildHistoryAggregate({
        rides: (athleteData?.rides as Ride[] | undefined) ?? [],
        wellness: (athleteData?.wellness as WellnessDay[] | undefined) ?? [],
        planCards: planCards ?? null,
        todayISO: localISODate(),
        ageYears,
        eftpFallback,
        powerCurves: (athleteData?.powerCurves as object | null) ?? null,
      }),
    [athleteData, planCards, ageYears, eftpFallback],
  );

  return { aggregate, isLoading: ridesLoading || cardsLoading };
}
